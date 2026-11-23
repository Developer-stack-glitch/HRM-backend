const mysql = require('mysql2/promise');

async function searchAll() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  console.log('=== 1. ALL PUNCHES IN BIOMETRIC_PUNCHES ON 2026-11-17 & 2026-11-18 ===');
  const [bioPunches] = await conn.query(`
    SELECT * FROM biometric_punches 
    WHERE date IN ('2026-11-17', '2026-11-18')
    ORDER BY punch_time ASC
  `);
  console.log(`Total biometric punches on Nov 17-18: ${bioPunches.length}`);
  
  // Check all punches around 18:00 - 20:00 on Nov 17 and Nov 18
  const evening17 = bioPunches.filter(p => p.date === '2026-11-17' && p.time >= '17:00:00');
  console.log(`Evening punches on Nov 17: ${evening17.length}`, evening17.map(p => `${p.emp_id} at ${p.time}`));
  
  const evening18 = bioPunches.filter(p => p.date === '2026-11-18' && p.time >= '17:00:00');
  console.log(`Evening punches on Nov 18: ${evening18.length}`, evening18.map(p => `${p.emp_id} at ${p.time}`));

  console.log('\n=== 2. ALL NOTIFICATIONS ON 2026-11-17 & 2026-11-18 ===');
  const [notifs] = await conn.query(`
    SELECT * FROM notifications 
    WHERE created_at >= '2026-11-17 00:00:00' AND created_at <= '2026-11-18 23:59:59'
    ORDER BY created_at ASC
  `);
  console.log(`Total notifications on Nov 17-18: ${notifs.length}`);
  const santhoshNotifs = notifs.filter(n => JSON.stringify(n).toLowerCase().includes('santhosh') || n.user_id === 35);
  console.log('Santhosh notifications:', santhoshNotifs);

  console.log('\n=== 3. CHECK ALL TABLES FOR PUNCH/LOG DATA ===');
  const [tables] = await conn.query('SHOW TABLES');
  console.log('Tables in hrms_database:', tables.map(t => Object.values(t)[0]));

  await conn.end();
}

searchAll().catch(console.error);
