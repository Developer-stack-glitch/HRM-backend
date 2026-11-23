const mysql = require('mysql2/promise');

async function checkSpecialUsers() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  // Check Dharshini R
  const [dharshiniUser] = await conn.query("SELECT * FROM users WHERE employee_name LIKE '%Dharshini R%'");
  console.log('Dharshini R user:', dharshiniUser);

  if (dharshiniUser.length > 0) {
    const u = dharshiniUser[0];
    const [p] = await conn.query("SELECT * FROM biometric_punches WHERE date = '2026-11-21' AND (emp_id = ? OR emp_id = ?)", [u.emp_id, u.biometric_id]);
    console.log('Dharshini R punches on 21st:', p);
    const [a] = await conn.query("SELECT * FROM attendance WHERE user_id = ? AND date = '2026-11-21'", [u.id]);
    console.log('Dharshini R attendance on 21st:', a);
  }

  // Check Sreenidhi K
  const [sreenidhiUser] = await conn.query("SELECT * FROM users WHERE employee_name LIKE '%Sreenidhi%'");
  console.log('Sreenidhi user:', sreenidhiUser);
  if (sreenidhiUser.length > 0) {
    const u = sreenidhiUser[0];
    const [p] = await conn.query("SELECT * FROM biometric_punches WHERE date = '2026-11-21' AND (emp_id = ? OR emp_id = ?)", [u.emp_id, u.biometric_id]);
    console.log('Sreenidhi punches on 21st:', p);
    const [a] = await conn.query("SELECT * FROM attendance WHERE user_id = ? AND date = '2026-11-21'", [u.id]);
    console.log('Sreenidhi attendance on 21st:', a);
  }

  await conn.end();
}

checkSpecialUsers().catch(console.error);
