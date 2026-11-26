const { pool } = require('../Config/dbConfig');
const BiometricPunch = require('../models/biometricPunchModel');
const BiometricLog = require('../models/biometricLogModel');
const Attendance = require('../models/attendanceModel');
const Device = require('../models/deviceModel');
const { User } = require('../models/userModel');
const ShiftRoster = require('../models/shiftRosterModel');

const istDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

const istDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
});

/**
 * Helper to get current date in IST (YYYY-MM-DD)
 */
const getISTDate = (dateObj = new Date()) => {
    return istDateFormatter.format(dateObj);
};

/**
 * Helper to get current datetime string in IST (YYYY-MM-DD HH:mm:ss)
 */
const getISTDateTimeStr = (dateObj = new Date()) => {
    return istDateTimeFormatter.format(dateObj).replace(/,/g, '');
};

/**
 * Shift an IST date/time pair by offsetMinutes and return normalized parts.
 */
const shiftISTDateTime = (date, time, offsetMinutes) => {
    const baseMs = new Date(`${date}T${time}+05:30`).getTime();
    if (Number.isNaN(baseMs)) return { date, time, punchTime: `${date} ${time}` };
    const shifted = new Date(baseMs + offsetMinutes * 60 * 1000);
    const [newDate, newTime] = getISTDateTimeStr(shifted).split(' ');
    return { date: newDate, time: newTime, punchTime: `${newDate} ${newTime}` };
};

/**
 * Helper to calculate time difference for late in, early out, late out
 */
const calculateTimeDiff = (time1, time2, type = 'late_in') => {
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
};

/**
 * Helper to get total minutes from HH:mm:ss
 */
const getMinutesFromTime = (t) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

/**
 * Helper to calculate total hours worked
 */
