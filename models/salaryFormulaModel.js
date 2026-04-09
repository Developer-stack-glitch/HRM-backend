const { pool } = require('../Config/dbConfig');

const SalaryFormula = {
    create: async (data) => {
        const { company_id, name, formula, status } = data;
        const [result] = await pool.execute(
            `INSERT INTO salary_formulas (company_id, name, formula, status) VALUES (?, ?, ?, ?)`,
            [company_id || null, name || null, formula || null, status || 'PENDING']
        );
        return result.insertId;
    },

    getAll: async (company_id) => {
        let query = 'SELECT * FROM salary_formulas';
        let params = [];
        if (company_id !== undefined && company_id !== null) {
            query += ' WHERE company_id = ?';
            params.push(company_id);
        }
        query += ' ORDER BY created_at DESC';
        const [rows] = await pool.execute(query, params);
        return rows;
    },

    getById: async (id) => {
        const [rows] = await pool.execute('SELECT * FROM salary_formulas WHERE id = ?', [id || null]);
        return rows[0];
    },

    update: async (id, data) => {
        const fields = [];
        const values = [];
        const allowedFields = ['name', 'formula', 'status'];

        allowedFields.forEach(field => {
            if (data[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(data[field]);
            }
        });

        if (fields.length === 0) return 0;

        values.push(id || null);
        const [result] = await pool.execute(
            `UPDATE salary_formulas SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows;
    },

    delete: async (id) => {
        const [result] = await pool.execute('DELETE FROM salary_formulas WHERE id = ?', [id || null]);
        return result.affectedRows;
    }
};

module.exports = SalaryFormula;
