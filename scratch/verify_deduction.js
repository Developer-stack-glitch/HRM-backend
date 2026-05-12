
const { enrichAttendanceRecord } = require('../controllers/attendanceController');
const { pool } = require('../Config/dbConfig');

async function test() {
    // Mock data for March 27 for Divya
    const record = {
        date: '2026-03-27',
        punch_in: '09:23:00',
        punch_out: '18:36:00',
        status: 'Present',
        shift_start: '09:00:00',
        shift_end: '18:00:00',
        user_id: '18',
        employee_id: '18',
        shift: 'General (09:00:00-18:00:00)',
        company: 1
    };

    // Fetch actual data from DB to be sure
    const [permissions] = await pool.execute(`
        SELECT l.*, u.employee_name 
        FROM leaves l 
        JOIN users u ON l.employee_id = u.id 
        WHERE l.leave_type = 'Permission' 
          AND l.start_date = '2026-03-27' 
          AND u.employee_name LIKE '%Divya%'
    `);

    console.log('Actual Permissions in DB:', permissions);

    const dateStr = '2026-03-27';
    console.log('Testing dateStr:', dateStr);
    
    const dayPermissions = permissions.filter(p => {
        const pDate = p.start_date instanceof Date ? p.start_date.toISOString().split('T')[0] : p.start_date;
        console.log(`Checking permission: id=${p.id}, employee_id=${p.employee_id}, start_date=${pDate}`);
        return String(p.employee_id) === '18' && pDate === dateStr && p.leave_type === 'Permission';
    });
    console.log('Filtered dayPermissions in test script:', dayPermissions);

    const enriched = await enrichAttendanceRecord(record, null, permissions, []);
    console.log('Enriched Record Result:', JSON.stringify(enriched, null, 2));
    
    process.exit(0);
}

test();
