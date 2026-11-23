const mysql = require('mysql2/promise');

async function checkTodayPunches() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [punches] = await conn.query(`
    SELECT id, device_sn, emp_id, punch_time, time, created_at 
    FROM biometric_punches 
    WHERE date = '2026-11-23' 
    ORDER BY id ASC
    LIMIT 30
  `);
  console.log('Today punches:', punches);

  await conn.end();
}

checkTodayPunches().catch(console.error);
