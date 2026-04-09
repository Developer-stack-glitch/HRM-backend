const { pool } = require('../Config/dbConfig');

class WeekOff {
    static async create(data) {
        const { userid, weekoffdate, alternative_date } = data;
        const [result] = await pool.execute(
            'INSERT INTO weekoff (userid, weekoffdate, alternative_date) VALUES (?, ?, ?)',
            [userid, weekoffdate, alternative_date]
        );
        return result.insertId;
    }

    static async checkDuplicateInWeek(userid, weekoffdate, excludeId = null) {
        let query = 'SELECT id, weekoffdate FROM weekoff WHERE userid = ? AND YEARWEEK(weekoffdate, 0) = YEARWEEK(?, 0)';
        const params = [userid, weekoffdate];

        if (excludeId) {
            query += ' AND id != ?';
            params.push(excludeId);
        }

        const [rows] = await pool.execute(query, params);
        return rows.length > 0 ? rows[0].weekoffdate : null;
    }

    static async getAll() {
        const [rows] = await pool.execute(`
            SELECT w.*, u.employee_name, u.emp_id 
            FROM weekoff w
            JOIN users u ON w.userid = u.id
            ORDER BY w.created_at DESC
        `);
        return rows;
    }

    static async getByUserId(userId) {
        const [rows] = await pool.execute('SELECT * FROM weekoff WHERE userid = ?', [userId]);
        return rows;
    }

    static async getById(id) {
        const [rows] = await pool.execute('SELECT * FROM weekoff WHERE id = ?', [id]);
        return rows[0];
    }

    static async delete(id) {
        const [result] = await pool.execute('DELETE FROM weekoff WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    static async update(id, data) {
        const { weekoffdate, alternative_date } = data;
        const [result] = await pool.execute(
            'UPDATE weekoff SET weekoffdate = ?, alternative_date = ? WHERE id = ?',
            [weekoffdate, alternative_date, id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = WeekOff;
