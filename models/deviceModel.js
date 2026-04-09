const { pool } = require('../Config/dbConfig');

class Device {
    static async getAll() {
        const [rows] = await pool.execute('SELECT * FROM devices');
        return rows;
    }

    static async getById(id) {
        const [rows] = await pool.execute('SELECT * FROM devices WHERE id = ?', [id]);
        return rows[0];
    }

    static async create(data) {
        const { name, serial_number, location } = data;
        const [result] = await pool.execute(
            'INSERT INTO devices (name, serial_number, location) VALUES (?, ?, ?)',
            [name, serial_number, location]
        );
        return result.insertId;
    }

    static async update(id, data) {
        const { name, serial_number, location } = data;
        await pool.execute(
            'UPDATE devices SET name = ?, serial_number = ?, location = ? WHERE id = ?',
            [name, serial_number, location, id]
        );
    }

    static async delete(id) {
        await pool.execute('DELETE FROM devices WHERE id = ?', [id]);
    }
}

module.exports = Device;
