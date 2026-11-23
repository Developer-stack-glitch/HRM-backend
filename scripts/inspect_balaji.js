const mysql = require('mysql2/promise');

async function inspectBalaji() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  console.log('=== BALAJI R USER INFO ===');
  const [users] = await conn.query("SELECT * FROM users WHERE employee_name LIKE '%Balaji R%'");
  console.log(users.map(u => ({ id: u.id, name: u.employee_name, emp_id: u.emp_id, bio_id: u.biometric_id, shift: u.shift })));

  const balaji = users[0];

  console.log('\n=== BALAJI R ATTENDANCE (NOV 21 & NOV 23) ===');
  const [att] = await conn.query(`
    SELECT * FROM attendance 
    WHERE user_id = ? AND date IN ('2026-11-21', '2026-11-23')
  `, [balaji.id]);
  console.log(att);

  console.log('\n=== BALAJI R BIOMETRIC_PUNCHES (NOV 21 & NOV 23) ===');
  const [punches] = await conn.query(`
    SELECT * FROM biometric_punches 
    WHERE (emp_id = ? OR emp_id = ? OR emp_id = ?) 
      AND date IN ('2026-11-21', '2026-11-23')
    ORDER BY punch_time ASC
  `, [String(balaji.id), String(balaji.biometric_id), String(balaji.emp_id)]);
  console.log(punches);

  console.log('\n=== BALAJI R NOTIFICATIONS (NOV 21 & NOV 23) ===');
  const [notifs] = await conn.query(`
    SELECT * FROM notifications 
    WHERE (user_id = ? OR message LIKE '%Balaji%') 
      AND created_at >= '2026-11-21 00:00:00'
    ORDER BY created_at ASC
  `, [balaji.id]);
  console.log(notifs);

  console.log('\n=== SHIFT & ROSTER INFO FOR BALAJI ===');
  const [shifts] = await conn.query("SELECT * FROM shifts");
  console.log('Shifts:', shifts);

  const [roster] = await conn.query(`
    SELECT * FROM shift_roster 
    WHERE user_id = ? AND roster_date IN ('2026-11-21', '2026-11-23')
  `, [balaji.id]);
  console.log('Roster:', roster);

  await conn.end();
}

inspectBalaji().catch(console.error);
