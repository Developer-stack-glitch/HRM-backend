const { pool } = require('../Config/dbConfig');

/**
 * Evaluates a payroll formula with recursive lookups and token replacement.
 * @param {string} formulaStr The formula to evaluate (e.g. "{Basic}*0.9")
 * @param {Object} context Pre-calculated values (e.g. { CTC: 5000, Basic: 2000 })
 * @param {Object} definitions Map of all formula/component definitions for lookups
 * @param {number} depth Recursion depth tracking
 * @returns {number} The calculated value
 */
const evaluateFormula = (formulaStr, context, definitions, depth = 0) => {
    if (depth > 10) throw new Error('Circular dependency detected in formulas');

    const tokens = formulaStr.match(/\{[^}]+\}/g) || [];
    let evalString = formulaStr;

    for (const token of tokens) {
        const identifier = token.slice(1, -1).trim();

        // Check context first
        if (context[identifier] !== undefined) {
            evalString = evalString.replace(token, context[identifier]);
            continue;
        }

        // Lookup definition
        const def = definitions[identifier];
        if (!def) {
            // If not found in definitions or context, default to 0 to prevent crashes
            evalString = evalString.replace(token, 0);
            continue;
        }

        if (def.type === 'fixed') {
            const val = Number(def.value) || 0;
            context[identifier] = val;
            evalString = evalString.replace(token, val);
        } else if (def.type === 'formula') {
            const subResult = evaluateFormula(def.value, context, definitions, depth + 1);
            context[identifier] = subResult;
            evalString = evalString.replace(token, subResult);
        }
    }

    try {
        // Clean up remaining brackets if any
        let mathExpr = evalString.replace(/\{|\}/g, '');

        // Support for percentage sign (e.g. "50%" -> "/100 * 50")
        // We match a number followed by a % sign and convert it to (Number/100)
        mathExpr = mathExpr.replace(/([0-9.]+)\s*%/g, '($1/100)');

        // eslint-disable-next-line no-eval
        return eval(mathExpr) || 0;
    } catch (e) {
        console.error('Formula Eval Error:', e.message, 'for string:', evalString);
        return 0;
    }
};

/**
 * Fetches all necessary definitions from DB to prepare for multiple evaluations.
 * @param {number} companyId 
 */
const getDefinitions = async (companyId) => {
    const definitions = {};

    // 1. From salary_formulas
    const [formulaRows] = await pool.execute('SELECT name, formula FROM salary_formulas WHERE company_id = ?', [companyId]);
    formulaRows.forEach(f => {
        definitions[f.name.trim()] = { type: 'formula', value: f.formula };
    });

    // 2. From salary_components
    const [componentRows] = await pool.execute('SELECT name, calculation_type, calculation_value FROM salary_components WHERE company_id = ? AND is_active = 1', [companyId]);
    componentRows.forEach(c => {
        const typeStr = c.calculation_type?.toLowerCase();
        if (typeStr === 'fixed') {
            definitions[c.name.trim()] = { type: 'fixed', value: c.calculation_value };
        } else if (typeStr === 'formula') {
            definitions[c.name.trim()] = { type: 'formula', value: c.calculation_value };
        }
    });

    return definitions;
};

module.exports = {
    evaluateFormula,
    getDefinitions
};
