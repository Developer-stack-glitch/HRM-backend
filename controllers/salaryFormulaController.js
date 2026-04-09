const SalaryFormula = require('../models/salaryFormulaModel');
const SalaryComponent = require('../models/salaryComponentModel');
const { getDefinitions, evaluateFormula } = require('../utils/formulaEvaluator');

const salaryFormulaController = {
    create: async (req, res) => {
        try {
            const id = await SalaryFormula.create(req.body);
            res.status(201).json({ message: 'Formula created successfully', id });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getAll: async (req, res) => {
        try {
            const { company_id } = req.query;
            const formulas = await SalaryFormula.getAll(company_id);
            res.json(formulas);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getById: async (req, res) => {
        try {
            const formula = await SalaryFormula.getById(req.params.id);
            if (!formula) return res.status(404).json({ message: 'Formula not found' });
            res.json(formula);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    update: async (req, res) => {
        try {
            const affectedRows = await SalaryFormula.update(req.params.id, req.body);
            res.json({ message: 'Formula updated successfully', success: affectedRows > 0 });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    delete: async (req, res) => {
        try {
            await SalaryFormula.delete(req.params.id);
            res.json({ message: 'Formula deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    validate: async (req, res) => {
        try {
            const { formula, test_ctc = 0, company_id } = req.body;

            // 1. Fetch available definitions via utility
            const definitions = await getDefinitions(company_id);
            const processSteps = [];

            // 2. Prepare context for evaluation - Treating input as Monthly CTC for direct formula testing
            const ctcMonthly = Number(test_ctc);
            const context = {
                'CTC': ctcMonthly,
                'GROSS': ctcMonthly,
                'Basic': ctcMonthly * 0.5,
                'CTC_YEAR': ctcMonthly * 12
            };

            try {
                const finalResult = evaluateFormula(formula, context, definitions, 0);

                res.json({
                    success: true,
                    result: finalResult,
                    processSteps: [
                        `Loaded and keyed definitions from \`salary_formulas\`.`,
                        `Found Variable definitions in \`salary_components\` to process.`,
                        `Created a final unified collection of ${Object.keys(definitions).length} total definitions.`,
                        `Initial Context: {CTC} = ${ctcMonthly.toFixed(2)} (Sample Input), {CTC_YEAR} = ${(ctcMonthly * 12).toFixed(2)} (Estimated Annual), {GROSS} = ${ctcMonthly.toFixed(2)}, {Basic} = ${(ctcMonthly * 0.5).toFixed(2)}`,
                        `(0) Evaluating formula: \`${formula}\``,
                        `(1) Recursive evaluation handled by the system.`,
                        `Final Result: ${finalResult}`
                    ]
                });
            } catch (error) {
                res.json({
                    success: false,
                    error: error.message,
                    processSteps: [`Evaluation error: ${error.message}`]
                });
            }

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = salaryFormulaController;
