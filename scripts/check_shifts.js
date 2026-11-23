const mysql = require('mysql2/promise');

async function checkShifts() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [shifts] = await conn.query('SELECT * FROM shifts');
  console.log('Shifts:', shifts);

  await conn.end();
}

checkShifts().catch(console.error);
