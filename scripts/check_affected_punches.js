const mysql = require('mysql2/promise');

async function checkAffectedPunches() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  console.log('=== SATURDAY NOV 21 PUNCHES FROM CGKK231063361 ===');
  const [sat] = await conn.query(`
    SELECT * FROM biometric_punches 
    WHERE date = '2026-11-21' AND device_sn = 'CGKK231063361'
    ORDER BY punch_time ASC
  `);
  console.log(`Total Saturday punches: ${sat.length}`);
  console.log('Sample Saturday evening punches:');
  console.log(sat.slice(-10).map(p => ({ id: p.id, emp_id: p.emp_id, punch_time: p.punch_time, time: p.time })));

  console.log('\n=== TODAY NOV 23 PUNCHES FROM CGKK231063361 ===');
  const [today] = await conn.query(`
    SELECT * FROM biometric_punches 
    WHERE date = '2026-11-23' AND device_sn = 'CGKK231063361'
    ORDER BY punch_time ASC
  `);
  console.log(`Total Today punches: ${today.length}`);
  console.log('Sample Today punches:');
  console.log(today.slice(0, 15).map(p => ({ id: p.id, emp_id: p.emp_id, punch_time: p.punch_time, time: p.time })));

  await conn.end();
}

checkAffectedPunches().catch(console.error);
