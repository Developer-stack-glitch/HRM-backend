const { pool } = require('./Config/dbConfig');
const controller = require('./controllers/attendanceController');
const ExcelJS = require('exceljs');

async function test() {
    // 1. Get attendance data
    const attendanceData = await controller.getAttendanceDataInternal("2026-05-01", "2026-05-10", 1, 'admin');
    
    // 2. Filter (simulate muster-roll)
    const filteredData = attendanceData;
    
    // 3. Dates array
    const dates = [];
    let curr = new Date("2026-05-01");
    const end = new Date("2026-05-10");
    while (curr <= end) {
        dates.push(controller.formatDate(curr));
        curr.setDate(curr.getDate() + 1);
    }
    
    // 4. Create empGroups
    const empGroups = {};
    filteredData.forEach(a => {
        if (!empGroups[a.user_id]) {
            empGroups[a.user_id] = { records: {} };
        }
        empGroups[a.user_id].records[controller.formatDate(a.date)] = a;
    });

    const santhosh = empGroups['35'];
    console.log("Santhosh records keys:", Object.keys(santhosh.records));
    
    // 5. Generate codes
    dates.forEach(d => {
        const record = santhosh.records[d];
        const status = record?.status || 'N/A';
        let code = '-';

        if (status === 'Present') {
            code = record?.working_day_value !== undefined ? String(record.working_day_value) : '1.0';
        } else if (status === 'Absent') {
            code = 'A';
        } else if (status === 'On Leave' || status === 'Permission') {
            code = 'CL';
        } else if (status === 'Week Off') {
            code = 'W';
        } else if (status === 'Holiday') {
            code = 'H';
        } else if (status === 'Half Day' || (record && record.working_day_value === 0.5)) {
            code = '0.5';
        }
        console.log(`Date: ${d}, Status: ${status}, Code: ${code}`);
    });
    
    process.exit();
}
test();
