const { pool } = require('../Config/dbConfig');

class ShiftRoster {
    static async getRoster(startDate, endDate, filters = {}) {
        let query = `
            SELECT 
                sr.*,
                u.employee_name,
                u.emp_id,
                s.name as shift_name,
                s.start_time,
                s.end_time,
                d.name as department_name
            FROM shift_roster sr
            JOIN users u ON sr.user_id = u.id
            JOIN shifts s ON sr.shift_id = s.id
            LEFT JOIN departments d ON u.department = d.id
            WHERE sr.roster_date BETWEEN ? AND ?
        `;
        if (!startDate || !endDate) return [];
        const params = [startDate, endDate];

        if (filters.department) {
            query += ' AND u.department = ?';
            params.push(filters.department);
        }

        if (filters.branch) {
            query += ' AND u.branch = ?';
            params.push(filters.branch);
        }

        const [rows] = await pool.execute(query, params);
        return rows;
    }

    static async assignShift(data) {
        const { user_id, shift_id, roster_date } = data;
        const query = `
            INSERT INTO shift_roster (user_id, shift_id, roster_date)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id)
        `;
        const [result] = await pool.execute(query, [user_id, shift_id, roster_date]);
        return result;
    }

    static async bulkAssign(userIds, shiftId, startDate, endDate) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const start = new Date(startDate);
            const end = new Date(endDate);
            const dates = [];
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                dates.push(new Date(d).toISOString().split('T')[0]);
            }

            for (const userId of userIds) {
                for (const date of dates) {
                    const query = `
                        INSERT INTO shift_roster (user_id, shift_id, roster_date)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id)
                    `;
                    await connection.execute(query, [userId, shiftId, date]);
                }
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async deleteAssignment(id) {
        const [result] = await pool.execute('DELETE FROM shift_roster WHERE id = ?', [id]);
        return result;
    }
}

module.exports = ShiftRoster;
