const mysql = require('mysql2/promise');

async function checkSatDetail() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  // Check all punches on 2026-11-21
  const [punches] = await conn.query(
    "SELECT id, device_sn, emp_id, date, time, punch_time, created_at FROM biometric_punches WHERE date = '2026-11-21' AND time >= '17:00:00' ORDER BY time ASC"
  );
  console.log('All evening punches on 2026-11-21:');
  console.table(punches);

  // Check all attendance on 2026-11-21 where early_punch_out > 0 or punch_out < 18:30:00
  const [earlyAttn] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id, u.shift,
           a.punch_in, a.punch_out, a.early_punch_out, a.late_punch_in, a.total_hours, a.status
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.date = '2026-11-21' AND (a.early_punch_out > '00:00:00' OR a.punch_out < '18:30:00')
    ORDER BY a.punch_out ASC
  `);
  console.log('Affected attendance rows on 2026-11-21:');
  console.table(earlyAttn);

  await conn.end();
}

checkSatDetail().catch(console.error);
