const mysql = require('mysql2/promise');

function calculateTotalHours(inTime, outTime) {
  if (!inTime || !outTime) return "00:00:00";
  const [hIn, mIn, sIn] = inTime.split(':').map(Number);
  const [hOut, mOut, sOut] = outTime.split(':').map(Number);

  let diff = (hOut * 3600 + mOut * 60 + (sOut || 0)) - (hIn * 3600 + mIn * 60 + (sIn || 0));
  if (diff < 0) diff += 24 * 3600;

  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function calculateLatePunchOut(punchOut, shiftEnd) {
  if (!punchOut || !shiftEnd) return "00:00:00";
  const [h1, m1, s1] = punchOut.split(':').map(Number);
  const [h2, m2, s2] = shiftEnd.split(':').map(Number);
  const diff = (h1 * 3600 + m1 * 60 + (s1 || 0)) - (h2 * 3600 + m2 * 60 + (s2 || 0));
  if (diff <= 0) return "00:00:00";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function executeFix() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  console.log('1. Removing 19 unshifted biometric duplicate punches...');
  const unshiftedIds = [
    115468, 115469, 115470, 115471, 115472, 115473, 115474, 115475, 
    115476, 115477, 115478, 115479, 115480, 115481, 115482, 117403, 
    117788, 117917, 118430
  ];
  const [delRes] = await conn.query('DELETE FROM biometric_punches WHERE id IN (?)', [unshiftedIds]);
  console.log(`Deleted ${delRes.affectedRows} unshifted duplicate punch rows.`);

  console.log('\n2. Fetching shifted punches to update attendance...');
  const [shiftedPunches] = await conn.query(
    'SELECT * FROM biometric_punches WHERE id >= 450321 AND id <= 450456'
  );

  // Shifts
  const [shifts] = await conn.query('SELECT * FROM shifts');
  const shiftMap = {};
  shifts.forEach(s => {
    shiftMap[String(s.id)] = s;
    shiftMap[s.name] = s;
  });

  // Users
  const [users] = await conn.query('SELECT id, employee_name, emp_id, biometric_id, shift FROM users');
  const userMap = {};
  users.forEach(u => {
    if (u.biometric_id) userMap[String(u.biometric_id).trim()] = u;
    if (u.emp_id) userMap[String(u.emp_id).trim()] = u;
  });

  // Current attendance
  const [attnRows] = await conn.query("SELECT * FROM attendance WHERE date = '2026-11-21'");
  const attnByUser = {};
  attnRows.forEach(a => { attnByUser[a.user_id] = a; });

  const maxShiftedByEmp = {};
  shiftedPunches.forEach(p => {
    if (!maxShiftedByEmp[p.emp_id] || p.time > maxShiftedByEmp[p.emp_id].time) {
      maxShiftedByEmp[p.emp_id] = p;
    }
  });

  console.log(`Updating attendance for ${Object.keys(maxShiftedByEmp).length} employees...`);
  for (const [bioId, shiftedP] of Object.entries(maxShiftedByEmp)) {
    const u = userMap[bioId];
    if (!u) continue;
    const attn = attnByUser[u.id];
    if (!attn) continue;

    const shiftObj = shiftMap[String(u.shift)] || shiftMap['SECOND SHIFT'] || { start_time: '09:30:00', end_time: '18:30:00' };
    const shiftEnd = shiftObj.end_time || '18:30:00';

    const newPunchOut = shiftedP.time;
    const newTotalHours = calculateTotalHours(attn.punch_in, newPunchOut);
    const newLatePunchOut = calculateLatePunchOut(newPunchOut, shiftEnd);

    await conn.execute(`
      UPDATE attendance SET
        punch_out = ?,
        actual_punch_out = ?,
        early_punch_out = '00:00:00',
        late_punch_out = ?,
        total_hours = ?,
        status = 'Present',
        is_edited = 0
      WHERE id = ?
    `, [newPunchOut, newPunchOut, newLatePunchOut, newTotalHours, attn.id]);

    console.log(`Updated ${u.employee_name}: punch_out=${newPunchOut}, total_hours=${newTotalHours}, early_punch_out=00:00:00`);
  }

  console.log('\n3. Verifying updated attendance records for Nov 21, 2026...');
  const [verifyRows] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id,
           a.punch_in, a.punch_out, a.early_punch_out, a.late_punch_out, a.total_hours, a.status, a.is_edited
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.date = '2026-11-21' AND a.user_id IN (
      SELECT u2.id FROM users u2 WHERE u2.biometric_id IN (?)
    )
    ORDER BY a.punch_out ASC
  `, [Object.keys(maxShiftedByEmp)]);

  console.table(verifyRows);

  await conn.end();
}

executeFix().catch(console.error);
