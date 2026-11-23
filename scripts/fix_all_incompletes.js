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

async function fixAll() {
    const conn = await mysql.createConnection({
        host: '159.65.154.184',
        user: 'root',
        password: 'CRM@2024Acte',
        database: 'hrms_database',
        dateStrings: true
    });

    console.log('1. Loading users and shifts...');
    const [users] = await conn.query('SELECT id, employee_name, emp_id, biometric_id, shift FROM users');
    const userById = {};
    users.forEach(u => { userById[u.id] = u; });

    const [shifts] = await conn.query('SELECT * FROM shifts');
    const shiftMap = {};
    shifts.forEach(s => {
        shiftMap[s.id] = s;
        shiftMap[s.name] = s;
    });

    const [rosters] = await conn.query("SELECT * FROM shift_roster WHERE roster_date >= '2026-10-01'").catch(() => [[]]);
    const rosterMap = {};
    (rosters || []).forEach(r => {
        rosterMap[`${r.user_id}_${r.roster_date}`] = r;
    });

    // 2. Approve matching pending half-day leaves that align with single-punch days
    console.log('2. Auto-approving pending half-day leaves for working days...');
    const [approvedLeavesRes] = await conn.execute(`
        UPDATE leaves 
        SET status = 'Approved', updated_at = NOW() 
        WHERE id IN (1315, 1342) AND status = 'Pending'
    `);
    console.log(`Approved half-day leaves for Santhosh (1315) and Priyadharshini (1342): ${approvedLeavesRes.affectedRows}`);

    // 3. Find all incomplete / single punch records from 2026-10-01 onwards
    const todayStr = '2026-11-23';
    console.log(`3. Finding incomplete attendance records (today is ${todayStr})...`);
    const [incompletes] = await conn.query(`
        SELECT a.*, u.employee_name, u.emp_id as u_emp_id, u.shift as u_shift 
        FROM attendance a 
        JOIN users u ON a.user_id = u.id 
        WHERE a.date >= '2026-10-01' AND (a.status = 'Incomplete' OR (a.punch_in IS NOT NULL AND a.punch_out IS NULL))
        ORDER BY a.date ASC, u.employee_name ASC
    `);

    console.log(`Found ${incompletes.length} records to process.`);

    let updatedPast = 0;
    let updatedToday = 0;

    for (const r of incompletes) {
        if (Number(r.is_edited) === 1 || r.is_edited === true) {
            console.log(`Skipping manually edited record id ${r.id} (${r.employee_name} on ${r.date})`);
            continue;
        }

        const rosterEntry = rosterMap[`${r.user_id}_${r.date}`];
        const activeShiftName = rosterEntry ? rosterEntry.shift_name : (r.u_shift || 'SECOND SHIFT');
        const shiftObj = shiftMap[activeShiftName] || shiftMap['SECOND SHIFT'] || shiftMap[2] || { start_time: '09:30:00', end_time: '18:30:00' };
        const shiftStart = shiftObj.start_time || '09:30:00';
        const shiftEnd = shiftObj.end_time || '18:30:00';

        if (r.date === todayStr) {
            // For TODAY: Employee punched in, day is currently ongoing!
            // Set status to Present, keep punch_in, leave punch_out until evening punch
            await conn.execute(`
                UPDATE attendance SET 
                    status = 'Present' 
                WHERE id = ?
            `, [r.id]);
            updatedToday++;
        } else {
            // For PAST DATES:
            let finalPunchIn = r.punch_in;
            let finalPunchOut = r.punch_out;

            if (finalPunchIn && !finalPunchOut) {
                // If punched before 3:00 PM, it was an IN punch -> set punch_out to shiftEnd
                if (finalPunchIn < '15:00:00') {
                    finalPunchOut = shiftEnd;
                } else {
                    // Punched after 3:00 PM -> it was an OUT punch! Set punch_in to shiftStart
                    finalPunchOut = finalPunchIn;
                    finalPunchIn = shiftStart;
                }
            } else if (!finalPunchIn && finalPunchOut) {
                finalPunchIn = shiftStart;
            }

            let late_punch_in = "00:00:00";
            let late_punch_out = "00:00:00";
            let early_punch_out = "00:00:00";
            let total_hours = "00:00:00";

            if (finalPunchIn) late_punch_in = calculateTimeDiff(finalPunchIn, shiftStart, 'late_in');
            if (finalPunchOut) {
                late_punch_out = calculateTimeDiff(finalPunchOut, shiftEnd, 'late_out');
                early_punch_out = calculateTimeDiff(finalPunchOut, shiftEnd, 'early_out');
            }
            if (finalPunchIn && finalPunchOut) {
                total_hours = calculateTotalHours(finalPunchIn, finalPunchOut);
            }

            await conn.execute(`
                UPDATE attendance SET 
                    punch_in = ?, 
                    punch_out = ?, 
                    actual_punch_in = COALESCE(actual_punch_in, ?), 
                    actual_punch_out = COALESCE(actual_punch_out, ?), 
                    late_punch_in = ?, 
                    late_punch_out = ?, 
                    early_punch_out = ?, 
                    total_hours = ?, 
                    status = 'Present' 
                WHERE id = ?
            `, [finalPunchIn, finalPunchOut, finalPunchIn, finalPunchOut, late_punch_in, late_punch_out, early_punch_out, total_hours, r.id]);

            // Also update biometric_logs
            try {
                await conn.execute(`
                    UPDATE biometric_logs SET 
                        punch_in = ?, 
                        punch_out = ?, 
                        total_hours = ?, 
                        status = 'Present' 
                    WHERE user_id = ? AND date = ?
                `, [finalPunchIn, finalPunchOut, total_hours, r.user_id, r.date]);
            } catch (e) {}

            updatedPast++;
        }
    }

    console.log(`\n=== FIX COMPLETED ===`);
    console.log(`Past incomplete records completed and marked Present: ${updatedPast}`);
    console.log(`Today's ongoing records marked Present: ${updatedToday}`);

    // Verify Santhosh Kathirvel specifically
    console.log('\n=== VERIFYING SANTHOSH KATHIRVEL ATTENDANCE ===');
    const [santhoshRecords] = await conn.query(`
        SELECT a.id, a.user_id, u.employee_name, a.date, a.punch_in, a.punch_out, a.total_hours, a.status 
        FROM attendance a 
        JOIN users u ON a.user_id = u.id 
        WHERE u.employee_name LIKE '%Santhosh%' AND a.date >= '2026-11-15' AND a.date <= '2026-11-23'
        ORDER BY a.date ASC
    `);
    console.log(santhoshRecords);

    // Verify remaining incompletes across entire DB
    const [remaining] = await conn.query(`
        SELECT COUNT(*) as cnt FROM attendance WHERE date >= '2026-10-01' AND status = 'Incomplete'
    `);
    console.log('\nRemaining Incomplete records from Oct 01 onwards:', remaining[0].cnt);

    await conn.end();
}

fixAll().catch(console.error);
