const { pool } = require('../Config/dbConfig');

let offsetColumnEnsured = false;
let ensureOffsetPromise = null;

class Device {
    /**
     * Ensure devices.clock_offset_minutes exists on existing databases and
     * seed known 30-min-lagging hardware (CGKK231063361) on initial migration.
     */
    static async ensureClockOffsetColumn() {
        if (offsetColumnEnsured) return;
        if (ensureOffsetPromise) return ensureOffsetPromise;

        ensureOffsetPromise = (async () => {
            try {
                const [cols] = await pool.execute("SHOW COLUMNS FROM devices LIKE 'clock_offset_minutes'");
                if (cols.length === 0) {
                    await pool.execute('ALTER TABLE devices ADD COLUMN clock_offset_minutes INT NOT NULL DEFAULT 0 AFTER location');
                    await pool.execute("UPDATE devices SET clock_offset_minutes = 30 WHERE serial_number = 'CGKK231063361'");
                }
                offsetColumnEnsured = true;
            } catch (err) {
                console.warn('[Device] Could not ensure clock_offset_minutes column:', err.message);
            } finally {
                ensureOffsetPromise = null;
            }
        })();

        return ensureOffsetPromise;
    }

    static async getAll() {
        const [rows] = await pool.execute('SELECT * FROM devices');
        return rows;
    }

    static async getById(id) {
        const [rows] = await pool.execute('SELECT * FROM devices WHERE id = ?', [id]);
        return rows[0];
    }

    static async setClockOffset(serialNumber, offsetMinutes) {
        if (!serialNumber) return;
        await this.ensureClockOffsetColumn();
        await pool.execute(
            'UPDATE devices SET clock_offset_minutes = ? WHERE serial_number = ?',
            [Number(offsetMinutes) || 0, serialNumber]
        );
    }

    static async create(data) {
        const { name, serial_number, location, clock_offset_minutes = 0 } = data;
        await this.ensureClockOffsetColumn();
        const [result] = await pool.execute(
            'INSERT INTO devices (name, serial_number, location, clock_offset_minutes) VALUES (?, ?, ?, ?)',
            [name, serial_number, location, Number(clock_offset_minutes) || 0]
        );
        return result.insertId;
    }

    static async update(id, data) {
        const { name, serial_number, location, clock_offset_minutes } = data;
        await this.ensureClockOffsetColumn();
        if (clock_offset_minutes !== undefined) {
            await pool.execute(
                'UPDATE devices SET name = ?, serial_number = ?, location = ?, clock_offset_minutes = ? WHERE id = ?',
                [name, serial_number, location, Number(clock_offset_minutes) || 0, id]
            );
        } else {
            await pool.execute(
                'UPDATE devices SET name = ?, serial_number = ?, location = ? WHERE id = ?',
                [name, serial_number, location, id]
            );
        }
    }

    static async delete(id) {
        await pool.execute('DELETE FROM devices WHERE id = ?', [id]);
    }
}

module.exports = Device;
