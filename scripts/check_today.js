const mysql = require('mysql2/promise');

async function checkToday() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [rows] = await conn.query("SELECT * FROM attendance WHERE date = '2026-11-23' AND user_id = 35");
  console.log('Today row for Santhosh:', rows);

  const [todayAll] = await conn.query("SELECT COUNT(*) as cnt FROM attendance WHERE date = '2026-11-23'");
  console.log('Today total attendance rows in DB:', todayAll[0].cnt);

  await conn.end();
}

checkToday().catch(console.error);
