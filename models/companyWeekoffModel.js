const { pool } = require('../Config/dbConfig');

class CompanyWeekOff {
    static async create(data) {
        const { company_id, day_name } = data;
        const [result] = await pool.execute(
            'INSERT INTO weekoffaspercompany (company_id, day_name) VALUES (?, ?)',
            [company_id, day_name]
        );
        return result.insertId;
    }

    static async getByCompanyId(companyId) {
        const [rows] = await pool.execute('SELECT * FROM weekoffaspercompany WHERE company_id = ? AND is_active = 1', [companyId]);
        return rows;
    }

    static async getAll() {
        const [rows] = await pool.execute(`
            SELECT w.*, c.name as company_name 
            FROM weekoffaspercompany w
            LEFT JOIN companies c ON w.company_id = c.id
            ORDER BY c.name, w.day_name
        `);
        return rows;
    }

    static async delete(id) {
        const [result] = await pool.execute('DELETE FROM weekoffaspercompany WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    static async deleteByCompanyAndDay(companyId, dayName) {
        const [result] = await pool.execute('DELETE FROM weekoffaspercompany WHERE company_id = ? AND day_name = ?', [companyId, dayName]);
        return result.affectedRows > 0;
    }
}

module.exports = CompanyWeekOff;
