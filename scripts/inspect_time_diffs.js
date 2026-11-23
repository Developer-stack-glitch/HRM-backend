const mysql = require('mysql2/promise');

async function inspectAllPunches() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [punches] = await conn.query(`
    SELECT id, device_sn, emp_id, punch_time, time, created_at,
           TIMESTAMPDIFF(SECOND, punch_time, CONVERT_TZ(created_at, '+00:00', '+05:30')) as diff_seconds
    FROM biometric_punches
    WHERE date = '2026-11-21'
    ORDER BY time ASC
  `);

  console.log(`Total punches on 2026-11-21: ${punches.length}`);
  console.table(punches.map(p => ({
    id: p.id,
    device_sn: p.device_sn,
    emp_id: p.emp_id,
    time: p.time,
    created_at_IST: p.created_at, // Wait, is created_at stored in UTC or IST in the DB?
    diff_minutes: (p.diff_seconds / 60).toFixed(1)
  })));

  // Let's also check DB server timezone
  const [tz] = await conn.query("SELECT @@global.time_zone, @@session.time_zone, NOW(), UTC_TIMESTAMP()");
  console.log('Timezone settings:', tz);

  await conn.end();
}

inspectAllPunches().catch(console.error);
