const mysql = require('mysql2/promise');

async function check() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database'
  });

  const [cols] = await conn.query("DESCRIBE attendance");
  console.log('Attendance columns:', cols.map(c => c.Field).join(', '));

  console.log('--- USER INFO FOR SANTHOSH ---');
  const [users] = await conn.query(`
    SELECT * 
    FROM users 
    WHERE employee_name LIKE '%Santhosh%'
  `);
  const santhosh = users.find(u => u.employee_name.toLowerCase().includes('kathirvel')) || users[0];
  console.log('Target Santhosh user:', { id: santhosh.id, emp_id: santhosh.emp_id, biometric_id: santhosh.biometric_id, name: santhosh.employee_name });

  console.log('--- SANTHOSH KATHIRVEL ATTENDANCE (NOV 15 - 22) ---');
  const [att] = await conn.query(`
    SELECT *
    FROM attendance 
    WHERE user_id = ? AND date >= '2026-11-15' AND date <= '2026-11-22'
    ORDER BY date ASC
  `, [santhosh.id]);
  console.log(att);

  console.log('--- SANTHOSH KATHIRVEL PUNCHES IN BIOMETRIC_PUNCHES ---');
  const [punches] = await conn.query(`
    SELECT id, device_sn, emp_id, punch_time, date, time
    FROM biometric_punches 
    WHERE (emp_id = ? OR emp_id = ? OR emp_id = ?) 
      AND punch_time >= '2026-11-16 00:00:00' AND punch_time <= '2026-11-22 23:59:59'
    ORDER BY punch_time ASC
  `, [String(santhosh.id), String(santhosh.biometric_id), String(santhosh.emp_id)]);
  console.log(punches);

  console.log('--- SANTHOSH KATHIRVEL NOTIFICATIONS (WEB CLOCK-IN/OUT) ---');
  const [notifs] = await conn.query(`
    SELECT id, user_id, type, title, message, created_at 
    FROM notifications 
    WHERE (user_id = ? OR message LIKE '%Santhosh%') AND created_at >= '2026-11-16 00:00:00'
    ORDER BY created_at ASC
  `, [santhosh.id]);
  console.log(notifs);

  console.log('--- SANTHOSH KATHIRVEL LEAVES / PERMISSIONS / REGULARISATIONS ---');
  const [leaves] = await conn.query(`
    SELECT * FROM \`leaves\` WHERE user_id = ? AND start_date >= '2026-11-01'
  `, [santhosh.id]);
  console.log('Leaves:', leaves);

  const [regs] = await conn.query(`
    SELECT * FROM regularisations WHERE user_id = ? AND request_date >= '2026-11-01'
  `, [santhosh.id]);
  console.log('Regularisations:', regs);

  console.log('--- ALL INCOMPLETE / MISSING PUNCH OUT IN NOV 2026 ---');
  const [incompletes] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id, a.date, a.punch_in, a.punch_out, a.status, a.is_half_day, a.is_permission
    FROM attendance a 
    JOIN users u ON a.user_id = u.id 
    WHERE a.date >= '2026-11-01' AND a.status = 'Incomplete'
    ORDER BY a.date DESC, u.employee_name ASC
  `);
  console.log(`Found ${incompletes.length} incomplete records in Nov 2026:`);
  console.log(incompletes);

  await conn.end();
}
check().catch(console.error);
