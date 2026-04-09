const { pool } = require("../Config/dbConfig");

class AdvanceSalary {
    static async create(data) {
        const query = `
            INSERT INTO advance_salary (user_id, amount, repayment_months, reason, request_date, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const values = [
            data.user_id,
            data.amount,
            data.repayment_months || 1,
            data.reason,
            data.request_date || new Date(),
            'Pending'
        ];
        const [result] = await pool.query(query, values);
        return result.insertId;
    }

    static async getAll(params = {}) {
        let query = `
            SELECT asal.*, u.employee_name, u.email as employee_email
            FROM advance_salary asal
            JOIN users u ON asal.user_id = u.id
            WHERE 1=1
        `;
        const values = [];

        if (params.status && params.status !== 'All') {
            query += " AND asal.status = ?";
            values.push(params.status);
        }

        if (params.user_id) {
            query += " AND asal.user_id = ?";
            values.push(params.user_id);
        }

        if (params.search) {
            const searchPattern = `%${params.search}%`;
            query += " AND (u.employee_name LIKE ? OR u.email LIKE ?)";
            values.push(searchPattern, searchPattern);
        }

        const validSortColumns = ['amount', 'request_date', 'status'];
        const orderBy = validSortColumns.includes(params.sortBy) ? `asal.${params.sortBy}` : 'asal.request_date';
        const orderDir = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';

        query += ` ORDER BY ${orderBy} ${orderDir}`;

        if (params.page && params.limit) {
            const offset = (params.page - 1) * params.limit;
            query += " LIMIT ? OFFSET ?";
            values.push(parseInt(params.limit), parseInt(offset));
        }

        const [rows] = await pool.query(query, values);
        return rows;
    }

    static async getCount(params = {}) {
        let query = "SELECT COUNT(*) as count FROM advance_salary asal JOIN users u ON asal.user_id = u.id WHERE 1=1";
        const values = [];

        if (params.status && params.status !== 'All') {
            query += " AND asal.status = ?";
            values.push(params.status);
        }

        if (params.user_id) {
            query += " AND asal.user_id = ?";
            values.push(params.user_id);
        }

        if (params.search) {
            const searchPattern = `%${params.search}%`;
            query += " AND (u.employee_name LIKE ? OR u.email LIKE ?)";
            values.push(searchPattern, searchPattern);
        }

        const [rows] = await pool.query(query, values);
        return rows[0].count;
    }

    static async updateStatus(id, data) {
        const query = `
            UPDATE advance_salary
            SET status = ?, admin_comments = ?, approved_by = ?, approved_at = NOW()
            WHERE id = ?
        `;
        const values = [data.status, data.admin_comments, data.approved_by, id];
        const [result] = await pool.query(query, values);
        return result.affectedRows > 0;
    }

    static async getById(id) {
        const query = `
            SELECT asal.*, u.employee_name, u.email as employee_email
            FROM advance_salary asal
            JOIN users u ON asal.user_id = u.id
            WHERE asal.id = ?
        `;
        const [rows] = await pool.query(query, [id]);
        return rows[0];
    }

    static async delete(id) {
        const query = "DELETE FROM advance_salary WHERE id = ?";
        const [result] = await pool.query(query, [id]);
        return result.affectedRows > 0;
    }
}

module.exports = AdvanceSalary;