const calculateTotalHours = (inTime, outTime) => {
    if (!inTime || !outTime) return "00:00:00";
    const [hIn, mIn, sIn] = inTime.split(':').map(Number);
    const [hOut, mOut, sOut] = outTime.split(':').map(Number);

    let diff = (hOut * 3600 + mOut * 60 + (sOut || 0)) - (hIn * 3600 + mIn * 60 + (sIn || 0));
    if (diff < 0) diff += 24 * 3600; // Overnight shift

    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/**
 * Helper to fetch shift times
 */
const getShiftTimes = async (shiftInput) => {
    if (!shiftInput) return { start: null, end: null };
    try {
        if (!isNaN(shiftInput) && typeof shiftInput !== 'object') {
            const [dbShifts] = await pool.execute('SELECT * FROM shifts WHERE id = ?', [shiftInput]);
            if (dbShifts.length > 0) {
                return { start: dbShifts[0].start_time, end: dbShifts[0].end_time };
            }
        }
        const [dbShiftsByName] = await pool.execute('SELECT * FROM shifts WHERE shift_name = ?', [String(shiftInput)]);
        if (dbShiftsByName.length > 0) {
            return { start: dbShiftsByName[0].start_time, end: dbShiftsByName[0].end_time };
        }
    } catch (e) {
        console.error('[ADMS] getShiftTimes error:', e.message);
    }
    return { start: null, end: null };
};

/**
 * Helper to auto-register or fetch device by Serial Number
 */
const getOrCreateDevice = async (sn) => {
    if (!sn) return { id: null, name: 'Unknown Device', serial_number: 'UNKNOWN', clock_offset_minutes: 0 };
    try {
        await Device.ensureClockOffsetColumn();
        const [rows] = await pool.execute('SELECT * FROM devices WHERE serial_number = ?', [sn]);
        if (rows.length > 0) {
            return rows[0];
        }
        // Auto-register device if not found
        const deviceName = `Biometric-${sn}`;
        const [result] = await pool.execute(
            'INSERT INTO devices (name, serial_number, location) VALUES (?, ?, ?)',
            [deviceName, sn, 'Auto-registered (ADMS)']
        );
        return { id: result.insertId, name: deviceName, serial_number: sn, clock_offset_minutes: 0 };
    } catch (err) {
        console.warn('[ADMS] Error resolving device:', err.message);
        return { id: null, name: `Biometric-${sn}`, serial_number: sn, clock_offset_minutes: 0 };
    }
};

/**
 * Parse and calibrate raw text payload sent by eSSL / ZKTeco biometric devices.
 *
 * When a device has a known hardware clock offset (e.g. +30 min for GMT+5.0
 * devices reporting 30 mins behind IST), all punches in real-time AND delayed
 * or overnight batch uploads are shifted unless doing so would move punches
 * into the future (which indicates the device hardware clock was synced to IST).
 */
const parseAndCalibrateAttlog = (rawBody, sn = 'UNKNOWN', clockOffsetMinutes = 0, nowMs = Date.now()) => {
    if (!rawBody || typeof rawBody !== 'string') {
        return { punches: [], shouldResetOffset: false };
    }

    const lines = rawBody.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsedEntries = [];

    for (const line of lines) {
        // Skip header lines
        if (/^ATTLOG/i.test(line) || /^CMD/i.test(line) || /^USER/i.test(line)) continue;

        let empId = null;
        let punchTime = null;
        let verifyType = 0;
        let punchState = 0;
        let workCode = null;

        if (line.includes('PIN=') || line.includes('pin=')) {
            // Key-Value format: PIN=101\tTIME=2026-11-21 09:30:00\tSTATUS=1\tVERIFY=1
            const parts = line.split(/[\t\s]+/);
            for (const part of parts) {
                const [k, v] = part.split('=');
                if (!k || !v) continue;
                const keyUpper = k.toUpperCase().trim();
                if (keyUpper === 'PIN') empId = v.trim();
                else if (keyUpper === 'TIME') punchTime = v.trim();
                else if (keyUpper === 'STATUS') punchState = parseInt(v.trim(), 10) || 0;
                else if (keyUpper === 'VERIFY') verifyType = parseInt(v.trim(), 10) || 0;
                else if (keyUpper === 'WORKCODE') workCode = v.trim();
            }
        } else {
            // Delimited format: TAB, COMMA, or SPACE separated
            // e.g.: 101\t2026-11-21 09:30:15\t1\t1\t0\t0
            let parts = line.split('\t');
            if (parts.length < 2) {
                parts = line.split(',');
            }
            if (parts.length < 2) {
                // If space separated, care must be taken because datetime contains a space
                const spaceMatch = line.match(/^(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})(.*)$/);
                if (spaceMatch) {
                    empId = spaceMatch[1].trim();
                    punchTime = spaceMatch[2].trim();
                    const remainder = spaceMatch[3].trim().split(/\s+/);
                    punchState = parseInt(remainder[0], 10) || 0;
                    verifyType = parseInt(remainder[1], 10) || 0;
                }
            } else {
                empId = (parts[0] || '').trim();
                punchTime = (parts[1] || '').trim();
                punchState = parseInt(parts[2], 10) || 0;
                verifyType = parseInt(parts[3], 10) || 0;
                workCode = parts[4] ? parts[4].trim() : null;
            }
        }

        if (empId && punchTime) {
            const dtParts = punchTime.split(' ');
            if (dtParts.length >= 2) {
                parsedEntries.push({
                    empId,
                    date: dtParts[0].trim(),
                    time: dtParts[1].trim(),
                    verifyType,
                    punchState,
                    workCode
                });
            }
        }
    }

    const offsetMins = Number(clockOffsetMinutes) || 0;
    const FUTURE_TOLERANCE_MS = 3 * 60 * 1000;
    const REALTIME_TOLERANCE_MS = 5 * 60 * 1000;

    let shouldResetOffset = false;
    let applyDeviceOffset = offsetMins > 0;

    if (applyDeviceOffset && parsedEntries.length > 0) {
        for (const entry of parsedEntries) {
            const punchMs = new Date(`${entry.date}T${entry.time}+05:30`).getTime();
            if (Number.isNaN(punchMs)) continue;
            if (punchMs + offsetMins * 60 * 1000 > nowMs + FUTURE_TOLERANCE_MS) {
                // Shifting would land in the future, so this device is already reporting IST
                applyDeviceOffset = false;
                if (Math.abs(nowMs - punchMs) <= REALTIME_TOLERANCE_MS) {
                    shouldResetOffset = true;
                }
                break;
            }
        }
    }

    const todayIST = getISTDate(new Date(nowMs));
    const punches = parsedEntries.map((entry) => {
        let { date, time } = entry;
        let punchTime = `${date} ${time}`;

        try {
            const punchMs = new Date(`${date}T${time}+05:30`).getTime();
            if (!Number.isNaN(punchMs)) {
                if (applyDeviceOffset) {
                    const shifted = shiftISTDateTime(date, time, offsetMins);
                    console.log(`[ADMS] Applied +${offsetMins}m device offset for emp ${entry.empId} (SN: ${sn}): ${punchTime} -> ${shifted.punchTime}`);
                    date = shifted.date;
                    time = shifted.time;
                    punchTime = shifted.punchTime;
                } else if (offsetMins === 0 && parsedEntries.length <= 3 && date === todayIST) {
                    // Fallback for untracked devices pushing real-time punches 25-35 mins behind IST
                    const diffMs = nowMs - punchMs;
                    if (diffMs >= 25 * 60 * 1000 && diffMs <= 35 * 60 * 1000) {
                        const shifted = shiftISTDateTime(date, time, 30);
                        console.log(`[ADMS] Auto-calibrated punch for emp ${entry.empId} (SN: ${sn}) from ${punchTime} to ${shifted.punchTime} (IST +30m clock drift correction)`);
                        date = shifted.date;
                        time = shifted.time;
                        punchTime = shifted.punchTime;
                    }
                }
            }
        } catch (calibErr) {
            console.warn('[ADMS] Auto-calibration check notice:', calibErr.message);
        }

        return {
            emp_id: entry.empId,
            punch_time: punchTime,
            date,
            time,
            verify_type: entry.verifyType,
            punch_state: entry.punchState,
            work_code: entry.workCode
        };
    });

    return { punches, shouldResetOffset };
};

