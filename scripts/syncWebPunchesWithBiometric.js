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
    if (diff < 0) diff += 24 * 3600; // Overnight

    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function run() {
    const conn = await mysql.createConnection({
        host: '159.65.154.184',
        user: 'root',
        password: 'CRM@2024Acte',
        database: 'hrms_database',
        dateStrings: true
    });

    console.log('1. Loading users...');
    const [users] = await conn.query('SELECT id, employee_name, emp_id, biometric_id, shift FROM users');
    const userById = {};
    const userByBio = {};
    users.forEach(u => {
        userById[u.id] = u;
        if (u.biometric_id) userByBio[String(u.biometric_id).trim()] = u;
        if (u.emp_id) userByBio[String(u.emp_id).trim()] = u;
    });

    console.log('2. Extracting web clock-in notifications...');
    const [notifications] = await conn.query(
        "SELECT message, data, created_at FROM notifications WHERE type = 'attendance' AND message LIKE '%clocked in at%'"
    );
    console.log(`Found ${notifications.length} web clock-in notifications`);

    let webPunchesInserted = 0;
    for (const n of notifications) {
        try {
            const timeMatch = n.message.match(/clocked in at (\d{2}:\d{2}(:\d{2})?)/);
            if (!timeMatch || !n.data) continue;
            let timeStr = timeMatch[1];
            if (timeStr.length === 5) timeStr += ':00';

            const parsed = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
            const userId = parsed.user_id;
            const dateStr = parsed.date;
            if (!userId || !dateStr) continue;

            const user = userById[userId];
            if (!user) continue;

            const bioId = user.biometric_id || user.emp_id;
            const punchTime = `${dateStr} ${timeStr}`;

            const [res] = await conn.execute(
                `INSERT IGNORE INTO biometric_punches 
                    (device_sn, device_name, emp_id, punch_time, date, time, verify_type, punch_state) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ['HRMS_APP', 'HRMS Web App', bioId, punchTime, dateStr, timeStr, 99, 0]
            );
            webPunchesInserted += res.affectedRows;
        } catch (e) {
            // ignore malformed
        }
    }
    console.log(`Inserted ${webPunchesInserted} web clock-ins into biometric_punches`);

    console.log('3. Loading shifts and rosters...');
    const [shifts] = await conn.query('SELECT * FROM shifts');
    const shiftMap = {};
    shifts.forEach(s => {
        shiftMap[s.id] = s;
        shiftMap[s.shift_name] = s;
    });

    const [rosters] = await conn.query("SELECT * FROM shift_roster WHERE roster_date >= '2026-10-01'").catch(() => [[]]);
    const rosterMap = {};
    (rosters || []).forEach(r => {
        rosterMap[`${r.user_id}_${r.roster_date}`] = r;
    });

    console.log('4. Recomputing unified attendance for all employees...');
    const [allPunches] = await conn.query(
        "SELECT emp_id, date, time, DATE_FORMAT(punch_time, '%Y-%m-%d %H:%i:%s') as punch_time, device_name FROM biometric_punches WHERE date >= '2026-10-01' ORDER BY punch_time ASC"
    );

    // Group punches by user_id and date
    const groups = {};
    for (const p of allPunches) {
        const user = userByBio[String(p.emp_id).trim()];
        if (!user) continue;

        const key = `${user.id}_${p.date}`;
        if (!groups[key]) {
            groups[key] = {
                user,
                date: p.date,
                punches: []
            };
        }
        groups[key].punches.push(p.time);
    }

    console.log(`Merging punches across ${Object.keys(groups).length} employee-days...`);
    let updated = 0;
    let completedDays = 0;

    for (const key of Object.keys(groups)) {
        const { user, date, punches } = groups[key];
        const uniquePunches = [...new Set(punches.filter(p => p && p !== '--:--' && p !== '00:00'))].sort();
        if (uniquePunches.length === 0) continue;

        const punch_in = uniquePunches[0];
        const punch_out = uniquePunches.length > 1 ? uniquePunches[uniquePunches.length - 1] : null;

        const rosterEntry = rosterMap[`${user.id}_${date}`];
        const activeShiftName = rosterEntry ? rosterEntry.shift_name : user.shift;
        const shiftObj = shiftMap[activeShiftName] || shiftMap[user.shift] || {};
        const shiftStart = shiftObj.start_time || null;
        const shiftEnd = shiftObj.end_time || null;

        let late_punch_in = "00:00:00";
        let late_punch_out = "00:00:00";
        let early_punch_out = "00:00:00";
        let total_hours = "00:00:00";

        if (shiftStart && shiftEnd) {
            if (punch_in) late_punch_in = calculateTimeDiff(punch_in, shiftStart, 'late_in');
            if (punch_out) {
                late_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'late_out');
                early_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'early_out');
            }
        }
        if (punch_in && punch_out) {
            total_hours = calculateTotalHours(punch_in, punch_out);
            completedDays++;
        }

        const syncStatus = (punch_in && !punch_out) ? 'Incomplete' : 'Present';
        const bioId = user.biometric_id || user.emp_id;

        const [existing] = await conn.execute(
            'SELECT id, is_edited FROM attendance WHERE user_id = ? AND date = ?',
            [user.id, date]
        );

        if (existing.length > 0) {
            const attn = existing[0];
            if (Number(attn.is_edited) === 1 || attn.is_edited === true) continue;

            await conn.execute(
                `UPDATE attendance SET 
                    punch_in = ?, 
                    punch_out = ?, 
                    actual_punch_in = ?, 
                    actual_punch_out = ?, 
                    late_punch_in = ?, 
                    late_punch_out = ?, 
                    early_punch_out = ?, 
                    total_hours = ?, 
                    status = ?, 
                    biometric_id = ? 
                 WHERE id = ?`,
                [punch_in, punch_out, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, syncStatus, bioId, attn.id]
            );
            updated++;
        } else {
            await conn.execute(
                `INSERT INTO attendance 
                    (user_id, date, punch_in, punch_out, actual_punch_in, actual_punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, status, biometric_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [user.id, date, punch_in, punch_out, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, syncStatus, bioId]
            );
            updated++;
        }

        // Also update biometric_logs
        try {
            await conn.execute(
                `INSERT INTO biometric_logs 
                    (biometric_id, date, deduction, emp_id, employee_name, device_name, punch_in, punch_out, shift, status, total_hours, user_id) 
                 VALUES (?, ?, '0', ?, ?, 'Unified Sync', ?, ?, ?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE 
                    punch_in = VALUES(punch_in), 
                    punch_out = VALUES(punch_out), 
                    total_hours = VALUES(total_hours), 
                    status = VALUES(status)`,
                [bioId, date, user.emp_id, user.employee_name, punch_in, punch_out, activeShiftName || 'General', syncStatus, total_hours, user.id]
            );
        } catch (e) {}
    }

    console.log(`Sync complete! Updated/synced: ${updated} records. Full days with both in and out: ${completedDays}`);
    await conn.end();
}

run().catch(console.error);
