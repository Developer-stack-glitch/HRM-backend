const mysql = require('mysql2/promise');

function formatMinutesToTime(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return "00:00";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr || timeStr === "--:--" || timeStr === "00:00") return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function calculateEarlyDeduction(earlyTimeStr) {
  if (!earlyTimeStr || earlyTimeStr === "00:00:00" || earlyTimeStr === "00:00") return 0;
  const earlyMinutes = parseTimeToMinutes(earlyTimeStr);
  if (earlyMinutes <= 0) return 0;
  return Math.ceil(earlyMinutes / 60) * 0.1;
}

async function testLedgerOutput() {
  const conn = await mysql.createConnection({
    host: '159.65.154.184',
    user: 'root',
    password: 'CRM@2024Acte',
    database: 'hrms_database',
    dateStrings: true
  });

  const [rows] = await conn.query(`
    SELECT a.id, a.user_id, u.employee_name, u.emp_id,
           a.punch_in, a.punch_out, a.early_punch_out, a.late_punch_in, a.total_hours, a.status, a.is_edited
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE a.date = '2026-11-21' AND u.emp_id IN ('ACTE260326312', 'ACTE261102395')
  `);

  console.log('--- LEDGER CALCULATION SIMULATION ---');
  rows.forEach(r => {
    const earlyDeduction = calculateEarlyDeduction(r.early_punch_out);
    const earlyPenalty = formatMinutesToTime(Math.round(earlyDeduction * 600));
    const workingDayValue = Math.max(0, 1.0 - earlyDeduction);

    console.log({
      employee: r.employee_name,
      emp_id: r.emp_id,
      clocked_in: r.punch_in,
      clocked_out: r.punch_out,
      working_hours: r.total_hours,
      early_penalty: earlyPenalty,
      working_day_value: workingDayValue,
      status: r.status,
      is_edited: r.is_edited
    });
  });

  await conn.end();
}

testLedgerOutput().catch(console.error);
