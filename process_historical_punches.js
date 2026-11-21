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

async function process() {
    const conn = await mysql.createConnection({
        host: '159.65.154.184',
        user: 'root',
        password: 'CRM@2024Acte',
        database: 'hrms_database',
        dateStrings: true
    });

    console.log('Loading users, shifts, rosters...');
    const [users] = await conn.query('SELECT id, employee_name, emp_id, biometric_id, shift FROM users');
    const userMap = {};
    users.forEach(u => {
        if (u.biometric_id) userMap[String(u.biometric_id).trim()] = u;
        if (u.emp_id) userMap[String(u.emp_id).trim()] = u;
    });

    const [shifts] = await conn.query('SELECT * FROM shifts');
    const shiftMap = {};
    shifts.forEach(s => {
        shiftMap[s.id] = s;
        shiftMap[s.shift_name] = s;
    });

    const rosterMap = {};
    try {
        const [rosters] = await conn.query("SELECT * FROM shift_roster WHERE roster_date >= '2026-10-01'");
        rosters.forEach(r => {
            rosterMap[`${r.user_id}_${r.roster_date}`] = r;
        });
    } catch (e) {
        console.warn('Roster load notice:', e.message);
    }

    console.log('Loading biometric_punches...');
    const [punches] = await conn.query("SELECT emp_id, date, time, DATE_FORMAT(punch_time, '%Y-%m-%d %H:%i:%s') as punch_time, device_name FROM biometric_punches WHERE date >= '2026-10-01' ORDER BY punch_time ASC");
    console.log(`Loaded ${punches.length} punches`);

    // Group punches by user_id and date
    const groups = {};
    punches.forEach(p => {
        const user = userMap[String(p.emp_id).trim()];
        if (!user) return;

        const dateStr = p.date;
        const key = `${user.id}_${dateStr}`;
        if (!groups[key]) {
            groups[key] = {
                user,
                date: dateStr,
                punches: [],
                device_name: p.device_name
            };
        }
        groups[key].punches.push(p.time);
    });

    console.log(`Processing ${Object.keys(groups).length} employee-days...`);
    let updated = 0;
    let created = 0;
    let skipped = 0;

    for (const key of Object.keys(groups)) {
        const { user, date, punches, device_name } = groups[key];
        const punch_in = punches[0];
        const punch_out = punches.length > 1 ? punches[punches.length - 1] : null;

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
        }

        const syncStatus = (punch_in && !punch_out) ? 'Incomplete' : 'Present';
        const bioId = user.biometric_id || user.emp_id;

        // Check if attendance already exists
        const [existing] = await conn.execute(
            'SELECT id, is_edited, punch_in, punch_out FROM attendance WHERE user_id = ? AND date = ?',
            [user.id, date]
        );

        if (existing.length > 0) {
            const attn = existing[0];
            if (Number(attn.is_edited) === 1 || attn.is_edited === true) {
                skipped++;
                continue;
            }

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
            created++;
        }

        // Upsert into biometric_logs
        try {
            await conn.execute(
                `INSERT INTO biometric_logs 
                    (biometric_id, date, deduction, emp_id, employee_name, device_name, punch_in, punch_out, shift, status, total_hours, user_id) 
                 VALUES (?, ?, '0', ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE 
                    punch_in = VALUES(punch_in), 
                    punch_out = VALUES(punch_out), 
                    total_hours = VALUES(total_hours), 
                    status = VALUES(status)`,
                [bioId, date, user.emp_id, user.employee_name, device_name || 'Biometric Device', punch_in, punch_out, activeShiftName || 'General', syncStatus, total_hours, user.id]
            );
        } catch (e) {
            // ignore duplicate or non-fatal
        }
    }

    console.log(`Sync complete! Created: ${created}, Updated: ${updated}, Skipped (manual edits): ${skipped}`);
    await conn.end();
}

process().catch(console.error);
