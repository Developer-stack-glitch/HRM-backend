const mysql = require('mysql2/promise');

async function inspectNew() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [p] = await conn.query('SELECT * FROM biometric_punches WHERE id >= 450000 LIMIT 10');
  console.log('Sample punches >= 450000:', p);

  // Check how many punches exist per emp_id on 2026-11-21
  const [counts] = await conn.query(`
    SELECT emp_id, count(*) as c, GROUP_CONCAT(CONCAT(id, ':', time) ORDER BY time SEPARATOR ', ') as punch_list
    FROM biometric_punches
    WHERE date = '2026-11-21' AND time >= '17:00:00'
    GROUP BY emp_id
    ORDER BY emp_id ASC
  `);
  console.table(counts);

  // Check attendance records on 2026-11-21
  const [attn] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id,
           a.punch_in, a.punch_out, a.early_punch_out, a.late_punch_in, a.total_hours, a.status
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.date = '2026-11-21'
    ORDER BY a.punch_out ASC
  `);
  console.log(`\nAttendance records on 2026-11-21: (Total ${attn.length})`);
  console.table(attn);

  await conn.end();
}

inspectNew().catch(console.error);
