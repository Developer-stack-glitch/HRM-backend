const mysql = require('mysql2/promise');

async function f() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database'
  });

  const [leaves] = await conn.query('SELECT * FROM `leaves` WHERE employee_id = "ACTE250324193" OR employee_id = "35" OR id IN (1310, 1315)');
  console.log('Leaves for Santhosh:', leaves);

  const [incomp] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id, a.date, a.punch_in, a.punch_out, a.status 
    FROM attendance a 
    JOIN users u ON a.user_id = u.id 
    WHERE a.date >= '2026-11-01' AND a.status = 'Incomplete'
    ORDER BY a.date DESC, u.employee_name ASC
  `);
  console.log('Total Incompletes in Nov 2026:', incomp.length);
  console.log(JSON.stringify(incomp, null, 2));

  await conn.end();
}
f().catch(console.error);