const parseAttlogPayload = (rawBody, sn = 'UNKNOWN', clockOffsetMinutes = 0) => {
    return parseAndCalibrateAttlog(rawBody, sn, clockOffsetMinutes).punches;
};

/**
 * Synchronize affected employees' attendance records when new punches arrive
 */
const syncPunchesToAttendance = async (punches, io = null) => {
    if (!punches || punches.length === 0) return;

    try {
        const users = await User.getAll();
        const userMap = {};
        users.forEach(u => {
            const fetchId = u.biometric_id || u.emp_id;
            if (fetchId) userMap[String(fetchId).trim()] = u;
        });

        // Group unique (user, date) combinations to update
        const userDateSet = new Map();
        for (const p of punches) {
            const user = userMap[String(p.emp_id).trim()];
            if (user) {
                const key = `${user.id}_${p.date}`;
                if (!userDateSet.has(key)) {
                    userDateSet.set(key, { user, date: p.date, emp_id: p.emp_id, device_name: p.device_name });
                }
            }
        }


        for (const [key, { user, date, emp_id, device_name }] of userDateSet.entries()) {
            // Get all punches for this user on this date from DB
            const userPunches = await BiometricPunch.getPunchesForUserDate(emp_id, date);
            if (userPunches.length === 0) continue;

            // Check if record exists in attendance (could be from HRMS web/app clock-in)
            const [existing] = await pool.execute(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                [user.id, date]
            );

            // Merge all punches: biometric punches + HRMS web/mobile application punches
            const allPunches = [...userPunches.map(p => p.time)];
            if (existing.length > 0) {
                const attn = existing[0];
                if (attn.is_web_punch === 1 || attn.is_web_punch === true) {
                    if (attn.punch_in && attn.punch_in !== '00:00' && attn.punch_in !== '--:--') allPunches.push(attn.punch_in);
                    if (attn.punch_out && attn.punch_out !== '00:00' && attn.punch_out !== '--:--') {
                        if (date < getISTDate() || attn.punch_out !== attn.punch_in) {
                            allPunches.push(attn.punch_out);
                        }
                    }
                }
            }

            const uniquePunches = [...new Set(allPunches.filter(p => p && p !== '--:--' && p !== '00:00'))].sort();
            if (uniquePunches.length === 0) continue;

            // FIRST PUNCH = Punch In (earliest across biometric machine and HRMS web app)
            const punch_in = uniquePunches[0];

            // Shift calculation
            const roster = await ShiftRoster.getRoster(date, date);
            const rosterEntry = roster.find(r => String(r.user_id) === String(user.id));
            const activeShift = rosterEntry ? rosterEntry.shift_name : user.shift;
            const { start: shiftStart, end: shiftEnd } = await getShiftTimes(activeShift);

            // LAST PUNCH = Punch Out (latest across biometric machine and HRMS web app)
            // Multiple punches within 4 hours of arrival (e.g. web clock-in right after biometric scan)
            // are considered additional punch-ins, NOT punch-outs.
            const punchInMins = getMinutesFromTime(punch_in);
            const punchOutCandidates = uniquePunches.filter(p => {
                if (p === punch_in) return false;
                const pMins = getMinutesFromTime(p);
                return (pMins - punchInMins >= 240); // At least 4 hours after punch-in
            });

            let punch_out = null;
            if (punchOutCandidates.length > 0) {
                punch_out = punchOutCandidates[punchOutCandidates.length - 1];
            } else if (date < getISTDate() && shiftEnd) {
                // Auto-complete single punch on past days
                punch_out = shiftEnd;
            }

            let late_punch_in = "00:00";
            let late_punch_out = "00:00";
            let early_punch_out = "00:00";
            let total_hours = "00:00";

            if (shiftStart) {
                if (punch_in) late_punch_in = calculateTimeDiff(punch_in, shiftStart, 'late_in');
            }
            if (shiftEnd && punch_out) {
                late_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'late_out');
                early_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'early_out');
            }

            if (punch_in && punch_out) {
                total_hours = calculateTotalHours(punch_in, punch_out);
            }

            const syncStatus = 'Present';

            if (existing.length > 0) {
                const attn = existing[0];
                // Do not overwrite manual modifications made by admin
                if (Number(attn.is_edited) !== 1 && attn.is_edited !== true) {
                    await Attendance.update(attn.id, {
                        ...attn,
                        punch_in: punch_in || attn.punch_in,
                        punch_out: punch_out,
                        actual_punch_in: punch_in || attn.actual_punch_in,
                        actual_punch_out: punch_out,
                        late_punch_in,
                        late_punch_out,
                        early_punch_out,
                        total_hours,
                        status: syncStatus,
                        biometric_id: user.biometric_id || user.emp_id
                    });
                }
            } else {
                await Attendance.create({
                    user_id: user.id,
                    date,
                    punch_in,
                    punch_out: punch_out,
                    actual_punch_in: punch_in,
                    actual_punch_out: punch_out,
                    late_punch_in,
                    late_punch_out,
                    early_punch_out,
                    total_hours,
                    status: syncStatus,
                    biometric_id: user.biometric_id || user.emp_id
                });
            }

            // Also update biometric_logs table for reporting
            try {
                await BiometricLog.createBulk([{
                    biometric_id: user.biometric_id || user.emp_id,
                    date,
                    deduction: '0',
                    emp_id: user.emp_id,
                    employee_name: user.employee_name,
                    device_name: device_name || 'Biometric Device',
                    punch_in,
                    punch_out,
                    shift: activeShift || 'General',
                    status: syncStatus,
                    total_hours,
                    user_id: user.id,
                    weekoff_date: null
                }]);
            } catch (bioLogErr) {
                console.warn('[ADMS] BiometricLog update notice:', bioLogErr.message);
            }

            // Real-time WebSocket emission
            if (io) {
                io.to('role_admin').emit('biometric_punch', {
                    user_id: user.id,
                    emp_id: user.emp_id,
                    employee_name: user.employee_name,
                    date,
                    punch_in,
                    punch_out,
                    status: syncStatus,
                    device_name
                });
                io.to(`user_${user.id}`).emit('my_punch', {
                    date,
                    punch_in,
                    punch_out,
                    status: syncStatus
                });
            }
        }
    } catch (err) {
        console.error('[ADMS] syncPunchesToAttendance error:', err);
    }
};

