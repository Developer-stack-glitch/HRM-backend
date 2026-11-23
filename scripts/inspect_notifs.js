const mysql = require('mysql2/promise');

async function f() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [types] = await conn.query('SELECT DISTINCT type, title FROM notifications LIMIT 50');
  console.log('Notification types and titles:', types);

  const [outNotifs] = await conn.query("SELECT * FROM notifications WHERE message LIKE '%clock%' OR message LIKE '%punch%' OR title LIKE '%Punch%' OR title LIKE '%Clock%' LIMIT 20");
  console.log('Clock/Punch notifs count:', outNotifs.length);
  console.log(outNotifs.slice(0, 5));

  await conn.end();
}

f().catch(console.error);
