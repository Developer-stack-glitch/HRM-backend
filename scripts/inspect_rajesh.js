const mysql = require('mysql2/promise');

async function inspectRajesh() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [rajeshAtt] = await conn.query(`
    SELECT a.*, u.employee_name 
    FROM attendance a 
    JOIN users u ON a.user_id = u.id 
    WHERE u.employee_name LIKE '%Rajesh%' AND a.date >= '2026-11-01' AND a.date <= '2026-11-08'
    ORDER BY a.date ASC
  `);
  console.log('Rajesh Attendance:', rajeshAtt);

  const [rajeshPunches] = await conn.query(`
    SELECT * FROM biometric_punches 
    WHERE emp_id IN ('2444', '128', 'ACTE260709352') AND date >= '2026-11-01' AND date <= '2026-11-08'
    ORDER BY punch_time ASC
  `);
  console.log('Rajesh Biometric Punches:', rajeshPunches);

  await conn.end();
}

inspectRajesh().catch(console.error);
