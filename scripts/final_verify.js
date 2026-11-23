const mysql = require('mysql2/promise');

async function finalVerify() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  console.log('=== 1. SANTHOSH KATHIRVEL ATTENDANCE LEDGER (NOV 15 - 23) ===');
  const [santhosh] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, a.date, a.punch_in, a.punch_out, a.total_hours, a.status, a.late_punch_in 
    FROM attendance a 
    JOIN users u ON a.user_id = u.id 
    WHERE a.user_id = 35 AND a.date >= '2026-11-15' AND a.date <= '2026-11-23'
    ORDER BY a.date ASC
  `);
  console.table(santhosh);

  console.log('\n=== 2. RAJESH G ATTENDANCE LEDGER (NOV 01 - 08) ===');
  const [rajesh] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, a.date, a.punch_in, a.punch_out, a.total_hours, a.status 
    FROM attendance a 
    JOIN users u ON a.user_id = u.id 
    WHERE a.user_id = 128 AND a.date >= '2026-11-01' AND a.date <= '2026-11-08'
    ORDER BY a.date ASC
  `);
  console.table(rajesh);

  console.log('\n=== 3. INCOMPLETE COUNT ACROSS THE ENTIRE COMPANY FOR NOVEMBER ===');
  const [incomp] = await conn.query(`
    SELECT COUNT(*) as incomplete_count 
    FROM attendance 
    WHERE date >= '2026-11-01' AND status = 'Incomplete'
  `);
  console.log(`Remaining Incomplete records for November: ${incomp[0].incomplete_count}`);

  await conn.end();
}

finalVerify().catch(console.error);
