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

async function syncToday() {
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

    const todayStr = '2026-11-23';
    console.log(`Re-syncing pure punches for today ${todayStr}...`);

    const [punches] = await conn.query(
        "SELECT emp_id, time FROM biometric_punches WHERE date = ? ORDER BY time ASC",
        [todayStr]
    );

    const punchesByUser = {};
    punches.forEach(p => {
        const u = userMap[String(p.emp_id).trim()];
        if (!u) return;
        if (!punchesByUser[u.id]) punchesByUser[u.id] = [];
        punchesByUser[u.id].push(p.time);
    });

    for (const [userIdStr, list] of Object.entries(punchesByUser)) {
        const user = userById[userIdStr];
        if (!user) continue;

        const uniquePunches = [...new Set(list.filter(p => p && p !== '00:00' && p !== '--:--'))].sort();
        if (uniquePunches.length === 0) continue;

        const punch_in = uniquePunches[0];
        const punch_out = uniquePunches.length > 1 ? uniquePunches[uniquePunches.length - 1] : null;

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
            const [hIn, mIn, sIn] = punch_in.split(':').map(Number);
            const [hOut, mOut, sOut] = punch_out.split(':').map(Number);
            let diff = (hOut * 3600 + mOut * 60 + (sOut || 0)) - (hIn * 3600 + mIn * 60 + (sIn || 0));
            if (diff < 0) diff += 24 * 3600;
            const h = Math.floor(diff / 3600);
            const m = Math.floor((diff % 3600) / 60);
            const s = diff % 60;
            total_hours = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }

        const [existing] = await conn.query("SELECT id, is_edited FROM attendance WHERE user_id = ? AND date = ?", [user.id, todayStr]);

        if (existing.length > 0) {
            if (Number(existing[0].is_edited) === 1 || existing[0].is_edited === true) continue;
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
            `, [punch_in, punch_out, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, existing[0].id]);
        } else {
            await conn.execute(`
                INSERT INTO attendance 
                    (user_id, date, punch_in, punch_out, actual_punch_in, actual_punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, status, biometric_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Present', ?)
            `, [user.id, todayStr, punch_in, punch_out, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, user.biometric_id || user.emp_id]);
        }
    }

    console.log('\n=== BALAJI R VERIFICATION TODAY (2026-11-23) ===');
    const [balaji] = await conn.query("SELECT * FROM attendance WHERE user_id = 23 AND date = '2026-11-23'");
    console.log({
        name: 'BALAJI R',
        date: balaji[0].date,
        punch_in: balaji[0].punch_in,
        punch_out: balaji[0].punch_out,
        late_punch_in: balaji[0].late_punch_in,
        status: balaji[0].status
    });

    console.log('\n=== ALL TODAY PUNCH-IN TIMES ===');
    const [allToday] = await conn.query(`
        SELECT u.employee_name, a.punch_in, a.punch_out, a.status 
        FROM attendance a 
        JOIN users u ON a.user_id = u.id 
        WHERE a.date = '2026-11-23'
        ORDER BY a.punch_in ASC
    `);
    console.table(allToday);

    await conn.end();
}

syncToday().catch(console.error);
