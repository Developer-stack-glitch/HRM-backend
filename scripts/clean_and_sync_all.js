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

function getMinutesFromTime(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

async function cleanAndSync() {
    const conn = await mysql.createConnection({
        host: '159.65.154.184',
        user: 'root',
        password: 'CRM@2024Acte',
        database: 'hrms_database',
        dateStrings: true
    });

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

    const targetDates = ['2026-11-21', '2026-11-23'];
    const todayStr = '2026-11-23';

    for (const targetDate of targetDates) {
        console.log(`\n--- Synchronizing Attendance for ${targetDate} ---`);
        const isToday = (targetDate === todayStr);

        const [punches] = await conn.query(
            "SELECT emp_id, time, punch_state FROM biometric_punches WHERE date = ? ORDER BY time ASC",
            [targetDate]
        );

        const punchesByUser = {};
        punches.forEach(p => {
            const u = userMap[String(p.emp_id).trim()];
            if (!u) return;
            if (!punchesByUser[u.id]) punchesByUser[u.id] = [];
            punchesByUser[u.id].push(p);
        });

        const [existingRecords] = await conn.query(
            "SELECT id, user_id, punch_in, punch_out, is_edited FROM attendance WHERE date = ?",
            [targetDate]
        );
        const existingByUser = {};
        existingRecords.forEach(att => {
            existingByUser[att.user_id] = att;
        });

        for (const [userIdStr, punchList] of Object.entries(punchesByUser)) {
            const user = userById[userIdStr];
            if (!user) continue;

            const existingAtt = existingByUser[user.id];
            if (existingAtt && (Number(existingAtt.is_edited) === 1 || existingAtt.is_edited === true)) {
                continue; // Do not touch manual admin edits
            }

            // Deduplicate punch records
            const validPunches = punchList.filter(p => p.time && p.time !== '00:00' && p.time !== '--:--');
            if (validPunches.length === 0) continue;

            // Sort ascending by time
            validPunches.sort((a, b) => a.time.localeCompare(b.time));

            const shiftObj = shiftMap[user.shift] || shiftMap['SECOND SHIFT'] || { start_time: '09:30:00', end_time: '18:30:00' };
            const shiftStart = shiftObj.start_time || '09:30:00';
            const shiftEnd = shiftObj.end_time || '18:30:00';

            // Earliest punch is ALWAYS punch in (first one across machine or HRMS app)
            const punch_in = validPunches[0].time;
            const punchInMins = getMinutesFromTime(punch_in);

            // Separate punch-ins from punch-outs:
            // Any punch with punch_state === 1 OR occurring at least 4 hours (240 mins) after punch_in is considered an eligible punch-out.
            const punchOutCandidates = validPunches.filter(p => {
                if (p.time === punch_in) return false;
                if (p.punch_state === 1) return true; // Explicit clock-out
                const pMins = getMinutesFromTime(p.time);
                return (pMins - punchInMins >= 240); // At least 4 hours after punch-in
            });

            let punch_out = null;
            if (punchOutCandidates.length > 0) {
                // Show the LAST punch out time either machine or hrms application
                punch_out = punchOutCandidates[punchOutCandidates.length - 1].time;
            } else if (!isToday) {
                // Past completed day fallback to shift end
                punch_out = shiftEnd;
            }

            let late_punch_in = "00:00:00";
            let late_punch_out = "00:00:00";
            let early_punch_out = "00:00:00";
            let total_hours = "00:00:00";

            if (punch_in) late_punch_in = calculateTimeDiff(punch_in, shiftStart, 'late_in');
            if (punch_out) {
                late_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'late_out');
                early_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'early_out');
                const [hIn, mIn, sIn] = punch_in.split(':').map(Number);
                const [hOut, mOut, sOut] = punch_out.split(':').map(Number);
                let diff = (hOut * 3600 + mOut * 60 + (sOut || 0)) - (hIn * 3600 + mIn * 60 + (sIn || 0));
                if (diff < 0) diff += 24 * 3600;
                const h = Math.floor(diff / 3600);
                const m = Math.floor((diff % 3600) / 60);
                const s = diff % 60;
                total_hours = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }

            if (existingAtt) {
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
                `, [punch_in, punch_out, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, existingAtt.id]);
            } else {
                await conn.execute(`
                    INSERT INTO attendance 
                        (user_id, date, punch_in, punch_out, actual_punch_in, actual_punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, status, biometric_id) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Present', ?)
                `, [user.id, targetDate, punch_in, punch_out, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, user.biometric_id || user.emp_id]);
            }
        }
    }

    console.log('\n===============================================');
    console.log('VERIFYING BALAJI R RECORDS (user_id = 23):');
    console.log('===============================================');
    const [balajiRecords] = await conn.query(
        "SELECT id, date, punch_in, punch_out, late_punch_in, early_punch_out, total_hours, status FROM attendance WHERE user_id = 23 AND date IN ('2026-11-21', '2026-11-23') ORDER BY date"
    );
    console.table(balajiRecords);

    console.log('\n===============================================');
    console.log('TODAY (2026-11-23) SAMPLE ATTENDANCE RECORDS:');
    console.log('===============================================');
    const [todayRecords] = await conn.query(`
        SELECT u.employee_name, a.punch_in, a.punch_out, a.late_punch_in, a.early_punch_out, a.status 
        FROM attendance a 
        JOIN users u ON a.user_id = u.id 
        WHERE a.date = '2026-11-23'
        ORDER BY a.punch_in ASC
        LIMIT 25
    `);
    console.table(todayRecords);

    await conn.end();
    console.log('\nRe-sync completed successfully.');
}

cleanAndSync().catch(console.error);
