const mysql = require('mysql2/promise');

async function analyze() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [incompletes] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id, u.biometric_id, a.date, a.punch_in, a.punch_out, a.status 
    FROM attendance a 
    JOIN users u ON a.user_id = u.id 
    WHERE a.date >= '2026-11-01' AND a.date <= '2026-11-21' AND a.status = 'Incomplete'
    ORDER BY a.date DESC, u.employee_name ASC
  `);

  console.log(`Analyzing ${incompletes.length} incomplete records in Nov 2026:`);

  let hasExtraBioPunches = 0;
  let hasRegularisation = 0;
  let hasLeaveOrPerm = 0;
  let trulyOnlyOnePunch = 0;

  for (const r of incompletes) {
    const [bioPunches] = await conn.query(
      `SELECT * FROM biometric_punches WHERE (emp_id = ? OR emp_id = ? OR emp_id = ?) AND date = ? ORDER BY punch_time ASC`,
      [String(r.user_id), String(r.biometric_id), String(r.emp_id), r.date]
    );

    const [regs] = await conn.query(
      `SELECT * FROM regularisations WHERE user_id = ? AND date = ?`,
      [r.user_id, r.date]
    );

    const [leaves] = await conn.query(
      `SELECT * FROM leaves WHERE employee_id = ? AND start_date <= ? AND end_date >= ?`,
      [r.user_id, r.date, r.date]
    );

    const uniquePunches = [...new Set(bioPunches.map(p => p.time))];

    if (uniquePunches.length > 1) {
      hasExtraBioPunches++;
      console.log(`[MULTIPLE PUNCHES EXIST] User: ${r.employee_name} (${r.user_id}), Date: ${r.date}, Attendance punch_in: ${r.punch_in}, punch_out: ${r.punch_out}, Bio Punches:`, uniquePunches);
    } else if (regs.length > 0) {
      hasRegularisation++;
      console.log(`[HAS REGULARISATION] User: ${r.employee_name}, Date: ${r.date}, PunchIn: ${r.punch_in}, Reg:`, regs.map(x => ({ check_in: x.check_in, check_out: x.check_out, status: x.status, reason: x.reason })));
    } else if (leaves.length > 0) {
      hasLeaveOrPerm++;
      console.log(`[HAS LEAVE/PERM] User: ${r.employee_name}, Date: ${r.date}, PunchIn: ${r.punch_in}, Leave:`, leaves.map(x => ({ type: x.leave_type, status: x.status, half: x.is_half_day, start: x.start_time, end: x.end_time })));
    } else {
      trulyOnlyOnePunch++;
    }
  }

  console.log({
    totalIncompletes: incompletes.length,
    hasExtraBioPunches,
    hasRegularisation,
    hasLeaveOrPerm,
    trulyOnlyOnePunch
  });

  await conn.end();
}

analyze().catch(console.error);
