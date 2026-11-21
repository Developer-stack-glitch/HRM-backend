const ZKLib = require('node-zklib');
const mysql = require('mysql2/promise');

function formatIST(d) {
    const dateObj = new Date(d);
    // Ensure accurate IST YYYY-MM-DD and HH:mm:ss
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const parts = formatter.formatToParts(dateObj);
    const p = {};
    parts.forEach(({ type, value }) => { p[type] = value; });
    const date = `${p.year}-${p.month}-${p.day}`;
    const time = `${p.hour}:${p.minute}:${p.second}`;
    return { date, time, timestamp: `${date} ${time}` };
}

async function run() {
    console.log('1. Connecting to biometric machine at 192.168.1.2:4370...');
    const zk = new ZKLib('192.168.1.2', 4370, 10000, 4000);
    await zk.createSocket();
    const res = await zk.getAttendances();
    const allLogs = res.data || res;
    console.log(`Total punches downloaded from machine memory: ${allLogs.length}`);
    await zk.disconnect();

    // Filter logs from October 1, 2026 onwards
    const cutoff = new Date('2026-10-01T00:00:00Z');
    const filtered = allLogs.filter(log => new Date(log.recordTime) >= cutoff);
    console.log(`Punches from Oct 01, 2026 onwards: ${filtered.length}`);

    // Connect to server database
    const conn = await mysql.createConnection({
        host: '159.65.154.184',
        user: 'root',
        password: 'CRM@2024Acte',
        database: 'hrms_database'
    });

    console.log('2. Inserting into biometric_punches table on server...');
    let inserted = 0;
    const batchSize = 100;
    for (let i = 0; i < filtered.length; i += batchSize) {
        const chunk = filtered.slice(i, i + batchSize);
        const values = [];
        const placeholders = chunk.map(log => {
            const { date, time, timestamp } = formatIST(log.recordTime);
            values.push(
                'CGKK231063361',
                'BDC 2',
                String(log.deviceUserId).trim(),
                timestamp,
                date,
                time,
                1,
                0
            );
            return '(?, ?, ?, ?, ?, ?, ?, ?)';
        }).join(', ');

        const query = `
            INSERT IGNORE INTO biometric_punches 
                (device_sn, device_name, emp_id, punch_time, date, time, verify_type, punch_state) 
            VALUES ${placeholders}
        `;
        const [result] = await conn.execute(query, values);
        inserted += result.affectedRows;
    }

    console.log(`Finished inserting! ${inserted} new punch records added to biometric_punches.`);
    await conn.end();
}

run().catch(err => {
    console.error('Sync failed:', err);
});
