const mysql = require('mysql2/promise');

async function checkDuplicates() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [dupes] = await conn.query(`
    SELECT bp1.id as unshifted_id, bp1.emp_id, bp1.time as unshifted_time, 
           bp2.id as shifted_id, bp2.time as shifted_time
    FROM biometric_punches bp1
    JOIN biometric_punches bp2 ON bp1.emp_id = bp2.emp_id 
      AND bp1.date = bp2.date 
      AND bp2.id > bp1.id
      AND bp2.time = DATE_FORMAT(DATE_ADD(CONCAT(bp1.date, ' ', bp1.time), INTERVAL 30 MINUTE), '%H:%i:%s')
    WHERE bp1.date = '2026-11-21' AND bp1.device_sn = 'CGKK231063361'
  `);
  console.log(`Found ${dupes.length} duplicate pairs on 2026-11-21:`);
  console.table(dupes);

  // Check punches for Dharshini R (emp_id 2474) on 2026-11-21
  const [dharshini] = await conn.query(`
    SELECT * FROM biometric_punches WHERE date = '2026-11-21' AND emp_id = '2474'
  `);
  console.log('Dharshini R punches:', dharshini);

  // Check punches for Santhosh Kathirvel (emp_id 3003) on 2026-11-21
  const [santhosh] = await conn.query(`
    SELECT * FROM biometric_punches WHERE date = '2026-11-21' AND emp_id = '3003'
  `);
  console.log('Santhosh Kathirvel punches:', santhosh);

  await conn.end();
}

checkDuplicates().catch(console.error);
