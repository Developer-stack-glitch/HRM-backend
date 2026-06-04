const { pool } = require('../Config/dbConfig');

class Regularisation {
    static async create(data) {
        const { user_id, date, check_in, check_out, reason, status } = data;
        const [result] = await pool.execute(
            'INSERT INTO regularisations (user_id, date, check_in, check_out, reason, status) VALUES (?, ?, ?, ?, ?, ?)',
            [user_id, date, check_in || null, check_out || null, reason || null, status || 'Pending']
        );
        return result.insertId;
    }

    static async getAll(filters = {}) {
        let query = `
            SELECT r.*, u.employee_name, u.emp_id, u.designation, u.department, u.branch, u.reporting_manager
            FROM regularisations r
            JOIN users u ON r.user_id = u.id
            WHERE 1=1
        `;
        let countQuery = `
            SELECT COUNT(*) as total
            FROM regularisations r
            JOIN users u ON r.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.reporting_manager && filters.personal_user_id) {
            const condition = ' AND (u.reporting_manager = ? OR r.user_id = ?)';
            query += condition; countQuery += condition;
            params.push(filters.reporting_manager, filters.personal_user_id);
        } else if (filters.user_id) {
            const condition = ' AND r.user_id = ?';
            query += condition; countQuery += condition;
            params.push(filters.user_id);
        } else if (filters.reporting_manager) {
            const condition = ' AND u.reporting_manager = ?';
            query += condition; countQuery += condition;
            params.push(filters.reporting_manager);
        }
        if (filters.status) {
            const condition = ' AND r.status = ?';
            query += condition; countQuery += condition;
            params.push(filters.status);
        }
        if (filters.startDate && filters.endDate) {
            const condition = ' AND r.date BETWEEN ? AND ?';
            query += condition; countQuery += condition;
            params.push(filters.startDate, filters.endDate);
        }
        if (filters.search) {
            const condition = ' AND (u.employee_name LIKE ? OR u.emp_id LIKE ? OR r.reason LIKE ?)';
            query += condition; countQuery += condition;
            const searchParam = `%${filters.search}%`;
            params.push(searchParam, searchParam, searchParam);
        }

        query += ' ORDER BY r.date DESC, r.created_at DESC';

        if (filters.limit) {
            const page = parseInt(filters.page) || 1;
            const limit = parseInt(filters.limit) || 10;
            const offset = (page - 1) * limit;
            
            query += ` LIMIT ${limit} OFFSET ${offset}`;
            
            const [rows] = await pool.execute(query, params);
            const [countResult] = await pool.execute(countQuery, params);
            const total = countResult[0].total;

            return {
                data: rows,
                total,
                page,
                totalPages: Math.ceil(total / limit)
            };
        } else {
            const [rows] = await pool.execute(query, params);
            return rows;
        }
    }

    static async getById(id) {
        const [rows] = await pool.execute('SELECT * FROM regularisations WHERE id = ?', [id]);
        return rows[0];
    }

    static async updateStatus(id, status, approved_by, rejection_reason = null) {
        const [result] = await pool.execute(
            'UPDATE regularisations SET status = ?, approved_by = ?, rejection_reason = ? WHERE id = ?',
            [status, approved_by, rejection_reason, id]
        );
        return result.affectedRows > 0;
    }

    static async delete(id) {
        const [result] = await pool.execute('DELETE FROM regularisations WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = Regularisation;