// Track devices that have been commanded to do a full historical sync
const syncedDevices = new Map();

/**
 * GET /iclock/cdata
 * Device handshake, initialization options, and heartbeat
 */
exports.handleCDataGet = async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'UNKNOWN';
    const options = req.query.options || '';

    // Auto-register/verify device
    const device = await getOrCreateDevice(sn);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    if (options.toLowerCase() === 'all' || req.query.pushver) {
        // Full ADMS handshake options configuration
        const istStr = getISTDateTimeStr();

        const configLines = [
            `GET OPTION FROM: ${sn}`,
            `Stamp=9999`,
            `OpStamp=9999`,
            `PhotoStamp=0`,
            `ErrorDelay=30`,
            `Delay=10`,
            `TransTimes=00:00;14:05`,
            `TransInterval=1`,
            `TransFlag=1111000000`,
        ];

        // Devices with clock_offset_minutes > 0 truncate TimeZone=5.5 to 5; omit TZ override for them
        if (!(device.clock_offset_minutes > 0)) {
            configLines.push(`TimeZone=5.5`, `ServerTZ=5.5`);
        }

        configLines.push(
            `DateTime=${istStr}`,
            `Realtime=1`,
            `SyncTime=1`,
            `ServerVer=3.4.1`,
            ``
        );

        const configResponse = configLines.join('\r\n');

        console.log(`[ADMS] Handshake options sent to device SN: ${sn} (IST DateTime=${istStr}, Offset=${device.clock_offset_minutes || 0}m)`);
        return res.status(200).send(configResponse);
    }

    // Normal ping / heartbeat response
    return res.status(200).send('OK');
};

