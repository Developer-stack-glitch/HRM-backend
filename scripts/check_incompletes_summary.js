const mysql = require('mysql2/promise');

async function checkIncompletesSummary() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [incompletes] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id, a.date, a.punch_in, a.punch_out, a.status 
    FROM attendance a 
    JOIN users u ON a.user_id = u.id 
    WHERE a.date >= '2026-11-01' AND a.status = 'Incomplete'
    ORDER BY u.employee_name ASC, a.date ASC
  `);

  console.log(`Total incomplete records in Nov: ${incompletes.length}`);
  
  // Group by employee
  const byEmp = {};
  incompletes.forEach(r => {
    if (!byEmp[r.employee_name]) byEmp[r.employee_name] = [];
    byEmp[r.employee_name].push({ date: r.date, punch_in: r.punch_in, punch_out: r.punch_out });
  });

  console.log('Employees with incomplete records in Nov:', Object.keys(byEmp).length);
  for (const [name, dates] of Object.entries(byEmp)) {
    console.log(`${name} (${dates.length} days):`, dates.map(d => `${d.date} (${d.punch_in})`).join(', '));
  }

  await conn.end();
}

checkIncompletesSummary().catch(console.error);
