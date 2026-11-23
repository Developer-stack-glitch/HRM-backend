const { pool } = require('../Config/dbConfig');
const { formatDate } = require('../controllers/attendanceController');

async function f() {
  const [rows] = await pool.execute('SELECT date FROM attendance WHERE date = "2026-11-23" LIMIT 1');
  console.log('Raw row date:', rows[0].date, 'Type:', typeof rows[0].date);
  console.log('formatDate result:', formatDate(rows[0].date));
  process.exit(0);
}

f().catch(console.error);
