const { pool } = require('../Config/dbConfig');

class BiometricLog {
    static async createBulk(logs) {
        if (!logs || logs.length === 0) return 0;

        const values = [];
        const columns = ['biometric_id', 'date', 'deduction', 'emp_id', 'employee_name', 'device_name', 'punch_in', 'punch_out', 'shift', 'status', 'total_hours', 'user_id', 'weekoff_date'];

        const placeholders = logs.map(log => {
            values.push(
                log.biometric_id,
                log.date,
                log.deduction,
                log.emp_id,
                log.employee_name,
                log.device_name || null,
                log.punch_in,
                log.punch_out,
                log.shift,
                log.status,
                log.total_hours,
                log.user_id,
                log.weekoff_date
            );
            return '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        }).join(', ');

        const query = `
            INSERT INTO biometric_logs (${columns.join(', ')})
            VALUES ${placeholders}
            ON DUPLICATE KEY UPDATE 
                deduction = VALUES(deduction),
                punch_in = VALUES(punch_in),
                punch_out = VALUES(punch_out),
                shift = VALUES(shift),
                status = VALUES(status),
                total_hours = VALUES(total_hours),
                employee_name = VALUES(employee_name),
                user_id = VALUES(user_id),
                weekoff_date = VALUES(weekoff_date)
        `;

        const [result] = await pool.execute(query, values);
        return result.affectedRows;
    }

    static async getByDateRange(startDate, endDate) {
        const [rows] = await pool.execute(
            'SELECT * FROM biometric_logs WHERE date BETWEEN ? AND ? ORDER BY date DESC, time ASC',
            [startDate, endDate]
        );
        return rows;
    }
}

module.exports = BiometricLog;
