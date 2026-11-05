const { pool } = require('../Config/dbConfig');

/**
 * Safe Arithmetic Expression Evaluator
 * Replaces dangerous eval() with a deterministic Recursive Descent Math Parser.
 * Strictly allows only numbers, decimal points, parentheses, and arithmetic operators: +, -, *, /, %
 * Completely prevents any code execution or access to JavaScript runtime / global scope.
 */
class SafeMathEvaluator {
    constructor(expression) {
        this.tokens = this.tokenize(expression);
        this.pos = 0;
    }

    tokenize(expr) {
        const tokens = [];
        let i = 0;
        const str = expr.trim();

        while (i < str.length) {
            const ch = str[i];

            if (/\s/.test(ch)) {
                i++;
                continue;
            }

            if ('+-*/%()'.includes(ch)) {
                tokens.push({ type: 'OP', value: ch });
                i++;
                continue;
            }

            if (/[0-9.]/.test(ch)) {
                let numStr = '';
                while (i < str.length && /[0-9.]/.test(str[i])) {
                    numStr += str[i];
                    i++;
                }
                const num = parseFloat(numStr);
                if (isNaN(num)) {
                    throw new Error(`Invalid number literal in expression: "${numStr}"`);
                }
                tokens.push({ type: 'NUM', value: num });
                continue;
            }

            throw new Error(`Forbidden character "${ch}" detected in formula. Only numbers and mathematical operators (+, -, *, /, %) are allowed.`);
        }

        tokens.push({ type: 'EOF', value: null });
        return tokens;
    }

    peek() {
        return this.tokens[this.pos];
    }

    consume(expectedValue) {
        const token = this.peek();
        if (expectedValue && token.value !== expectedValue) {
            throw new Error(`Expected "${expectedValue}", found "${token.value}"`);
        }
        this.pos++;
        return token;
    }

    parse() {
        const result = this.parseExpression();
        if (this.peek().type !== 'EOF') {
            throw new Error(`Unexpected trailing token: "${this.peek().value}"`);
        }
        return result;
    }

    // Expression: Term (( '+' | '-' ) Term)*
    parseExpression() {
        let left = this.parseTerm();

        while (this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
            const op = this.consume().value;
            const right = this.parseTerm();
            if (op === '+') left += right;
            else if (op === '-') left -= right;
        }

        return left;
    }

    // Term: Factor (( '*' | '/' | '%' ) Factor)*
    parseTerm() {
        let left = this.parseFactor();

        while (this.peek().type === 'OP' && (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')) {
            const op = this.consume().value;
            const right = this.parseFactor();
            if (op === '*') {
                left *= right;
            } else if (op === '/') {
                if (right === 0) {
                    left = 0; // Avoid division by zero crash, default safely to 0
                } else {
                    left /= right;
                }
            } else if (op === '%') {
                left = (right === 0) ? 0 : (left % right);
            }
        }

        return left;
    }

    // Factor: Unary | '(' Expression ')' | NUM
    parseFactor() {
        const token = this.peek();

        // Handle unary + or -
        if (token.type === 'OP' && (token.value === '+' || token.value === '-')) {
            this.consume();
            const factor = this.parseFactor();
            return token.value === '-' ? -factor : factor;
        }

        if (token.type === 'OP' && token.value === '(') {
            this.consume('(');
            const val = this.parseExpression();
            this.consume(')');
            return val;
        }

        if (token.type === 'NUM') {
            this.consume();
            return token.value;
        }

        throw new Error(`Syntax error near "${token.value || 'end of expression'}"`);
    }
}

/**
 * Evaluates a payroll formula safely with recursive lookups and token replacement.
 * @param {string} formulaStr The formula to evaluate (e.g. "{Basic}*0.9" or "{Basic} + 50%")
 * @param {Object} context Pre-calculated values (e.g. { CTC: 5000, Basic: 2000 })
 * @param {Object} definitions Map of all formula/component definitions for lookups
 * @param {number} depth Recursion depth tracking
 * @returns {number} The calculated numerical value
 */
const evaluateFormula = (formulaStr, context = {}, definitions = {}, depth = 0) => {
    if (typeof formulaStr !== 'string' || formulaStr.trim() === '') {
        return 0;
    }

    if (depth > 10) {
        throw new Error('Circular dependency detected in formulas');
    }

    const tokens = formulaStr.match(/\{[^}]+\}/g) || [];
    let evalString = formulaStr;

    for (const token of tokens) {
        const identifier = token.slice(1, -1).trim();

        // 1. Check pre-calculated context first
        if (context[identifier] !== undefined) {
            evalString = evalString.replace(token, Number(context[identifier]) || 0);
            continue;
        }

        // 2. Lookup definition in components/formulas map
        const def = definitions[identifier];
        if (!def) {
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
        // Strip any remaining curly braces
        let mathExpr = evalString.replace(/\{|\}/g, '').trim();

        // Convert percentage syntax: "50%" -> "(50/100)"
        mathExpr = mathExpr.replace(/([0-9.]+)\s*%/g, '($1/100)');

        if (!mathExpr) return 0;

        // Execute safe deterministic evaluation with zero eval()
        const evaluator = new SafeMathEvaluator(mathExpr);
        const result = evaluator.parse();
        
        return Number.isFinite(result) ? Math.round(result * 100) / 100 : 0;
    } catch (e) {
        console.error('Safe Formula Evaluation Error:', e.message, 'for input expression:', formulaStr);
        return 0;
    }
};

/**
 * Fetches all necessary definitions from DB to prepare for multiple evaluations.
 * @param {number} companyId 
 */
const getDefinitions = async (companyId) => {
    const definitions = {};

    try {
        // 1. From salary_formulas
        const [formulaRows] = await pool.execute(
            'SELECT name, formula FROM salary_formulas WHERE company_id = ? OR ? IS NULL',
            [companyId || null, companyId || null]
        );
        formulaRows.forEach(f => {
            if (f.name) definitions[f.name.trim()] = { type: 'formula', value: f.formula };
        });

        // 2. From salary_components
        const [componentRows] = await pool.execute(
            'SELECT name, calculation_type, calculation_value FROM salary_components WHERE (company_id = ? OR ? IS NULL) AND is_active = 1',
            [companyId || null, companyId || null]
        );
        componentRows.forEach(c => {
            if (!c.name) return;
            const typeStr = c.calculation_type?.toLowerCase();
            if (typeStr === 'fixed') {
                definitions[c.name.trim()] = { type: 'fixed', value: c.calculation_value };
            } else if (typeStr === 'formula') {
                definitions[c.name.trim()] = { type: 'formula', value: c.calculation_value };
            }
        });
    } catch (dbErr) {
        console.error('Error fetching salary definitions:', dbErr.message);
    }

    return definitions;
};

module.exports = {
    evaluateFormula,
    getDefinitions,
    SafeMathEvaluator
};
