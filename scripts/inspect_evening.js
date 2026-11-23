const mysql = require('mysql2/promise');

async function inspectEvening() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [eveningBio] = await conn.query(`
    SELECT bp.id, bp.device_sn, bp.emp_id,
           bp.punch_time, bp.time, bp.created_at,
           TIMESTAMPDIFF(MINUTE, bp.punch_time, CONVERT_TZ(bp.created_at, '+00:00', '+05:30')) as diff_mins
    FROM biometric_punches bp
    WHERE bp.date = '2026-11-21' AND bp.device_sn = 'CGKK231063361' AND bp.time >= '17:00:00'
    ORDER BY bp.id ASC
  `);

  const [users] = await conn.query('SELECT id, employee_name, emp_id, biometric_id, shift FROM users');
  const userMap = {};
  users.forEach(u => {
    if (u.biometric_id) userMap[String(u.biometric_id).trim()] = u;
    if (u.emp_id) userMap[String(u.emp_id).trim()] = u;
  });

  const enriched = eveningBio.map(bp => {
    const u = userMap[String(bp.emp_id).trim()];
    return {
      id: bp.id,
      emp_id: bp.emp_id,
      name: u ? u.employee_name : 'Unknown',
      time: bp.time,
      created_at: bp.created_at,
      diff_mins: bp.diff_mins
    };
  });

  console.log(`Evening punches for CGKK231063361 on 2026-11-21: (Total ${enriched.length})`);
  console.table(enriched);

  await conn.end();
}

inspectEvening().catch(console.error);
