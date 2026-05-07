const { pool } = require('../Config/dbConfig');

const incentiveController = {
    create: async (req, res) => {
        try {
            const { user_id, payroll_date, amount, description } = req.body;
            const [result] = await pool.execute(
                'INSERT INTO payroll_incentives (user_id, payroll_date, amount, description) VALUES (?, ?, ?, ?)',
                [user_id, payroll_date, amount, description || '']
            );
            res.status(201).json({ message: 'Incentive added successfully', id: result.insertId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getAll: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute(`
                SELECT i.*, u.employee_name, u.emp_id
                FROM payroll_incentives i
                JOIN users u ON i.user_id = u.id
                WHERE u.company = ? OR ? IS NULL
                ORDER BY i.payroll_date DESC, i.created_at DESC
            `, [company_id || null, company_id || null]);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    delete: async (req, res) => {
        try {
            const { id } = req.params;
            await pool.execute('DELETE FROM payroll_incentives WHERE id = ?', [id]);
            res.json({ message: 'Incentive deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = incentiveController;
