const mysql = require('mysql2/promise');

async function verifyLedger() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  // Query all attendance records for 2026-11-21
  const [all21] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id,
           a.punch_in, a.punch_out, a.early_punch_out, a.late_punch_in, a.total_hours, a.status, a.is_edited
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.date = '2026-11-21' AND a.early_punch_out > '00:00:00'
    ORDER BY a.early_punch_out DESC
  `);

  console.log(`Remaining employees on 2026-11-21 with early_punch_out > 0: ${all21.length}`);
  console.table(all21);

  // Specifically check Gokul Nainar S and Ragavan S
  const [targetCheck] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id,
           a.punch_in, a.punch_out, a.early_punch_out, a.late_punch_in, a.total_hours, a.status, a.is_edited
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.date = '2026-11-21' AND u.emp_id IN ('ACTE260326312', 'ACTE261102395')
  `);
  console.log('\nTarget employees check:');
  console.table(targetCheck);

  await conn.end();
}

verifyLedger().catch(console.error);
