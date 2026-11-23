const mysql = require('mysql2/promise');

async function checkPendingLeaves() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [pending] = await conn.query(`
    SELECT l.*, u.employee_name 
    FROM leaves l 
    JOIN users u ON l.employee_id = u.id 
    WHERE l.start_date >= '2026-11-01' AND l.status = 'Pending'
    ORDER BY l.start_date ASC
  `);
  console.log('Pending leaves in Nov:', pending);

  await conn.end();
}

checkPendingLeaves().catch(console.error);
