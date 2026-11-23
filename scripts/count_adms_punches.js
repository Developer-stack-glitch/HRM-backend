const mysql = require('mysql2/promise');

async function f() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });
  const [rows] = await conn.query("SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as cnt FROM biometric_punches WHERE device_sn = 'CGKK231063361' AND id >= 226867");
  console.log('ADMS punches count:', rows);
  await conn.end();
}
f().catch(console.error);
