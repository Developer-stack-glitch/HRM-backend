const mysql = require('mysql2/promise');

async function inspectLeave() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [leave1310] = await conn.query('SELECT * FROM leaves WHERE id = 1310');
  console.log('Leave 1310 (Nov 17):', leave1310);

  const [leave1315] = await conn.query('SELECT * FROM leaves WHERE id = 1315');
  console.log('Leave 1315 (Nov 18):', leave1315);

  await conn.end();
}

inspectLeave().catch(console.error);
