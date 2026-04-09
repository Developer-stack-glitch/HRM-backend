const { pool } = require('../Config/dbConfig');

const SalaryComponent = {
    create: async (data) => {
        const { company_id, name, type, calculation_type, calculation_value, is_active, sort_order } = data;
        const [result] = await pool.execute(
            `INSERT INTO salary_components (company_id, name, type, calculation_type, calculation_value, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [company_id || null, name || null, type || 'Earning', calculation_type || 'Variable', calculation_value || null, is_active !== undefined ? is_active : 1, sort_order || 0]
        );
        return result.insertId;
    },

    getAll: async (company_id) => {
        let query = 'SELECT * FROM salary_components';
        let params = [];
        if (company_id !== undefined && company_id !== null) {
            query += ' WHERE company_id = ?';
            params.push(company_id);
        }
        query += ' ORDER BY sort_order ASC, created_at ASC';
        const [rows] = await pool.execute(query, params);
        return rows;
    },

    getById: async (id) => {
        const [rows] = await pool.execute('SELECT * FROM salary_components WHERE id = ?', [id || null]);
        return rows[0];
    },

    update: async (id, data) => {
        const fields = [];
        const values = [];
        const allowedFields = ['name', 'type', 'calculation_type', 'calculation_value', 'is_active', 'sort_order'];

        allowedFields.forEach(field => {
            if (data[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(data[field]);
            }
        });

        if (fields.length === 0) return 0;

        values.push(id || null);
        const query = `UPDATE salary_components SET ${fields.join(', ')} WHERE id = ?`;
        const [result] = await pool.execute(query, values);
        return result.affectedRows;
    },

    delete: async (id) => {
        const [result] = await pool.execute('DELETE FROM salary_components WHERE id = ?', [id || null]);
        return result.affectedRows;
    },

    bulkUpdateOrder: async (orderData) => {
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        try {
            for (const item of orderData) {
                await connection.execute(
                    'UPDATE salary_components SET sort_order = ? WHERE id = ?',
                    [item.sort_order, item.id]
                );
            }
            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
};

module.exports = SalaryComponent;
