const { pool } = require('../Config/dbConfig');

class Attendance {
    static async create(data) {
        const { user_id, date, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, status, biometric_id, latitude_in, longitude_in, latitude_out, longitude_out, punch_in_location, punch_out_location, is_web_punch, total_break_time } = data;
        const [result] = await pool.execute(
            'INSERT INTO attendance (user_id, date, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, status, biometric_id, latitude_in, longitude_in, latitude_out, longitude_out, punch_in_location, punch_out_location, is_web_punch, total_break_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [user_id || null, date || null, punch_in || null, punch_out || null, late_punch_in || null, late_punch_out || null, early_punch_out || null, total_hours || null, status || null, biometric_id || null, latitude_in || null, longitude_in || null, latitude_out || null, longitude_out || null, punch_in_location || null, punch_out_location || null, is_web_punch || 0, total_break_time || '00:00']
        );
        return result.insertId;
    }

    static async getAll() {
        const [rows] = await pool.execute(`
            SELECT a.*, u.employee_name, u.emp_id, u.designation, u.department, u.branch, u.shift, u.company
            FROM attendance a 
            JOIN users u ON a.user_id = u.id 
            WHERE u.role != 'superadmin'
            ORDER BY a.date DESC, a.created_at DESC
        `);
        return rows;
    }

    static async getInRange(startDate, endDate) {
        const [rows] = await pool.execute(`
            SELECT a.*, u.employee_name, u.emp_id, u.designation, u.department, u.branch, u.shift, u.company
            FROM attendance a 
            JOIN users u ON a.user_id = u.id 
            WHERE (a.date BETWEEN ? AND ?) AND u.role != 'superadmin'
            ORDER BY a.date ASC
        `, [startDate || null, endDate || null]);
        return rows;
    }

    static async getByUserId(userId) {
        const [rows] = await pool.execute('SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC', [userId || null]);
        return rows;
    }

    static async update(id, data) {
        const { date, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, status, biometric_id, latitude_in, longitude_in, latitude_out, longitude_out, punch_in_location, punch_out_location, is_web_punch, total_break_time } = data;
        const [result] = await pool.execute(
            'UPDATE attendance SET date = ?, punch_in = ?, punch_out = ?, late_punch_in = ?, late_punch_out = ?, early_punch_out = ?, total_hours = ?, status = ?, biometric_id = ?, latitude_in = ?, longitude_in = ?, latitude_out = ?, longitude_out = ?, punch_in_location = ?, punch_out_location = ?, is_web_punch = ?, total_break_time = ? WHERE id = ?',
            [date || null, punch_in || null, punch_out || null, late_punch_in || null, late_punch_out || null, early_punch_out || null, total_hours || null, status || null, biometric_id || null, latitude_in || null, longitude_in || null, latitude_out || null, longitude_out || null, punch_in_location || null, punch_out_location || null, is_web_punch || 0, total_break_time || '00:00', id || null]
        );
        return result.affectedRows > 0;
    }

    static async hasAttendanceInRange(userId, startDate, endDate) {
        const [rows] = await pool.execute(
            'SELECT id FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ? LIMIT 1',
            [userId, startDate, endDate]
        );
        return rows.length > 0;
    }

    static async delete(id) {
        const [result] = await pool.execute('DELETE FROM attendance WHERE id = ?', [id || null]);
        return result.affectedRows > 0;
    }
}

module.exports = Attendance;
