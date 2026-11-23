const mysql = require('mysql2/promise');

async function f() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database'
  });
  const [res] = await conn.execute("UPDATE attendance SET status = 'Present' WHERE date = '2026-11-23' AND status = 'Incomplete'");
  console.log('Updated today records to Present:', res.affectedRows);

  const [remaining] = await conn.query("SELECT COUNT(*) as cnt FROM attendance WHERE date >= '2026-11-01' AND status = 'Incomplete'");
  console.log('Total remaining incomplete records in Nov 2026:', remaining[0].cnt);

  await conn.end();
}
f().catch(console.error);
