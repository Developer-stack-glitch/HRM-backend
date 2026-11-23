const mysql = require('mysql2/promise');

async function checkAllSatPunches() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [allBio] = await conn.query(`
    SELECT bp.id, bp.device_sn, bp.emp_id, bp.date, bp.time, bp.punch_time, bp.created_at
    FROM biometric_punches bp
    WHERE bp.date = '2026-11-21'
    ORDER BY bp.emp_id, bp.time ASC
  `);

  console.log(`Total punches on 2026-11-21: ${allBio.length}`);
  
  // Group by emp_id
  const byEmp = {};
  allBio.forEach(p => {
    if (!byEmp[p.emp_id]) byEmp[p.emp_id] = [];
    byEmp[p.emp_id].push(p);
  });

  for (const [empId, punches] of Object.entries(byEmp)) {
    console.log(`\nEmp ${empId}: ${punches.map(p => `[ID ${p.id}] ${p.time} (dev: ${p.device_sn})`).join(', ')}`);
  }

  await conn.end();
}

checkAllSatPunches().catch(console.error);
