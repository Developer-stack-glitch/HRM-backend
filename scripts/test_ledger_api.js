const { getAttendanceDataInternal } = require('../controllers/attendanceController');

async function testAttendanceApi() {
    try {
        console.log('--- TESTING getAttendanceDataInternal for November 2026 ---');
        const data = await getAttendanceDataInternal('2026-11-01', '2026-11-30');
        console.log(`Total attendance ledger records returned: ${data.length}`);

        // Filter for Santhosh Kathirvel
        const santhosh = data.filter(d => (d.employee_name && d.employee_name.toLowerCase().includes('santhosh kathirvel')) || d.user_id === 35);
        console.log(`\nSanthosh Kathirvel records (${santhosh.length} days):`);
        santhosh
            .sort((a, b) => a.date.localeCompare(b.date))
            .filter(d => d.date >= '2026-11-15' && d.date <= '2026-11-23')
            .forEach(d => {
                console.log(`Date: ${d.date} | Status: ${d.status} | PunchIn: ${d.punch_in} | PunchOut: ${d.punch_out} | TotalHours: ${d.total_hours} | Late: ${d.late_punch_in} | HalfDay: ${d.is_half_day} | Perms: ${d.permissions ? d.permissions.length : 0}`);
            });

        // Check if ANY employee has status === 'Incomplete'
        const incompletes = data.filter(d => d.status === 'Incomplete');
        console.log(`\nTotal Incomplete records across the entire company: ${incompletes.length}`);
        if (incompletes.length > 0) {
            console.log('Incompletes:', incompletes.map(i => `${i.employee_name} on ${i.date}`));
        } else {
            console.log('SUCCESS! Zero incomplete records found across all employees in November 2026.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error testing attendance API:', err);
        process.exit(1);
    }
}

testAttendanceApi();
