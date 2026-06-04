const { pool } = require('../Config/dbConfig');

const incentiveController = {
    create: async (req, res) => {
        try {
            const { user_id, payroll_date, amount, description, type } = req.body;
            const [result] = await pool.execute(
                'INSERT INTO payroll_incentives (user_id, payroll_date, amount, description, type) VALUES (?, ?, ?, ?, ?)',
                [user_id, payroll_date, amount, description || '', type || 'addition']
            );
            res.status(201).json({ message: 'Incentive added successfully', id: result.insertId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getAll: async (req, res) => {
        try {
            const { company_id, page = 1, limit = 10, search = '' } = req.query;
            const offset = (page - 1) * limit;

            let query = `
                FROM payroll_incentives i
                JOIN users u ON i.user_id = u.id
                WHERE (u.company = ? OR ? IS NULL)
            `;
            const params = [company_id || null, company_id || null];

            if (search) {
                query += ` AND (u.employee_name LIKE ? OR u.emp_id LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }

            const [countResult] = await pool.execute(`SELECT COUNT(*) as total ${query}`, params);
            const total = countResult[0].total;

            const [rows] = await pool.execute(`
                SELECT i.*, u.employee_name, u.emp_id,
                (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END 
                 FROM payroll_items pi 
                 JOIN payroll_runs pr ON pi.payroll_run_id = pr.id 
                 WHERE pi.user_id = i.user_id 
                 AND pr.status = 'Completed' 
                 AND i.payroll_date >= pr.period_start 
                 AND i.payroll_date <= CONCAT(DATE(pr.period_end), ' 23:59:59')
                ) as is_payroll_run
                ${query}
                ORDER BY i.payroll_date DESC, i.created_at DESC
                LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
            `, params);

            res.json({
                data: rows,
                total,
                page: parseInt(page),
                limit: parseInt(limit)
            });
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
