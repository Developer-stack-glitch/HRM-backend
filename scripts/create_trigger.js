const mysql = require('mysql2/promise');

async function createTrigger() {
    const conn = await mysql.createConnection({
        host: '159.65.154.184',
        user: 'root',
        password: 'CRM@2024Acte',
        database: 'hrms_database',
        dateStrings: true
    });

    console.log('Dropping old trigger if exists...');
    await conn.query('DROP TRIGGER IF EXISTS trg_correct_biometric_punch_time');

    console.log('Creating trigger trg_correct_biometric_punch_time...');
    const triggerSql = `
        CREATE TRIGGER trg_correct_biometric_punch_time
        BEFORE INSERT ON biometric_punches
        FOR EACH ROW
        BEGIN
            IF NEW.device_sn = 'CGKK231063361' AND NEW.date = '2026-11-21' AND NEW.time BETWEEN '18:00:00' AND '18:35:00' THEN
                SET NEW.punch_time = DATE_ADD(NEW.punch_time, INTERVAL 30 MINUTE);
                SET NEW.time = TIME(NEW.punch_time);
                SET NEW.date = DATE(NEW.punch_time);
            ELSEIF NEW.device_sn = 'CGKK231063361' AND NEW.date = '2026-11-23' AND NEW.time BETWEEN '08:30:00' AND '09:05:00' THEN
                SET NEW.punch_time = DATE_ADD(NEW.punch_time, INTERVAL 30 MINUTE);
                SET NEW.time = TIME(NEW.punch_time);
                SET NEW.date = DATE(NEW.punch_time);
            END IF;
        END
    `;
    await conn.query(triggerSql);
    console.log('Trigger created successfully!');

    // Now delete any existing duplicate unshifted rows with IDs >= 394706
    console.log('Removing recent duplicate dump rows...');
    const [del] = await conn.execute('DELETE FROM biometric_punches WHERE id >= 394706');
    console.log(`Deleted ${del.affectedRows} recent duplicate rows.`);

    await conn.end();
}

createTrigger().catch(console.error);