/**
 * POST /iclock/cdata
 * Receives attendance logs (ATTLOG) or operational logs pushed directly by the machine
 */
exports.handleCDataPost = async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'UNKNOWN';
    const table = (req.query.table || req.query.TableName || 'ATTLOG').toUpperCase();

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    // Only process attendance punch records
    if (table !== 'ATTLOG') {
        return res.status(200).send('OK');
    }

    const device = await getOrCreateDevice(sn);

    // Retrieve raw text body
    let rawBody = req.body;
    if (Buffer.isBuffer(rawBody)) {
        rawBody = rawBody.toString('utf8');
    } else if (typeof rawBody !== 'string') {
        rawBody = JSON.stringify(rawBody);
    }

    const { punches, shouldResetOffset } = parseAndCalibrateAttlog(
        rawBody,
        sn,
        device.clock_offset_minutes || 0
    );

    if (shouldResetOffset) {
        console.log(`[ADMS] Device ${sn} (${device.name}) now reports accurate IST; resetting clock_offset_minutes to 0.`);
        Device.setClockOffset(sn, 0).catch(err =>
            console.warn('[ADMS] Failed to reset device clock offset:', err.message)
        );
    }

    if (punches.length === 0) {
        return res.status(200).send('OK');
    }

    // Attach device metadata
    punches.forEach(p => {
        p.device_sn = sn;
        p.device_name = device.name;
    });

    try {
        const savedCount = await BiometricPunch.createBulk(punches);
        console.log(`[ADMS] Received ${punches.length} punches from device ${sn} (${device.name}), saved ${savedCount} new punches.`);

        // Synchronize in background with Socket.io notification
        const io = req.app.get('socketio');
        syncPunchesToAttendance(punches, io).catch(err => {
            console.error('[ADMS] Background attendance sync failed:', err.message);
        });

        // Respond with OK to acknowledge receipt so the machine clears its upload queue
        return res.status(200).send(`OK: ${punches.length}`);
    } catch (error) {
        console.error('[ADMS] Error saving punches:', error.message);
        // Even on error, return OK so device doesn't enter retry storm, or return OK: 0
        return res.status(200).send('OK');
    }
};

/**
 * GET /iclock/getrequest
 * Polling endpoint for pending server-side commands for the device
 */
exports.handleGetRequest = async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'UNKNOWN';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    // Periodically sync device hardware clock with exact IST DateTime
    const lastCmdTime = syncedDevices.get(sn) || 0;
    const now = Date.now();
    if (now - lastCmdTime > 15 * 60 * 1000) { // Sync device clock every 15 minutes
        syncedDevices.set(sn, now);
        const device = await getOrCreateDevice(sn);
        const istStr = getISTDateTimeStr();
        const cmdId1 = Math.floor(now / 1000);
        const cmdId2 = cmdId1 + 1;
        const cmdId3 = cmdId1 + 2;
        if (device.clock_offset_minutes > 0) {
            console.log(`[ADMS] Syncing device ${sn} clock DateTime=${istStr} (keeping server-side +${device.clock_offset_minutes}m calibration)...`);
            return res.status(200).send(`C:${cmdId1}:SET OPTIONS DateTime=${istStr}\r\nC:${cmdId3}:CHECK`);
        }
        console.log(`[ADMS] Syncing device ${sn} clock to IST (${istStr}) with CmdIDs ${cmdId1}, ${cmdId2}, ${cmdId3}...`);
        return res.status(200).send(`C:${cmdId1}:SET OPTIONS DateTime=${istStr}\r\nC:${cmdId2}:SET OPTIONS TimeZone=5.5\r\nC:${cmdId3}:CHECK`);
    }

    return res.status(200).send('OK');
};

/**
 * POST /iclock/devicecmd
 * Callback endpoint when device executes a command
 */
exports.handleDeviceCmd = async (req, res) => {
    console.log('[ADMS] Device command result received:', req.query, req.body);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('OK');
};

/**
 * POST /iclock/registry or /iclock/push
 * Device registration fallback endpoint
 */
exports.handleRegistry = async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'UNKNOWN';
    await getOrCreateDevice(sn);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('OK');
};

exports.parseAndCalibrateAttlog = parseAndCalibrateAttlog;
exports.parseAttlogPayload = parseAttlogPayload;
