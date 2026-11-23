const mysql = require('mysql2/promise');

async function checkTodayPunches() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [punches] = await conn.query("SELECT * FROM biometric_punches WHERE date = '2026-11-23' AND emp_id = '9011'");
  console.log('Biometric punches for Balaji today:', punches);

  const [notifs] = await conn.query("SELECT * FROM notifications WHERE (user_id = 23 OR message LIKE '%Balaji%') AND created_at >= '2026-11-23 00:00:00'");
  console.log('Notifications today:', notifs);

  await conn.end();
}

checkTodayPunches().catch(console.error);
