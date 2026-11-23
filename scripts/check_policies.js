const mysql = require('mysql2/promise');

async function checkPolicies() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [companyPolicies] = await conn.query('SELECT * FROM company_policies');
  console.log('company_policies:', companyPolicies);

  const [rules] = await conn.query('SELECT * FROM attendance_policy_rules');
  console.log('attendance_policy_rules:', rules);

  await conn.end();
}

checkPolicies().catch(console.error);
