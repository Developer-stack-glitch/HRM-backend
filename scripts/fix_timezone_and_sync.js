const mysql = require('mysql2/promise');

function calculateTimeDiff(time1, time2, type = 'late_in') {
    if (!time1 || !time2) return "00:00:00";
    const [h1, m1, s1] = time1.split(':').map(Number);
    let [h2, m2, s2] = time2.split(':').map(Number);

    if (type === 'late_in' && h2 === 9 && m2 === 0) {
        m2 = 30; // 30 min grace for 09:00 shift
    }

    const t1Mins = h1 * 60 + m1;
    const t2Mins = h2 * 60 + m2;
    let diff = 0;

    if (type === 'late_in') {
        if (t1Mins <= t2Mins) return "00:00:00";
        diff = (t1Mins * 60 + (s1 || 0)) - (t2Mins * 60 + (s2 || 0));
    } else if (type === 'early_out') {
        if (t1Mins >= t2Mins) return "00:00:00";
        diff = (t2Mins * 60 + (s2 || 0)) - (t1Mins * 60 + (s1 || 0));
    } else if (type === 'late_out') {
        if (t1Mins <= t2Mins) return "00:00:00";
        diff = (t1Mins * 60 + (s1 || 0)) - (t2Mins * 60 + (s2 || 0));
    }

    if (diff <= 0) return "00:00:00";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

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

async function fixTimezoneAndSync() {
    const conn = await mysql.createConnection({
        host: '159.65.154.184',
        user: 'root',
        password: 'CRM@2024Acte',
        database: 'hrms_database',
        dateStrings: true
    });

    console.log('1. Adjusting 30-minute machine clock offset on ADMS punches (id >= 226867)...');
    const [shiftRes] = await conn.execute(`
        UPDATE biometric_punches 
        SET punch_time = DATE_ADD(punch_time, INTERVAL 30 MINUTE),
            time = DATE_FORMAT(DATE_ADD(CONCAT(date, ' ', time), INTERVAL 30 MINUTE), '%H:%i:%s')
        WHERE device_sn = 'CGKK231063361' AND id >= 226867
    `);
    console.log(`Shifted ${shiftRes.affectedRows} machine punches by +30 minutes.`);

    console.log('\n2. Recomputing attendance for Nov 21 and Nov 23 applying First Punch In & Last Punch Out rule...');
    const [users] = await conn.query('SELECT id, employee_name, emp_id, biometric_id, shift FROM users');
    const userMap = {};
    const userById = {};
    users.forEach(u => {
        userById[u.id] = u;
        if (u.biometric_id) userMap[String(u.biometric_id).trim()] = u;
        if (u.emp_id) userMap[String(u.emp_id).trim()] = u;
    });

    const [shifts] = await conn.query('SELECT * FROM shifts');
    const shiftMap = {};
    shifts.forEach(s => {
        shiftMap[s.id] = s;
        shiftMap[s.name] = s;
    });

    const dates = ['2026-11-21', '2026-11-23'];

    for (const targetDate of dates) {
        console.log(`\n--- Processing ${targetDate} ---`);

        // Fetch all punches for this date
        const [bioPunches] = await conn.query(
            "SELECT emp_id, time FROM biometric_punches WHERE date = ? ORDER BY time ASC",
            [targetDate]
        );

        // Fetch existing attendance records
        const [existingAttn] = await conn.query(
            "SELECT * FROM attendance WHERE date = ?",
            [targetDate]
        );
        const attnByUser = {};
        existingAttn.forEach(a => { attnByUser[a.user_id] = a; });

        // Group all punches by user
        const punchesByUser = {};
        bioPunches.forEach(p => {
            const u = userMap[String(p.emp_id).trim()];
            if (!u) return;
            if (!punchesByUser[u.id]) punchesByUser[u.id] = [];
            punchesByUser[u.id].push(p.time);
        });

        // Add any web punches from existing attendance
        existingAttn.forEach(a => {
            if (!punchesByUser[a.user_id]) punchesByUser[a.user_id] = [];
            if (a.punch_in && a.punch_in !== '00:00' && a.punch_in !== '--:--') {
                punchesByUser[a.user_id].push(a.punch_in);
            }
            if (a.punch_out && a.punch_out !== '00:00' && a.punch_out !== '--:--') {
                punchesByUser[a.user_id].push(a.punch_out);
            }
            if (a.actual_punch_in && a.actual_punch_in !== '00:00') {
                punchesByUser[a.user_id].push(a.actual_punch_in);
            }
            if (a.actual_punch_out && a.actual_punch_out !== '00:00') {
                punchesByUser[a.user_id].push(a.actual_punch_out);
            }
        });

        for (const [userIdStr, punchList] of Object.entries(punchesByUser)) {
            const user = userById[userIdStr];
            if (!user) continue;

            const existing = attnByUser[user.id];
            if (existing && (Number(existing.is_edited) === 1 || existing.is_edited === true)) {
                continue;
            }

            const uniquePunches = [...new Set(punchList.filter(p => p && p !== '00:00' && p !== '--:--'))].sort();
            if (uniquePunches.length === 0) continue;

            // FIRST PUNCH = Punch In (earliest of either machine or HRMS application)
            const punch_in = uniquePunches[0];

            // LAST PUNCH = Punch Out (latest of either machine or HRMS application)
            // For TODAY (2026-11-23), only set punch_out if employee has punched more than once
            let punch_out = null;
            if (uniquePunches.length > 1) {
                punch_out = uniquePunches[uniquePunches.length - 1];
            } else if (targetDate === '2026-11-21') {
                // For Saturday, if only one punch existed, shift end
                punch_out = '18:30:00';
            }

            const shiftObj = shiftMap[user.shift] || shiftMap['SECOND SHIFT'] || { start_time: '09:30:00', end_time: '18:30:00' };
            const shiftStart = shiftObj.start_time || '09:30:00';
            const shiftEnd = shiftObj.end_time || '18:30:00';

            let late_punch_in = "00:00:00";
            let late_punch_out = "00:00:00";
            let early_punch_out = "00:00:00";
            let total_hours = "00:00:00";

            if (punch_in) late_punch_in = calculateTimeDiff(punch_in, shiftStart, 'late_in');
            if (punch_out) {
                late_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'late_out');
                early_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'early_out');
                total_hours = calculateTotalHours(punch_in, punch_out);
            }

            if (existing) {
                await conn.execute(`
                    UPDATE attendance SET 
                        punch_in = ?, 
                        punch_out = ?, 
                        actual_punch_in = ?, 
                        actual_punch_out = ?, 
                        late_punch_in = ?, 
                        late_punch_out = ?, 
                        early_punch_out = ?, 
                        total_hours = ?, 
                        status = 'Present'
                    WHERE id = ?
                `, [punch_in, punch_out, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, existing.id]);
            } else {
                await conn.execute(`
                    INSERT INTO attendance 
                        (user_id, date, punch_in, punch_out, actual_punch_in, actual_punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, status, biometric_id) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Present', ?)
                `, [user.id, targetDate, punch_in, punch_out, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, user.biometric_id || user.emp_id]);
            }
        }
    }

    console.log('\n=== VERIFY BALAJI R ATTENDANCE AFTER FIX ===');
    const [balajiCheck] = await conn.query(`
        SELECT a.id, a.user_id, u.employee_name, a.date, a.punch_in, a.punch_out, a.early_punch_out, a.late_punch_in, a.total_hours, a.status 
        FROM attendance a 
        JOIN users u ON a.user_id = u.id 
        WHERE u.employee_name LIKE '%Balaji R%' AND a.date IN ('2026-11-21', '2026-11-23')
        ORDER BY a.date ASC
    `);
    console.table(balajiCheck);

    await conn.end();
}

fixTimezoneAndSync().catch(console.error);
