const mysql = require('mysql2/promise');

async function inspectSatAll() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [allBio] = await conn.query(`
    SELECT id, device_sn, emp_id, punch_time, date, time, created_at 
    FROM biometric_punches 
    WHERE date = '2026-11-21'
    ORDER BY time ASC
  `);
  console.log(`Total biometric punches on 2026-11-21: ${allBio.length}`);
  
  // Group by time range
  const morning = allBio.filter(p => p.time < '12:00:00');
  const afternoon = allBio.filter(p => p.time >= '12:00:00' && p.time < '17:00:00');
  const evening = allBio.filter(p => p.time >= '17:00:00');

  console.log(`Morning (<12:00): ${morning.length}`);
  console.log(`Afternoon (12-17): ${afternoon.length}`);
  console.log(`Evening (>=17:00): ${evening.length}`);

  console.log('\n--- Evening Punches on 2026-11-21 ---');
  console.table(evening.map(p => ({
    id: p.id,
    emp_id: p.emp_id,
    time: p.time,
    punch_time: p.punch_time,
    created_at: p.created_at
  })));

  // Check what attendance records exist on 2026-11-21
  const [allAttn] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id,
           a.punch_in, a.punch_out, a.early_punch_out, a.late_punch_in, a.total_hours, a.status, a.is_edited
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.date = '2026-11-21'
    ORDER BY a.punch_out ASC
  `);
  console.log(`\nTotal attendance rows on 2026-11-21: ${allAttn.length}`);

  await conn.end();
}

inspectSatAll().catch(console.error);
