const { pool } = require('../Config/dbConfig');

class BiometricPunch {
    static async ensureTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS biometric_punches (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_sn VARCHAR(100) NOT NULL,
                device_name VARCHAR(255) DEFAULT NULL,
                emp_id VARCHAR(50) NOT NULL,
                punch_time DATETIME NOT NULL,
                date DATE NOT NULL,
                time TIME NOT NULL,
                verify_type INT DEFAULT 0,
                punch_state INT DEFAULT 0,
                work_code VARCHAR(50) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_punch (device_sn, emp_id, punch_time),
                INDEX idx_date (date),
                INDEX idx_emp_date (emp_id, date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        try {
            await pool.execute(query);
            console.log('[BiometricPunch] biometric_punches table ensured');
        } catch (error) {
            console.error('[BiometricPunch] Error ensuring table:', error.message);
        }
    }

    static async createBulk(punches) {
        if (!punches || punches.length === 0) return 0;

        const values = [];
        const placeholders = punches.map(p => {
            values.push(
                p.device_sn || 'UNKNOWN',
                p.device_name || null,
                String(p.emp_id).trim(),
                p.punch_time,
                p.date,
                p.time,
                p.verify_type || 0,
                p.punch_state || 0,
                p.work_code || null
            );
            return '(?, ?, ?, ?, ?, ?, ?, ?, ?)';
        }).join(', ');

        const query = `
            INSERT IGNORE INTO biometric_punches 
                (device_sn, device_name, emp_id, punch_time, date, time, verify_type, punch_state, work_code)
            VALUES ${placeholders}
        `;

        const [result] = await pool.execute(query, values);
        return result.affectedRows;
    }

    static async getByDateRange(startDate, endDate) {
        const query = `
            SELECT 
                emp_id,
                DATE_FORMAT(date, '%Y-%m-%d') AS date,
                TIME_FORMAT(time, '%H:%i:%s') AS time,
                DATE_FORMAT(punch_time, '%Y-%m-%d %H:%i:%s') AS timestamp,
                device_name,
                device_sn
            FROM biometric_punches 
            WHERE date BETWEEN ? AND ? 
            ORDER BY punch_time ASC
        `;
        const [rows] = await pool.execute(query, [startDate, endDate]);
        return rows;
    }

    static async getPunchesForUserDate(empId, date) {
        const query = `
            SELECT 
                id,
                device_sn,
                device_name,
                emp_id,
                DATE_FORMAT(punch_time, '%Y-%m-%d %H:%i:%s') AS punch_time,
                DATE_FORMAT(date, '%Y-%m-%d') AS date,
                TIME_FORMAT(time, '%H:%i:%s') AS time,
                verify_type,
                punch_state
            FROM biometric_punches 
            WHERE emp_id = ? AND date = ? 
            ORDER BY punch_time ASC
        `;
        const [rows] = await pool.execute(query, [String(empId).trim(), date]);
        return rows;
    }
}

module.exports = BiometricPunch;
