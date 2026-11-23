const mysql = require('mysql2/promise');

async function inspect() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [minMax] = await conn.query(`
    SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as cnt 
    FROM biometric_punches 
    WHERE date = '2026-11-21' AND device_sn = 'CGKK231063361'
  `);
  console.log('Min/Max ID on 2026-11-21 for device CGKK231063361:', minMax);

  // Check Gokul Nainar S and Ragavan S
  const [users] = await conn.query(`
    SELECT id, employee_name, emp_id, biometric_id, shift 
    FROM users 
    WHERE emp_id IN ('ACTE260326312', 'ACTE261102395') 
       OR employee_name LIKE '%Gokul%' 
       OR employee_name LIKE '%Ragavan%'
  `);
  console.log('Users found:', users);

  for (const u of users) {
    const [p] = await conn.query(`
      SELECT id, device_sn, emp_id, punch_time, date, time, created_at 
      FROM biometric_punches 
      WHERE (emp_id = ? OR emp_id = ?) AND date = '2026-11-21'
      ORDER BY time ASC
    `, [u.emp_id, u.biometric_id]);
    console.log(`Punches for ${u.employee_name}:`, p);

    const [a] = await conn.query(`
      SELECT * FROM attendance WHERE user_id = ? AND date = '2026-11-21'
    `, [u.id]);
    console.log(`Attendance for ${u.employee_name}:`, a);
  }

  // Check all employees on 2026-11-21 with early_punch_out > '00:00:00'
  const [earlyList] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id, u.shift,
           a.punch_in, a.punch_out, a.actual_punch_in, a.actual_punch_out,
           a.early_punch_out, a.late_punch_in, a.total_hours, a.status, a.is_edited
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.date = '2026-11-21' AND (a.early_punch_out > '00:00:00' OR a.punch_out < '18:30:00')
    ORDER BY a.punch_out ASC
  `);
  console.log('\n--- ALL EMPLOYEES ON 2026-11-21 WITH EARLY PUNCH OUT OR PUNCH OUT < 18:30:00 ---');
  console.table(earlyList);

  await conn.end();
}

inspect().catch(console.error);
