const { pool } = require('../Config/dbConfig');

class Holiday {
    static async create(data, poolOverride = null) {
        const { company_id, name, date, type, description } = data;
        const targetPool = poolOverride || pool;

        if (poolOverride || !company_id) {
            // Tenant database or no company_id provided
            const [result] = await targetPool.execute(
                'INSERT INTO holidays (name, date, type, description) VALUES (?, ?, ?, ?)',
                [name, date, type || 'National', description || null]
            );
            return result.insertId;
        } else {
            // Main database
            const [result] = await targetPool.execute(
                'INSERT INTO holidays (company_id, name, date, type, description) VALUES (?, ?, ?, ?, ?)',
                [company_id, name, date, type || 'National', description || null]
            );
            return result.insertId;
        }
    }

    static async getAll(year = null, poolOverride = null) {
        const targetPool = poolOverride || pool;
        let query = 'SELECT * FROM holidays';
        const params = [];

        if (year) {
            query += ' WHERE YEAR(date) = ?';
            params.push(year);
        }

        query += ' ORDER BY date ASC';
        const [rows] = await targetPool.execute(query, params);
        return rows;
    }

    static async getByCompanyId(companyId, year = null) {
        let query = 'SELECT * FROM holidays WHERE company_id = ?';
        const params = [companyId];

        if (year) {
            query += ' AND YEAR(date) = ?';
            params.push(year);
        }

        query += ' ORDER BY date ASC';
        const [rows] = await pool.execute(query, params);
        return rows;
    }

    static async update(id, data, poolOverride = null) {
        const { name, date, type, description } = data;
        const targetPool = poolOverride || pool;
        await targetPool.execute(
            'UPDATE holidays SET name = ?, date = ?, type = ?, description = ? WHERE id = ?',
            [name, date, type, description, id]
        );
    }

    static async delete(id, poolOverride = null) {
        const targetPool = poolOverride || pool;
        await targetPool.execute('DELETE FROM holidays WHERE id = ?', [id]);
    }
}

module.exports = Holiday;
