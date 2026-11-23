const mysql = require('mysql2/promise');

async function checkSatPunches() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [satPunches] = await conn.query(`
    SELECT id, device_sn, emp_id, punch_time, time, created_at 
    FROM biometric_punches 
    WHERE date = '2026-11-21' AND device_sn = 'CGKK231063361'
    ORDER BY id ASC
    LIMIT 20
  `);
  console.log('Saturday punches from CGKK231063361:', satPunches);

  await conn.end();
}

checkSatPunches().catch(console.error);
