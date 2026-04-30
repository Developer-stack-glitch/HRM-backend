const Attendance = require('../models/attendanceModel');
const BiometricLog = require('../models/biometricLogModel');
const WeekOff = require('../models/weekoffModel');
const CompanyWeekOff = require('../models/companyWeekoffModel');
const Device = require('../models/deviceModel');
const { pool } = require('../Config/dbConfig');
const axios = require('axios');
const puppeteer = require('puppeteer');
const xml2js = require('xml2js');
const ExcelJS = require('exceljs');
const ShiftRoster = require('../models/shiftRosterModel');
const Holiday = require('../models/holidayModel');


const getISTDate = () => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const getISTTime = () => {
    return new Date().toLocaleTimeString('en-GB', { 
        timeZone: 'Asia/Kolkata', 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
};

const getISTHoursAndMinutes = () => {
    const istStr = new Date().toLocaleTimeString('en-GB', { 
        timeZone: 'Asia/Kolkata', 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    const [h, m] = istStr.split(':').map(Number);
    return { h, m };
};

const getISTDateTime = () => {
    return `${getISTDate()} ${getISTTime()}`;
};

const calculateTimeDiff = (time1, time2, type = 'late_in') => {
    if (!time1 || !time2) return "00:00:00";

    const [h1, m1, s1] = time1.split(':').map(Number);
    let [h2, m2, s2] = time2.split(':').map(Number);

    // Apply 30 min grace for 09:00 shift in Late In
    if (type === 'late_in' && h2 === 9 && m2 === 0) {
        m2 = 30;
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

const calculateTotalHours = (inTime, outTime) => {
    if (!inTime || !outTime) return "00:00:00";

    const [hIn, mIn, sIn] = inTime.split(':').map(Number);
    const [hOut, mOut, sOut] = outTime.split(':').map(Number);

    let diff = (hOut * 3600 + mOut * 60 + (sOut || 0)) - (hIn * 3600 + mIn * 60 + (sIn || 0));
    if (diff < 0) diff += 24 * 3600; // Handle overnight shifts

    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getPenaltyDeduction = (actualTime, shiftTime, type = 'late_in') => {
    if (!actualTime || !shiftTime || actualTime === '--:--' || actualTime === '00:00') return 0;

    const actualMins = getMinutesFromTime(actualTime);
    const shiftMins = getMinutesFromTime(shiftTime);

    let diff = 0;
    if (type === 'late_in') {
        // If shift start is 09:00:00, use 09:30:00 as threshold (30 min grace)
        const thresholdMins = (shiftMins === 540) ? 570 : shiftMins;
        diff = actualMins - thresholdMins;
    } else if (type === 'early_out') {
        diff = shiftMins - actualMins;
    }

    if (diff <= 0) return 0;

    const penaltyHours = Math.ceil(diff / 60);
    return penaltyHours * 0.1; // 0.1 deduction per hour or part thereof
};

const formatMinutesToTime = (totalMinutes) => {
    const isNegative = totalMinutes < 0;
    const absMinutes = Math.abs(totalMinutes);
    const totalSeconds = Math.round(absMinutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${isNegative ? '-' : ''}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getMinutesFromTime = (timeStr) => {
    if (!timeStr || timeStr === '00:00' || timeStr === 'undefined') return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length < 2) return 0;
    const h = parts[0];
    const m = parts[1];
    return h * 60 + m;
};

const getShiftTimes = async (shiftInput) => {
    let shiftStart = null;
    let shiftEnd = null;

    if (!shiftInput) return { start: null, end: null };

    // If it's a numeric ID
    if (!isNaN(shiftInput) && typeof shiftInput !== 'object') {
        const [dbShifts] = await pool.execute('SELECT * FROM shifts WHERE id = ?', [shiftInput || null]);
        if (dbShifts.length > 0) {
            return {
                start: dbShifts[0].start_time,
                end: dbShifts[0].end_time
            };
        }
    }

    const timeRegex = /\((\d{2}:\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}:\d{2})\)/;
    const match = shiftInput.toString().match(timeRegex);

    if (match) {
        shiftStart = match[1];
        shiftEnd = match[2];
    } else {
        const shiftName = shiftInput.toString().split('(')[0].trim();
        const [dbShifts] = await pool.execute('SELECT * FROM shifts WHERE name = ?', [shiftName || null]);
        if (dbShifts.length > 0) {
            shiftStart = dbShifts[0].start_time;
            shiftEnd = dbShifts[0].end_time;
        }
    }
    return { start: shiftStart, end: shiftEnd };
};

const getHolidayDetail = (date, holidays, companyId) => {
    if (!holidays || !Array.isArray(holidays)) return null;
    const dateStr = formatDate(date);
    return holidays.find(h => 
        formatDate(h.date) === dateStr && 
        (!h.company_id || String(h.company_id) === String(companyId))
    ) || null;
};


const isWeekOff = async (userId, companyId, date) => {

    // 1. Check for User-specific Week Off
    const userRules = await WeekOff.getByUserId(userId);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    const dayName = days[d.getDay()];
    if (!dayName) return false;
    const dayNameLower = dayName.toLowerCase();
    const formattedDate = formatDate(date);

    if (userRules && userRules.length > 0) {
        // If this date is an alternative date, it's NOT a week off (user must work)
        const isAlternativeDate = userRules.some(r => r.alternative_date && formatDate(r.alternative_date) === formattedDate);
        if (isAlternativeDate) return false;

        const isUserWO = userRules.some(r => formatDate(r.weekoffdate) === formattedDate);
        if (isUserWO) return true;
    }

    // 2. Check for Company-wide Week Off
    if (companyId) {
        const companyRules = await CompanyWeekOff.getByCompanyId(companyId);
        if (companyRules && companyRules.length > 0) {
            return companyRules.some(r => r.day_name.toLowerCase() === dayNameLower);
        } else {
            return new Date(date).getDay() === 0;
        }
    }

    // 3. Global fallback to Sunday
    return new Date(date).getDay() === 0;
};

const enrichAttendanceRecord = async (record, shift, permissions = [], holidays = []) => {

    const { start: shiftStart, end: shiftEnd } = await getShiftTimes(shift || record.shift);

    let { punch_in, punch_out, total_hours, status, date, user_id, company } = record;
    let late_penalty = "00:00";
    let early_penalty = "00:00";
    let working_day_value = 1.0;
    let shift_hours = "0.0";

    const is_week_off = await isWeekOff(user_id, company, date);
    const holidayDetail = getHolidayDetail(date, holidays, company);
    const is_holiday = !!holidayDetail;



    let shiftDurationMins = 0;
    if (shiftStart && shiftEnd) {
        shiftDurationMins = getMinutesFromTime(shiftEnd) - getMinutesFromTime(shiftStart);
        shift_hours = (shiftDurationMins / 60).toFixed(1);
    }

    // Calculate Permission Deduction
    let permissionDeduction = 0;
    const dateStr = formatDate(date);
    const dayPermissions = (permissions || []).filter(p =>
        String(p.employee_id) === String(user_id) &&
        formatDate(p.start_date) === dateStr &&
        p.leave_type === 'Permission'
    );

    const shiftStartMins = getMinutesFromTime(shiftStart);
    const shiftEndMins = getMinutesFromTime(shiftEnd);

    if (dayPermissions.length > 0 && shiftDurationMins > 0) {
        let totalPermMins = 0;
        dayPermissions.forEach(p => {
            const pStart = getMinutesFromTime(p.start_time);
            const pEnd = getMinutesFromTime(p.end_time);

            const isStartPerm = (pStart <= shiftStartMins && pEnd > shiftStartMins);
            const isEndPerm = (pEnd >= shiftEndMins && pStart < shiftEndMins);

            if (status === 'Present' && (isStartPerm || isEndPerm)) {
                return;
            }

            totalPermMins += Math.max(0, pEnd - pStart);
        });
        permissionDeduction = totalPermMins / shiftDurationMins;
    }

    const recordDateStr = formatDate(date);
    const todayStr = getISTDate();
    const { h: curH, m: curM } = getISTHoursAndMinutes();
    const currentTimeMins = curH * 60 + curM;

    let isDayComplete = false;
    if (recordDateStr < todayStr) {
        isDayComplete = true;
    } else if (recordDateStr === todayStr && shiftEnd) {
        const [sh, sm] = shiftEnd.split(':').map(Number);
        const shiftEndMins = sh * 60 + sm;
        if (currentTimeMins > shiftEndMins) {
            isDayComplete = true;
        }
    }

    if (status === 'Present' || status === 'Incomplete') {
        const isPunchInMissing = !punch_in || punch_in === '--:--' || punch_in === '00:00';
        const isPunchOutMissing = !punch_out || punch_out === '--:--' || punch_out === '00:00';

        if (isPunchInMissing && isDayComplete) {
            // Never came in at all
            if (is_holiday) {
                status = 'Holiday';
                working_day_value = 1.0;
            } else if (is_week_off) {
                status = 'Week Off';
                working_day_value = 1.0;
            } else {
                status = 'Absent';
                working_day_value = 0.0;
            }
            total_hours = "00:00";
        } else if (!isPunchInMissing) {

            let totalPenalty = 0;

            // Calculate Late In Penalty
            const lateDeduction = getPenaltyDeduction(punch_in, shiftStart, 'late_in');
            totalPenalty += lateDeduction;
            if (lateDeduction > 0) {
                late_penalty = formatMinutesToTime(Math.round(lateDeduction * 600));
            }

            // Calculate Early Out Penalty (only if punched out)
            if (!isPunchOutMissing) {
                const earlyDeduction = getPenaltyDeduction(punch_out, shiftEnd, 'early_out');
                totalPenalty += earlyDeduction;
                if (earlyDeduction > 0) {
                    early_penalty = formatMinutesToTime(Math.round(earlyDeduction * 600));
                }
                status = 'Present';
            } else {
                // No punch out yet
                if (isDayComplete) {
                    if (is_holiday) {
                        status = 'Holiday';
                        working_day_value = 1.0;
                    } else if (is_week_off) {
                        status = 'Week Off';
                        working_day_value = 1.0;
                    } else {
                        status = 'Incomplete';
                        working_day_value = 0.0; // Forgot to punch out = 0.0 value
                    }
                    total_hours = "00:00";
                } else {

                    status = 'Present';
                }
            }

            if (status === 'Present') {
                working_day_value = Math.max(0, 1.0 - totalPenalty - permissionDeduction);
            }
        }
    } else if (status === 'Permission') {
        // Special case for Permission-only days
        working_day_value = Math.max(0, 1.0 - permissionDeduction);
        total_hours = "00:00";
    } else if (status === 'On Leave') {
        working_day_value = 0.0;
    } else if (status === 'Holiday' || status === 'Week Off') {
        working_day_value = 1.0;
    } else if (status === 'Absent' || !status) {
        if (is_holiday) {
            status = 'Holiday';
            working_day_value = 1.0;
        } else if (is_week_off) {
            status = 'Week Off';
            working_day_value = 1.0;
        } else {
            working_day_value = 0.0;
            status = 'Absent';
        }
    }


    return {
        ...record,
        status,
        total_hours,
        late_penalty,
        early_penalty,
        working_day_value: parseFloat(working_day_value.toFixed(2)),
        shift_hours,
        is_week_off,
        is_holiday,
        holiday_name: holidayDetail ? holidayDetail.name : null,


        permission_deduction: permissionDeduction.toFixed(2),
        permissions: dayPermissions.map(p => ({
            id: p.id,
            start_time: p.start_time,
            end_time: p.end_time,
            reason: p.reason
        }))
    };
};

const getAttendanceDataInternal = async (startDate, endDate, userId = null, userRole = 'admin', targetUserIds = null) => {
    let dbAttendance;

    if (startDate && endDate) {
        dbAttendance = await Attendance.getInRange(startDate, endDate);
    } else {
        dbAttendance = await Attendance.getAll();
    }

    // Filter DB attendance for employees or target users
    if (userRole === 'employee' && userId) {
        dbAttendance = dbAttendance.filter(a => String(a.user_id) === String(userId));
    } else if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
        dbAttendance = dbAttendance.filter(a => targetUserIds.includes(String(a.user_id)));
    }

    // Fetch all approved leaves
    let leaveQuery = "SELECT * FROM leaves WHERE status = 'Approved'";
    const leaveParams = [];
    if (startDate && endDate) {
        leaveQuery += " AND ((start_date BETWEEN ? AND ?) OR (end_date BETWEEN ? AND ?))";
        leaveParams.push(startDate, endDate, startDate, endDate);
    }
    if (userId && userRole === 'employee') {
        leaveQuery += " AND employee_id = ?";
        leaveParams.push(userId);
    } else if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
        const placeholders = targetUserIds.map(() => '?').join(',');
        leaveQuery += ` AND employee_id IN (${placeholders})`;
        leaveParams.push(...targetUserIds);
    }
    const [allLeaves] = await pool.execute(leaveQuery, leaveParams);

    // Filter for permissions separately if needed, but we can just use allLeaves
    const permissions = allLeaves.filter(l => l.leave_type === 'Permission');


    // Fetch biometric logs for the same range
    const logs = await fetchBiometricLogsInternal(startDate, endDate);

    // Fetch all holidays
    const [allHolidays] = await pool.execute("SELECT * FROM holidays");


    // Fetch shift roster for overrides
    const roster = await ShiftRoster.getRoster(startDate, endDate);
    const rosterMap = {};
    roster.forEach(r => {
        const dateStr = formatDate(r.roster_date);
        rosterMap[`${r.user_id}_${dateStr}`] = r;
    });

    let finalAttendance = [];

    const { User } = require('../models/userModel');
    let users = await User.getAll();
    
    if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
        users = users.filter(u => targetUserIds.includes(String(u.id)));
    }

    const userMap = {};
    users.forEach(u => {
        const fetchId = u.biometric_id || u.emp_id;
        if (fetchId) userMap[String(fetchId).trim()] = u;
    });

    const combinedData = {};

    // 1. Initialize with DB records
    dbAttendance.forEach(a => {
        const dateStr = formatDate(a.date);
        const key = `${a.user_id}_${dateStr}`;
        combinedData[key] = {
            ...a,
            date: dateStr,
            punches: [],
            branch_id: a.branch_id || a.branch,
            department_id: a.department_id || a.department,
            shift_id: a.shift_id || a.shift
        };
        if (a.punch_in && a.punch_in !== '00:00' && a.punch_in !== '--:--') {
            combinedData[key].punches.push(a.punch_in);
        }
        if (a.punch_out && a.punch_out !== '00:00' && a.punch_out !== '--:--') {
            combinedData[key].punches.push(a.punch_out);
        }
    });

    // 2. Add/Merge biometric logs
    if (logs.length > 0) {
        logs.forEach(log => {
            const user = userMap[String(log.emp_id).trim()];
            if (!user) return;

            if (userRole === 'employee' && userId && String(user.id) !== String(userId)) return;

            const dateStr = normalizeDate(log.date);
            const key = `${user.id}_${dateStr}`;

            if (!combinedData[key]) {
                combinedData[key] = {
                    id: `bio_${user.id}_${dateStr}`,
                    user_id: user.id,
                    employee_name: user.employee_name,
                    emp_id: user.emp_id,
                    designation: user.designation_name,
                    department: user.department_name,
                    branch: user.branch_name,
                    branch_id: user.branch,
                    department_id: user.department,
                    shift_id: user.shift,
                    company: user.company,
                    shift: user.shift_name || user.shift,
                    date: dateStr,
                    punches: [],
                    status: 'Present',
                    employment_type: user.employment_type,
                    work_mode: user.work_location
                };

                // Apply Shift Roster Override
                const rosterEntry = rosterMap[key];
                if (rosterEntry) {
                    combinedData[key].shift_id = rosterEntry.shift_id;
                    combinedData[key].shift = rosterEntry.shift_name;
                    combinedData[key].is_rostered = true;
                }
            }
            combinedData[key].punches.push(log.time);
            combinedData[key].is_biometric = true;
        });
    }

    // 3. Fill gaps for all users for all dates (to detect Absent/Week-offs)
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    users.forEach(user => {
        if (userRole === 'employee' && userId && String(user.id) !== String(userId)) return;

        let d = new Date(startDateObj);
        while (d <= endDateObj) {
            const dateStr = formatDate(d);
            const key = `${user.id}_${dateStr}`;

            if (!combinedData[key]) {
                const todayStr = getISTDate();
                const isFuture = dateStr > todayStr;

                combinedData[key] = {
                    id: `gen_${user.id}_${dateStr}`,
                    user_id: user.id,
                    employee_name: user.employee_name,
                    emp_id: user.emp_id,
                    designation: user.designation_name,
                    department: user.department_name,
                    branch: user.branch_name,
                    branch_id: user.branch,
                    department_id: user.department,
                    shift_id: user.shift,
                    company: user.company,
                    shift: user.shift_name || user.shift,
                    date: dateStr,
                    punches: [],
                    status: isFuture ? null : 'Absent',
                    employment_type: user.employment_type,
                    work_mode: user.work_location
                };

                // Apply Shift Roster Override
                const rosterEntry = rosterMap[key];
                if (rosterEntry) {
                    combinedData[key].shift_id = rosterEntry.shift_id;
                    combinedData[key].shift = rosterEntry.shift_name;
                    combinedData[key].is_rostered = true;
                }
            }
            d.setDate(d.getDate() + 1);
        }
    });

    const consolidated = await Promise.all(Object.values(combinedData).map(async group => {
        const uniquePunches = [...new Set(group.punches.filter(p => p && p !== '00:00' && p !== '--:--'))].sort();

        const punch_in = uniquePunches.length > 0 ? uniquePunches[0] : group.punch_in;
        const punch_out = uniquePunches.length > 1 ? uniquePunches[uniquePunches.length - 1] : group.punch_out;

        const { start: shiftStart, end: shiftEnd } = await getShiftTimes(group.shift);

        let late_punch_in = "00:00";
        let late_punch_out = "00:00";
        let early_punch_out = "00:00";
        let total_hours = "00:00";

        if (shiftStart && shiftEnd) {
            if (punch_in) late_punch_in = calculateTimeDiff(punch_in, shiftStart, 'late_in');
            if (punch_out) {
                late_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'late_out');
                early_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'early_out');
            }
        }
        if (punch_in && punch_out) total_hours = calculateTotalHours(punch_in, punch_out);

        return enrichAttendanceRecord({
            ...group,
            punch_in,
            punch_out,
            late_punch_in,
            late_punch_out,
            early_punch_out,
            total_hours,
            status: group.status
        }, group.shift, permissions, allHolidays);
    }));


    finalAttendance = consolidated;


    // Fetch all users to identify permission-only records
    const [allUsers] = await pool.execute("SELECT u.id, u.employee_name, u.emp_id, u.biometric_id, u.company, u.shift, d.name as designation_name, dep.name as department_name, b.name as branch_name FROM users u LEFT JOIN designations d ON u.designation = d.id LEFT JOIN departments dep ON u.department = dep.id LEFT JOIN branches b ON u.branch = b.id");
    const userMapGlobal = {};
    allUsers.forEach(u => {
        userMapGlobal[String(u.id)] = u;
    });

    // Identify days that have leaves/permissions but no attendance record yet
    const existingKeys = new Set(finalAttendance.map(a => `${a.user_id}_${formatDate(a.date)}`));
    const leaveOnlyEntries = [];

    allLeaves.forEach(lv => {
        // Handle multi-day leaves
        let current = new Date(lv.start_date);
        const end = new Date(lv.end_date);

        while (current <= end) {
            const dateStr = formatDate(current);
            // Only add if within the requested range
            if (dateStr >= startDate && dateStr <= endDate) {
                const key = `${lv.employee_id}_${dateStr}`;
                if (!existingKeys.has(key)) {
                    const user = userMapGlobal[String(lv.employee_id)];
                    if (user) {
                        leaveOnlyEntries.push({
                            user_id: user.id,
                            employee_name: user.employee_name,
                            emp_id: user.emp_id,
                            designation: user.designation_name,
                            department: user.department_name,
                            branch: user.branch_name,
                            company: user.company,
                            shift: user.shift,
                            date: dateStr,
                            punch_in: null,
                            punch_out: null,
                            total_hours: "00:00",
                            status: lv.leave_type === 'Permission' ? 'Permission' : 'On Leave',
                            leave_type: lv.leave_type,
                            is_half_day: lv.is_half_day,
                            half_day_period: lv.half_day_period,
                            reason: lv.reason,
                            start_time: lv.start_time,
                            end_time: lv.end_time
                        });
                        existingKeys.add(key);
                    }
                }
            }
            current.setDate(current.getDate() + 1);
        }
    });

    const enrichedLeaves = await Promise.all(leaveOnlyEntries.map(e => enrichAttendanceRecord(e, e.shift, allLeaves, allHolidays)));

    finalAttendance = [...finalAttendance, ...enrichedLeaves];

    return finalAttendance;
};

const fetchBiometricLogsInternal = async (fromDate, toDate) => {
    try {
        const devices = await Device.getAll();
        if (devices.length === 0) {
            console.log('No devices found in database.');
            return [];
        }

        const fDate = fromDate ? `${fromDate} 00:00` : `${getISTDate()} 00:00`;
        const tDate = toDate ? `${toDate} 23:59` : `${getISTDate()} 23:59`;

        const logPromises = devices.map(async (device) => {
            try {
                const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <GetTransactionsLog xmlns="http://tempuri.org/">
            <FromDate>${fDate}</FromDate>
            <ToDate>${tDate}</ToDate>
            <SerialNumber>${device.serial_number}</SerialNumber>
            <UserName>API</UserName>
            <UserPassword>Essl@123</UserPassword>
            <strDataList>123</strDataList>
        </GetTransactionsLog>
    </soap:Body>
</soap:Envelope>`;

                const response = await axios.post('http://210.18.138.85:80/iclock/webapiservice.asmx?op=GetTransactionsLog', soapEnvelope, {
                    headers: {
                        'Content-Type': 'text/xml; charset=utf-8',
                        'SOAPAction': 'http://tempuri.org/GetTransactionsLog'
                    },
                    timeout: 8000
                });

                const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
                const result = await parser.parseStringPromise(response.data);

                const body = result['soap:Envelope']?.['soap:Body'] || result['s:Envelope']?.['s:Body'] || result['Envelope']?.['Body'];
                const apiResponse = body?.['GetTransactionsLogResponse'] || body?.['ns0:GetTransactionsLogResponse'];
                let rawData = apiResponse?.['strDataList'];

                if (!rawData || typeof rawData !== 'string') return [];

                const lines = rawData.trim().split('\n');
                return lines.map(line => {
                    const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
                    if (parts.length < 2) return null;
                    const empId = parts[0];
                    const timestamp = parts[1];
                    if (!timestamp) return null;
                    const [dateRaw, time] = timestamp.split(' ');
                    if (!dateRaw) return null;
                    const date = normalizeDate(dateRaw);
                    return { emp_id: empId, date, time, timestamp, device_name: device.name };
                }).filter(Boolean);
            } catch (err) {
                console.error(`Error fetching logs for device ${device.name} (${device.serial_number}):`, err.message);
                return [];
            }
        });

        const results = await Promise.all(logPromises);
        return results.flat();
    } catch (error) {
        console.error('Error fetching biometric logs:', error.message);
        return [];
    }
};

const formatDate = (date) => {
    if (!date) return '';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return date; // return as is if invalid

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (e) {
        return date;
    }
};

const normalizeDate = (dateStr) => {
    if (!dateStr) return '';
    // Handle various formats like DD-MM-YYYY, DD/MM/YYYY etc.
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
        // If it starts with a 4-digit year (YYYY-MM-DD or YYYY/MM/DD)
        if (parts[0].length === 4) {
            return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
        // If it ends with a 4-digit year (DD-MM-YYYY or DD/MM/YYYY)
        if (parts[2].length === 4) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
    }
    return dateStr;
};


exports.saveAttendance = async (req, res) => {
    try {
        const { user_id, date, punch_in, punch_out } = req.body;

        // Check if attendance already exists for this user and date
        const [existing] = await pool.execute(
            'SELECT id FROM attendance WHERE user_id = ? AND date = ?',
            [user_id || null, date || null]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                message: 'Attendance record already exists for this employee on this date.'
            });
        }

        const [users] = await pool.execute('SELECT shift, biometric_id, emp_id FROM users WHERE id = ?', [user_id || null]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });

        const userBioId = users[0].biometric_id || users[0].emp_id;

        // Check biometric logs for restriction
        const logs = await fetchBiometricLogsInternal(date, date);
        const userDateLogs = logs.filter(l => String(l.emp_id).trim() === String(userBioId).trim());

        if (userDateLogs.length > 0) {
            userDateLogs.sort((a, b) => a.time.localeCompare(b.time));
            const bioIn = userDateLogs[0].time;
            const bioOut = userDateLogs.length > 1 ? userDateLogs[userDateLogs.length - 1].time : null;

            if (bioIn && bioOut) {
                return res.status(400).json({
                    message: `Restriction: Biometric entry already exists for this date (${bioIn} - ${bioOut}). Manual entry is only allowed if punch-in or punch-out is missing.`
                });
            }
        }

        const { start: shiftStart, end: shiftEnd } = await getShiftTimes(users[0].shift);

        let late_punch_in = "00:00";
        let late_punch_out = "00:00";
        let early_punch_out = "00:00";
        let total_hours = "00:00";

        if (shiftStart && shiftEnd) {
            if (punch_in) late_punch_in = calculateTimeDiff(punch_in, shiftStart, 'late_in');
            if (punch_out) {
                late_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'late_out');
                early_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'early_out');
            }
        }

        if (punch_in && punch_out) total_hours = calculateTotalHours(punch_in, punch_out);

        const attendanceId = await Attendance.create({
            user_id,
            date,
            punch_in: punch_in || null,
            punch_out: punch_out || null,
            late_punch_in,
            late_punch_out,
            early_punch_out,
            total_hours,
            status: 'Present',
            biometric_id: userBioId || null
        });

        res.status(201).json({ message: 'Attendance saved successfully', id: attendanceId });
    } catch (error) {
        console.error('Error saving attendance:', error);
        res.status(500).json({ message: 'Error saving attendance', error: error.message });
    }
};

exports.getTodayStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const date = getISTDate();

        // Fetch user shift info
        const [users] = await pool.execute('SELECT shift FROM users WHERE id = ?', [userId || null]);
        let shiftInfo = { start: null, end: null, duration: 0 };
        if (users.length > 0 && users[0].shift) {
            const { start, end } = await getShiftTimes(users[0].shift);
            let duration = 0;
            if (start && end) {
                const startMins = getMinutesFromTime(start);
                const endMins = getMinutesFromTime(end);
                duration = (endMins - startMins) / 60;
                if (duration < 0) duration += 24; // Overnight shifts
            }
            shiftInfo = { start, end, duration: parseFloat(duration).toFixed(1) };
        }

        // 1. Get attendance record for today
        let [attendance] = await pool.execute(
            'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
            [userId || null, date]
        );

        // Auto-punch logic: If no record in DB, check biometric logs
        if (attendance.length === 0) {
            const [users] = await pool.execute('SELECT biometric_id, emp_id, shift FROM users WHERE id = ?', [userId || null]);
            if (users.length > 0) {
                const user = users[0];
                const userBioId = user.biometric_id || user.emp_id;

                // Fetch biometric logs for today
                const logs = await fetchBiometricLogsInternal(date, date);
                const userLogs = logs.filter(l => String(l.emp_id).trim() === String(userBioId).trim());

                if (userLogs.length > 0) {
                    userLogs.sort((a, b) => a.time.localeCompare(b.time));
                    const punch_in = userLogs[0].time;
                    const punch_out = userLogs.length > 1 ? userLogs[userLogs.length - 1].time : null;

                    const { start: shiftStart, end: shiftEnd } = await getShiftTimes(user.shift);
                    let late_punch_in = "00:00";
                    let late_punch_out = "00:00";
                    let early_punch_out = "00:00";
                    let total_hours = "00:00";

                    if (shiftStart) {
                        late_punch_in = calculateTimeDiff(punch_in, shiftStart, 'late_in');
                        if (punch_out && shiftEnd) {
                            late_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'late_out');
                            early_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'early_out');
                        }
                    }
                    if (punch_in && punch_out) total_hours = calculateTotalHours(punch_in, punch_out);

                    // Create record in DB
                    const status = 'Present';
                    await Attendance.create({
                        user_id: userId,
                        date,
                        punch_in,
                        punch_out,
                        late_punch_in,
                        late_punch_out,
                        early_punch_out,
                        total_hours,
                        status: status,
                        biometric_id: userBioId
                    });

                    // Re-fetch to get the new record with its ID
                    const [newAttn] = await pool.execute(
                        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                        [userId || null, date]
                    );
                    attendance = newAttn;
                }
            }
        }

        if (attendance.length === 0) {
            return res.json({ status: 'not_clocked_in', shiftInfo });
        }


        const attn = attendance[0];

        // 2. Get active break
        const [activeBreak] = await pool.execute(
            'SELECT * FROM attendance_breaks WHERE attendance_id = ? AND break_end IS NULL',
            [attn.id || null]
        );

        // 3. Get all breaks to calculate total breakdown
        const [allBreaks] = await pool.execute(
            'SELECT * FROM attendance_breaks WHERE attendance_id = ? ORDER BY break_start DESC',
            [attn.id || null]
        );

        // 4. Get active team count (clocked in but not clocked out)
        const [activeTeam] = await pool.execute(
            'SELECT COUNT(DISTINCT user_id) as count FROM attendance WHERE date = ? AND punch_out IS NULL',
            [date]
        );

        res.json({
            status: activeBreak.length > 0 ? 'on_break' : (attn.punch_out ? 'clocked_out' : 'clocked_in'),
            attendance: attn,
            breaks: allBreaks,
            activeBreak: activeBreak.length > 0 ? activeBreak[0] : null,
            shiftInfo,
            activeTeamCount: activeTeam[0].count
        });

    } catch (error) {
        console.error('Error getting today status:', error);
        res.status(500).json({ message: 'Error getting today status', error: error.message });
    }
};

exports.webClockIn = async (req, res) => {
    try {
        const { user_id, latitude, longitude, location } = req.body;
        const date = getISTDate();
        const web_punch_in = getISTTime();

        const [users] = await pool.execute('SELECT shift, biometric_id, emp_id, web_clock_in_allowed FROM users WHERE id = ?', [user_id || null]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });

        if (users[0].web_clock_in_allowed === 0) {
            return res.status(403).json({ message: 'Web clock-in is not enabled for your account.' });
        }

        const userBioId = users[0].biometric_id || users[0].emp_id;
        let machinePunches = [];
        try {
            const logs = await fetchBiometricLogsInternal(date, date);
            machinePunches = logs.filter(l => String(l.emp_id).trim() === String(userBioId).trim()).map(l => l.time);
        } catch (e) {
            console.error('Error fetching biometric logs during web clock-in:', e.message);
        }

        const [existing] = await pool.execute(
            'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
            [user_id || null, date]
        );

        const allPunches = [web_punch_in, ...machinePunches];
        if (existing.length > 0) {
            if (existing[0].punch_in) allPunches.push(existing[0].punch_in);
            if (existing[0].punch_out) allPunches.push(existing[0].punch_out);
        }

        const uniquePunches = [...new Set(allPunches.filter(p => p && p !== '00:00' && p !== '--:--'))].sort();
        const finalPunchIn = uniquePunches[0];
        const finalPunchOut = uniquePunches.length > 1 ? uniquePunches[uniquePunches.length - 1] : (existing.length > 0 ? existing[0].punch_out : null);

        const { start: shiftStart, end: shiftEnd } = await getShiftTimes(users[0].shift);
        let late_punch_in = "00:00";
        let late_punch_out = "00:00";
        let early_punch_out = "00:00";
        let total_hours = "00:00";

        if (shiftStart) {
            if (finalPunchIn) late_punch_in = calculateTimeDiff(finalPunchIn, shiftStart, 'late_in');
            if (finalPunchOut && shiftEnd) {
                late_punch_out = calculateTimeDiff(finalPunchOut, shiftEnd, 'late_out');
                early_punch_out = calculateTimeDiff(finalPunchOut, shiftEnd, 'early_out');
            }
        }
        if (finalPunchIn && finalPunchOut) total_hours = calculateTotalHours(finalPunchIn, finalPunchOut);

        const status = 'Present';
        const io = req.app.get('socketio');
        const { sendNotification } = require('../utils/notificationHelper');
        const userName = req.user.name || req.user.employee_name || 'Employee';

        if (existing.length > 0) {
            await pool.execute(
                'UPDATE attendance SET punch_in = ?, punch_out = ?, late_punch_in = ?, late_punch_out = ?, early_punch_out = ?, total_hours = ?, status = ?, latitude_in = ?, longitude_in = ?, punch_in_location = ?, is_web_punch = 1 WHERE id = ?',
                [finalPunchIn, finalPunchOut, late_punch_in, late_punch_out, early_punch_out, total_hours, status, latitude || null, longitude || null, location || null, existing[0].id]
            );

            // Send notification for Punch In if it just happened or was updated
            if (finalPunchIn) {
                await sendNotification(io, {
                    role: 'admin',
                    type: 'attendance',
                    title: 'Attendance Update',
                    message: `${userName} clocked in at ${finalPunchIn}`,
                    extra_data: { user_id, date, type: 'punch_in' }
                });
            }

            return res.status(200).json({ message: 'Clock-in info updated/interlinked', id: existing[0].id });
        } else {
            const [result] = await pool.execute(
                'INSERT INTO attendance (user_id, date, punch_in, punch_out, late_punch_in, late_punch_out, early_punch_out, total_hours, status, is_web_punch, latitude_in, longitude_in, punch_in_location, biometric_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [user_id || null, date, finalPunchIn, finalPunchOut, late_punch_in, late_punch_out, early_punch_out, total_hours, status, 1, latitude || null, longitude || null, location || null, userBioId]
            );

            await sendNotification(io, {
                role: 'admin',
                type: 'attendance',
                title: 'New Punch In',
                message: `${userName} clocked in at ${finalPunchIn}`,
                extra_data: { user_id, date, type: 'punch_in' }
            });

            return res.status(201).json({ message: 'Clocked in successfully', id: result.insertId });
        }

    } catch (error) {
        console.error('Error in web clock-in:', error);
        res.status(500).json({ message: 'Error in web clock-in', error: error.message });
    }
};

exports.webClockOut = async (req, res) => {
    try {
        const { user_id, latitude, longitude, location } = req.body;
        const date = getISTDate();
        const web_punch_out = getISTTime();

        const [attendance] = await pool.execute(
            'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
            [user_id || null, date]
        );

        if (attendance.length === 0) {
            return res.status(400).json({ message: 'No clock-in record found for today.' });
        }

        const attn = attendance[0];
        const [users] = await pool.execute('SELECT shift, biometric_id, emp_id FROM users WHERE id = ?', [user_id || null]);
        const userBioId = users[0].biometric_id || users[0].emp_id;

        let machinePunches = [];
        try {
            const logs = await fetchBiometricLogsInternal(date, date);
            machinePunches = logs.filter(l => String(l.emp_id).trim() === String(userBioId).trim()).map(l => l.time);
        } catch (e) {
            console.error('Error fetching biometric logs during web clock-out:', e.message);
        }

        const allPunches = [web_punch_out, ...machinePunches];
        if (attn.punch_in) allPunches.push(attn.punch_in);
        if (attn.punch_out) allPunches.push(attn.punch_out);

        const uniquePunches = [...new Set(allPunches.filter(p => p && p !== '00:00' && p !== '--:--'))].sort();
        const punch_in = uniquePunches[0];
        const punch_out = uniquePunches.length > 1 ? uniquePunches[uniquePunches.length - 1] : web_punch_out;

        const total_hours = calculateTotalHours(punch_in, punch_out);
        const { start: shiftStart, end: shiftEnd } = await getShiftTimes(users[0].shift);

        let early_punch_out = "00:00";
        let late_punch_out = "00:00";
        let late_punch_in = "00:00";
        if (shiftStart) late_punch_in = calculateTimeDiff(punch_in, shiftStart, 'late_in');
        if (shiftEnd) {
            early_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'early_out');
            late_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'late_out');
        }

        const status = (punch_in && punch_out) ? 'Present' : 'Incomplete';

        await pool.execute(
            'UPDATE attendance SET punch_in = ?, punch_out = ?, late_punch_in = ?, early_punch_out = ?, late_punch_out = ?, total_hours = ?, status = ?, latitude_out = ?, longitude_out = ?, punch_out_location = ?, is_web_punch = 1 WHERE id = ?',
            [punch_in, punch_out, late_punch_in, early_punch_out, late_punch_out, total_hours, status, latitude || null, longitude || null, location || null, attn.id || null]
        );

        res.json({ message: 'Clocked out successfully and interlinked', status });
    } catch (error) {
        console.error('Error in web clock-out:', error);
        res.status(500).json({ message: 'Error in web clock-out', error: error.message });
    }
};


exports.startBreak = async (req, res) => {
    try {
        const { user_id, latitude, longitude, location } = req.body;
        const date = getISTDate();
        const break_start = getISTDateTime();

        const [attendance] = await pool.execute(
            'SELECT id FROM attendance WHERE user_id = ? AND date = ?',
            [user_id || null, date]
        );

        if (attendance.length === 0) {
            return res.status(400).json({ message: 'Must clock in before taking a break.' });
        }

        const attnId = attendance[0].id;

        const [active] = await pool.execute(
            'SELECT id FROM attendance_breaks WHERE attendance_id = ? AND break_end IS NULL',
            [attnId || null]
        );

        if (active.length > 0) {
            return res.status(400).json({ message: 'Already on a break.' });
        }

        await pool.execute(
            'INSERT INTO attendance_breaks (attendance_id, user_id, break_start, latitude, longitude, location) VALUES (?, ?, ?, ?, ?, ?)',
            [attnId || null, user_id || null, break_start, latitude || null, longitude || null, location || null]
        );

        res.status(201).json({ message: 'Break started' });
    } catch (error) {
        console.error('Error starting break:', error);
        res.status(500).json({ message: 'Error starting break', error: error.message });
    }
};

exports.endBreak = async (req, res) => {
    try {
        const { user_id } = req.body;
        const date = getISTDate();
        const break_end_str = getISTDateTime();
        const break_end = new Date(); // Use current JS Date for diff

        const [attendance] = await pool.execute(
            'SELECT id FROM attendance WHERE user_id = ? AND date = ?',
            [user_id || null, date]
        );

        if (attendance.length === 0) {
            return res.status(400).json({ message: 'No attendance record found.' });
        }

        const attnId = attendance[0].id;

        const [active] = await pool.execute(
            'SELECT * FROM attendance_breaks WHERE attendance_id = ? AND break_end IS NULL',
            [attnId || null]
        );

        if (active.length === 0) {
            return res.status(400).json({ message: 'No active break found.' });
        }

        const breakRecord = active[0];
        const start = new Date(breakRecord.break_start);
        const durationSecondsTotal = Math.floor((break_end - start) / 1000);
        const h = Math.floor(durationSecondsTotal / 3600);
        const m = Math.floor((durationSecondsTotal % 3600) / 60);
        const s = durationSecondsTotal % 60;
        const durationStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        await pool.execute(
            'UPDATE attendance_breaks SET break_end = ?, break_duration = ? WHERE id = ?',
            [break_end_str, durationStr, breakRecord.id || null]
        );

        const [allBreaks] = await pool.execute(
            'SELECT break_duration FROM attendance_breaks WHERE attendance_id = ? AND break_end IS NOT NULL',
            [attnId || null]
        );

        let totalSeconds = 0;
        allBreaks.forEach(b => {
            if (b.break_duration) {
                const parts = b.break_duration.split(':').map(Number);
                if (parts.length === 3) {
                    totalSeconds += parts[0] * 3600 + parts[1] * 60 + parts[2];
                } else if (parts.length === 2) {
                    totalSeconds += parts[0] * 3600 + parts[1] * 60;
                }
            }
        });

        const th = Math.floor(totalSeconds / 3600);
        const tm = Math.floor((totalSeconds % 3600) / 60);
        const ts = totalSeconds % 60;
        const totalBreakStr = `${th.toString().padStart(2, '0')}:${tm.toString().padStart(2, '0')}:${ts.toString().padStart(2, '0')}`;

        await pool.execute(
            'UPDATE attendance SET total_break_time = ? WHERE id = ?',
            [totalBreakStr, attnId || null]
        );

        res.json({ message: 'Break ended', duration: durationStr });
    } catch (error) {
        console.error('Error ending break:', error);
        res.status(500).json({ message: 'Error ending break', error: error.message });
    }
};

const processBiometricLogs = async (logs) => {
    if (!logs || logs.length === 0) return [];

    // Fetch all users to match biometric_id
    const users = await require('../models/userModel').getAll();
    const userMap = {};
    users.forEach(u => {
        const fetchId = u.biometric_id || u.emp_id;
        if (fetchId) userMap[String(fetchId).trim()] = u;
    });

    // Group by user/id and date
    const grouped = {};
    logs.forEach(log => {
        const user = userMap[String(log.emp_id).trim()];
        const key = user ? `${user.id}_${log.date}` : `unknown_${log.emp_id}_${log.date}`;

        if (!grouped[key]) {
            grouped[key] = {
                user_id: user ? user.id : null,
                employee_name: user ? user.employee_name : `Unknown (${log.emp_id})`,
                emp_id: user ? user.emp_id : log.emp_id,
                biometric_id: user ? user.biometric_id : log.emp_id,
                shift: user ? user.shift : 'N/A',
                date: log.date,
                company_id: user ? user.company : null,
                punches: [],
                device_names: new Set()
            };
        }
        grouped[key].punches.push(log.time);
        if (log.device_name) grouped[key].device_names.add(log.device_name);
    });

    const processed = await Promise.all(Object.values(grouped).map(async group => {
        group.punches.sort();
        const punch_in = group.punches[0];
        const punch_out = group.punches.length > 1 ? group.punches[group.punches.length - 1] : null;

        const { start: shiftStart, end: shiftEnd } = await getShiftTimes(group.shift);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const d = new Date(group.date);
        const dayName = days[d.getDay()];
        const dayNameLower = dayName.toLowerCase();

        let weekoff_date = null;
        let isWO = false;
        let skipCompanyRules = false;

        if (group.user_id) {
            const rules = await WeekOff.getByUserId(group.user_id);
            if (rules && rules.length > 0) {
                const isAlternative = rules.some(r => r.alternative_date && formatDate(r.alternative_date) === formatDate(group.date));
                if (isAlternative) {
                    skipCompanyRules = true;
                } else {
                    const matchingRule = rules.find(r => formatDate(r.weekoffdate) === formatDate(group.date));
                    if (matchingRule) {
                        isWO = true;
                        weekoff_date = matchingRule.weekoffdate;
                    }
                }
            }
        }

        if (!isWO && !skipCompanyRules && group.company_id) {
            const companyRules = await CompanyWeekOff.getByCompanyId(group.company_id);
            if (companyRules && companyRules.length > 0) {
                const matchingCompanyRule = companyRules.find(r => r.day_name.toLowerCase() === dayNameLower);
                if (matchingCompanyRule) {
                    isWO = true;
                    weekoff_date = matchingCompanyRule.day_name;
                }
            } else if (new Date(group.date).getDay() === 0) {
                isWO = true;
                weekoff_date = 'Sunday';
            }
        } else if (!isWO && !skipCompanyRules && !group.user_id) {
            if (new Date(group.date).getDay() === 0) {
                isWO = true;
                weekoff_date = 'Sunday';
            }
        }

        let total_hours = "00:00";
        let deduction = "0.0";
        let status = "Present";

        const recordDateStr = group.date;
        const todayStr = getISTDate();
        const { h: curH, m: curM } = getISTHoursAndMinutes();
        const currentTimeMins = curH * 60 + curM;

        let isDayComplete = false;
        if (recordDateStr < todayStr) {
            isDayComplete = true;
        } else if (recordDateStr === todayStr && shiftEnd) {
            const [sh, sm] = shiftEnd.split(':').map(Number);
            const shiftEndMins = sh * 60 + sm;
            if (currentTimeMins > shiftEndMins) {
                isDayComplete = true;
            }
        }

        if (punch_in) {
            let totalDeduction = 0;

            const lateDeduction = getPenaltyDeduction(punch_in, shiftStart, 'late_in');
            totalDeduction += lateDeduction;

            if (punch_out) {
                total_hours = calculateTotalHours(punch_in, punch_out);
                const earlyDeduction = getPenaltyDeduction(punch_out, shiftEnd, 'early_out');
                totalDeduction += earlyDeduction;
            } else if (isDayComplete) {
                // Punched in but no punch out — mark as Incomplete, not Absent
                status = isWO ? "Week Off" : "Incomplete";
                total_hours = "00:00";
                totalDeduction = 0.0;
            }

            deduction = totalDeduction.toFixed(1);
        } else {
            if (isWO) {
                status = "Week Off";
                total_hours = "00:00";
                deduction = "0.0";
            } else if (isDayComplete) {
                status = "Absent";
                total_hours = "00:00";
                deduction = "1.0";
            }
        }

        return {
            user_id: group.user_id,
            employee_name: group.employee_name,
            device_name: Array.from(group.device_names).join(', ') || null,
            emp_id: group.emp_id,
            biometric_id: group.biometric_id,
            shift: group.shift,
            date: group.date,
            punch_in,
            punch_out,
            total_hours,
            deduction,
            status,
            weekoff_date
        };
    }));

    return processed;
};

exports.getAttendance = async (req, res) => {
    try {
        const { startDate, endDate, userIds } = req.query;
        const userRole = req.user.role;
        const userId = req.user.id;
        
        let targetUserIds = null;
        if (userIds) {
            targetUserIds = userIds.split(',').map(id => id.trim()).filter(Boolean);
        }

        const attendanceData = await getAttendanceDataInternal(startDate, endDate, userId, userRole, targetUserIds);
        res.status(200).json(attendanceData);
    } catch (error) {
        console.error('Error in getAttendance:', error);
        res.status(500).json({ message: 'Error fetching attendance', error: error.message });
    }
};

exports.previewBiometricLogs = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        const logs = await fetchBiometricLogsInternal(fromDate, toDate);

        if (logs.length === 0) return res.json([]);

        const finalLogs = await processBiometricLogs(logs);

        // Store summarized logs for history
        if (finalLogs.length > 0) {
            await BiometricLog.createBulk(finalLogs);
        }

        res.json(finalLogs);
    } catch (error) {
        console.error('Biometric fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch biometric logs', error: error.message });
    }
};

exports.updateAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id, date, punch_in, punch_out } = req.body;

        const [users] = await pool.execute('SELECT shift, biometric_id, emp_id FROM users WHERE id = ?', [user_id || null]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });

        const { start: shiftStart, end: shiftEnd } = await getShiftTimes(users[0].shift);

        let late_punch_in = "00:00";
        let late_punch_out = "00:00";
        let early_punch_out = "00:00";
        let total_hours = "00:00";

        if (shiftStart && shiftEnd) {
            if (punch_in) late_punch_in = calculateTimeDiff(punch_in, shiftStart, 'late_in');
            if (punch_out) {
                late_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'late_out');
                early_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'early_out');
            }
        }

        if (punch_in && punch_out) total_hours = calculateTotalHours(punch_in, punch_out);

        const userBioId = users[0].biometric_id || users[0].emp_id || null;

        const updated = await Attendance.update(id, {
            date,
            punch_in: punch_in || null,
            punch_out: punch_out || null,
            late_punch_in,
            late_punch_out,
            early_punch_out,
            total_hours,
            status: 'Present',
            biometric_id: userBioId
        });

        if (!updated) return res.status(404).json({ message: 'Attendance record not found' });

        res.status(200).json({ message: 'Attendance updated successfully' });
    } catch (error) {
        console.error('Error updating attendance:', error);
        res.status(500).json({ message: 'Error updating attendance', error: error.message });
    }
};

exports.deleteAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Attendance.delete(id);
        if (!deleted) return res.status(404).json({ message: 'Attendance record not found' });
        res.status(200).json({ message: 'Attendance deleted successfully' });
    } catch (error) {
        console.error('Error deleting attendance:', error);
        res.status(500).json({ message: 'Error deleting attendance', error: error.message });
    }
};

exports.syncBiometricLogs = async (req, res) => {
    try {
        const { fromDate, toDate } = req.body;
        const logs = await fetchBiometricLogsInternal(fromDate, toDate);

        if (logs.length === 0) {
            return res.json({ message: 'No logs found to sync', count: 0 });
        }

        // Store summarized logs for history
        const summarizedLogs = await processBiometricLogs(logs);
        if (summarizedLogs.length > 0) {
            await BiometricLog.createBulk(summarizedLogs);
        }

        const users = await require('../models/userModel').getAll();
        const userMap = {};
        const userByIdMap = {};
        users.forEach(u => {
            userByIdMap[u.id] = u;
            const fetchId = u.biometric_id || u.emp_id;
            if (fetchId) userMap[String(fetchId).trim()] = u;
        });

        // Group matched logs
        const matchedGroups = {};
        logs.forEach(log => {
            const user = userMap[String(log.emp_id).trim()];
            if (!user) return;

            const dateStr = normalizeDate(log.date);
            const key = `${user.id}_${dateStr}`;

            if (!matchedGroups[key]) {
                matchedGroups[key] = {
                    user_id: user.id,
                    date: dateStr,
                    punches: [],
                    shift: user.shift
                };
            }
            matchedGroups[key].punches.push(log.time);
        });

        let savedCount = 0;
        let skippedCount = 0;

        for (const key of Object.keys(matchedGroups)) {
            const group = matchedGroups[key];
            const { user_id, date, punches, shift } = group;

            // Check if already exists in DB
            const [existing] = await pool.execute(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                [user_id, date]
            );

            if (existing.length > 0) {
                const attn = existing[0];
                const allPunches = [...punches];
                if (attn.punch_in && attn.punch_in !== '00:00') allPunches.push(attn.punch_in);
                if (attn.punch_out && attn.punch_out !== '00:00') allPunches.push(attn.punch_out);

                const uniquePunches = [...new Set(allPunches.filter(p => p && p !== '--:--'))].sort();
                const newPunchIn = uniquePunches.length > 0 ? uniquePunches[0] : attn.punch_in;
                const newPunchOut = uniquePunches.length > 1 ? uniquePunches[uniquePunches.length - 1] : attn.punch_out;

                if (newPunchIn !== attn.punch_in || newPunchOut !== attn.punch_out) {
                    const { start: shiftStart, end: shiftEnd } = await getShiftTimes(shift);
                    let late_punch_in = "00:00";
                    let late_punch_out = "00:00";
                    let early_punch_out = "00:00";
                    let total_hours = "00:00";

                    if (shiftStart && shiftEnd) {
                        if (newPunchIn) late_punch_in = calculateTimeDiff(newPunchIn, shiftStart, 'late_in');
                        if (newPunchOut) {
                            late_punch_out = calculateTimeDiff(newPunchOut, shiftEnd, 'late_out');
                            early_punch_out = calculateTimeDiff(newPunchOut, shiftEnd, 'early_out');
                        }
                    }
                    if (newPunchIn && newPunchOut) total_hours = calculateTotalHours(newPunchIn, newPunchOut);

                    const syncStatus = (newPunchIn && !newPunchOut) ? 'Incomplete' : 'Present';

                    await Attendance.update(attn.id, {
                        ...attn,
                        punch_in: newPunchIn,
                        punch_out: newPunchOut,
                        late_punch_in,
                        late_punch_out,
                        early_punch_out,
                        total_hours,
                        status: syncStatus
                    });

                    savedCount++;
                } else {
                    skippedCount++;
                }
                continue;
            }


            punches.sort();
            const punch_in = punches[0];
            const punch_out = punches.length > 1 ? punches[punches.length - 1] : null;

            const { start: shiftStart, end: shiftEnd } = await getShiftTimes(shift);

            let late_punch_in = "00:00";
            let late_punch_out = "00:00";
            let early_punch_out = "00:00";
            let total_hours = "00:00";

            if (shiftStart && shiftEnd) {
                if (punch_in) late_punch_in = calculateTimeDiff(punch_in, shiftStart, 'late_in');
                if (punch_out) {
                    late_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'late_out');
                    early_punch_out = calculateTimeDiff(punch_out, shiftEnd, 'early_out');
                }
            }
            if (punch_in && punch_out) total_hours = calculateTotalHours(punch_in, punch_out);

            const userBioId = userByIdMap[user_id] ? (userByIdMap[user_id].biometric_id || userByIdMap[user_id].emp_id) : null;

            // If only punch_in exists (no punch_out), store as Incomplete
            const syncStatus = (punch_in && !punch_out) ? 'Incomplete' : 'Present';

            await Attendance.create({
                user_id,
                date,
                punch_in,
                punch_out,
                late_punch_in,
                late_punch_out,
                early_punch_out,
                total_hours,
                status: syncStatus,
                biometric_id: userBioId
            });
            savedCount++;
        }

        res.json({
            message: `Sync completed: Saved ${savedCount} records, skipped ${skippedCount} existing.`,
            savedCount,
            skippedCount
        });
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ message: 'Sync failed', error: error.message });
    }
};
exports.generateAttendanceReport = async (req, res) => {
    try {
        const { startDate, endDate, reportType, branches, shifts, empTypes, workModes, includeTimings, format } = req.query;
        const userRole = req.user.role;
        const userId = req.user.id;

        let attendanceData = await getAttendanceDataInternal(startDate, endDate, userId, userRole);

        // Apply filters
        if (branches && branches !== '[]') {
            const branchIds = JSON.parse(branches);
            attendanceData = attendanceData.filter(a =>
                branchIds.includes(`branch-${a.branch_id}`) ||
                branchIds.includes(String(a.department_id))
            );
        }
        if (shifts && shifts !== '[]') {
            const shiftIds = JSON.parse(shifts);
            attendanceData = attendanceData.filter(a =>
                shiftIds.includes(String(a.shift_id))
            );
        }
        if (empTypes && empTypes !== '[]') {
            const typeIds = JSON.parse(empTypes);
            attendanceData = attendanceData.filter(a =>
                typeIds.some(t => t.toLowerCase() === (a.employment_type || '').toLowerCase())
            );
        }
        if (workModes && workModes !== '[]') {
            const modeIds = JSON.parse(workModes);
            attendanceData = attendanceData.filter(a =>
                modeIds.some(m => m.toLowerCase() === (a.work_mode || '').toLowerCase())
            );
        }
        // ... more filter logic can be added here if needed, but getAttendanceDataInternal handles most ...

        // Filter based on report type
        let filteredData = attendanceData;
        let title = "Attendance Report";

        if (reportType === 'absent-report') {
            filteredData = attendanceData.filter(a => a.status === 'Absent');
            title = "Absent Report";
        } else if (reportType === 'present-report') {
            filteredData = attendanceData.filter(a => a.status === 'Present');
            title = "Present Report";
        } else if (reportType === 'late-report') {
            filteredData = attendanceData.filter(a => a.late_punch_in && a.late_punch_in !== '00:00' && a.late_punch_in !== '00:00:00');
            title = "Late Coming Report";
        } else if (reportType === 'early-leaving') {
            filteredData = attendanceData.filter(a => a.early_punch_out && a.early_punch_out !== '00:00' && a.early_punch_out !== '00:00:00');
            title = "Early Leaving Report";
        } else if (reportType === 'half-day') {
            filteredData = attendanceData.filter(a => a.working_day_value === 0.5);
            title = "Half Day Report";
        } else if (reportType === 'overtime') {
            filteredData = attendanceData.filter(a => a.late_punch_out && a.late_punch_out !== '00:00' && a.late_punch_out !== '00:00:00');
            title = "Overtime Report";
        } else if (reportType === 'leave-report') {
            filteredData = attendanceData.filter(a => a.status === 'On Leave' || a.status === 'Permission');
            title = "Leave & Permission Report";
        } else if (reportType === 'muster-roll') {
            title = "Muster Roll Report";
        }

        if (!filteredData || filteredData.length === 0) {
            return res.status(404).json({ message: 'No attendance records found for the selected criteria.' });
        }

        if (format === 'pdf') {
            // PDF Logic using Puppeteer
            const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
            const page = await browser.newPage();

            let htmlContent = `
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 10px; color: #333; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #41398B; padding-bottom: 10px; }
                    .header h1 { color: #41398B; margin: 0; font-size: 22px; }
                    .header p { color: #666; margin: 5px 0 0; font-size: 13px; }
                    .report-info { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 11px; font-weight: 600; color: #4B5563; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
                    th { background-color: #41398B !important; color: white !important; padding: 8px 4px; text-align: left; font-weight: 600; text-transform: uppercase; border: 1px solid #ddd; }
                    td { padding: 6px 4px; border: 1px solid #eee; text-align: left; }
                    tr:nth-child(even) { background-color: #F9FAFB; }
                    .status-present { color: #059669; font-weight: bold; }
                    .status-absent { color: #DC2626; font-weight: bold; }
                    .status-leave { color: #D97706; font-weight: bold; }
                    .status-other { color: #2563EB; }
                    .footer { margin-top: 20px; text-align: right; font-size: 9px; color: #9CA3AF; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${title}</h1>
                    <p>Report generated on: ${getISTDate()} ${getISTTime()}</p>
                </div>
                <div class="report-info">
                    <span>Date Range: ${startDate} to ${endDate}</span>
                    <span>Total Records: ${reportType === 'muster-roll' ? Object.keys(filteredData).length : filteredData.length}</span>
                </div>
                <table>
            `;

            if (reportType === 'muster-roll') {
                const dates = [];
                const dateHeaders = [];
                let curr = new Date(startDate);
                const end = new Date(endDate);
                while (curr <= end) {
                    dates.push(formatDate(curr));
                    dateHeaders.push(String(curr.getDate()).padStart(2, '0'));
                    curr.setDate(curr.getDate() + 1);
                }

                htmlContent += `<thead><tr><th>Employee</th><th>ID</th><th>Branch</th><th>Dept</th>`;
                dateHeaders.forEach(d => {
                    htmlContent += `<th style="text-align: center; font-size: 8px;">${d}</th>`;
                });
                htmlContent += `<th style="font-size: 8px;">Days</th><th style="font-size: 8px;">P</th><th style="font-size: 8px;">A</th><th style="font-size: 8px;">HD</th><th style="font-size: 8px;">WO</th><th style="font-size: 8px;">H</th><th style="font-size: 8px;">L</th><th style="font-size: 8px;">Work</th><th style="font-size: 8px;">OT</th></tr></thead><tbody>`;

                const empGroups = {};
                attendanceData.forEach(a => {
                    if (!empGroups[a.user_id]) {
                        empGroups[a.user_id] = { id: a.user_id, emp_id: a.emp_id, name: a.employee_name, dept: a.department, branch: a.branch, desig: a.designation, records: {} };
                    }
                    empGroups[a.user_id].records[formatDate(a.date)] = a;
                });

                Object.values(empGroups).forEach(emp => {
                    let pCount = 0, aCount = 0, lCount = 0, hCount = 0, woCount = 0, hdCount = 0;
                    let totalWorkSec = 0, totalOTSec = 0;

                    htmlContent += `<tr><td style="font-weight: 600;">${emp.name}</td><td>${emp.emp_id}</td><td>${emp.branch || '-'}</td><td>${emp.dept || '-'}</td>`;

                    dates.forEach(d => {
                        const record = emp.records[d];
                        const status = record?.status || 'N/A';
                        let code = '-';
                        let statusClass = 'status-other';

                        if (status === 'Present') {
                            const inT = record.punch_in && record.punch_in !== '00:00:00' ? record.punch_in.substring(0, 5) : '';
                            const outT = record.punch_out && record.punch_out !== '00:00:00' ? record.punch_out.substring(0, 5) : '';
                            code = `P${inT ? '<br>' + inT : ''}${outT ? '<br>' + outT : ''}`;
                            statusClass = 'status-present';
                            pCount++;
                        }
                        else if (status === 'Absent') { code = 'A'; statusClass = 'status-absent'; aCount++; }
                        else if (status === 'On Leave' || status === 'Permission') { code = 'L'; statusClass = 'status-leave'; lCount++; }
                        else if (status === 'Week Off') { code = 'WO'; statusClass = 'status-other'; woCount++; }
                        else if (status === 'Holiday') { code = 'H'; statusClass = 'status-other'; hCount++; }
                        else if (status === 'Half Day' || (record && record.working_day_value === 0.5)) {
                            code = 'HD'; statusClass = 'status-other'; hdCount++;
                        }

                        if (record) {
                            if (record.total_hours && record.total_hours !== '00:00:00') {
                                const [h, m, s] = record.total_hours.split(':').map(Number);
                                totalWorkSec += (h * 3600) + (m * 60) + (s || 0);
                            }
                            if (record.late_punch_out && record.late_punch_out !== '00:00:00') {
                                const [h, m, s] = record.late_punch_out.split(':').map(Number);
                                totalOTSec += (h * 3600) + (m * 60) + (s || 0);
                            }
                        }

                        htmlContent += `<td class="${statusClass}" style="text-align: center; font-size: 7px; padding: 4px 2px; line-height: 1.1;">${code}</td>`;
                    });

                    const fmt = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

                    htmlContent += `
                        <td style="text-align: center; font-size: 8px;">${dates.length}</td>
                        <td style="text-align: center; font-size: 8px; font-weight: bold;">${pCount}</td>
                        <td style="text-align: center; font-size: 8px; font-weight: bold; color: #DC2626;">${aCount}</td>
                        <td style="text-align: center; font-size: 8px;">${hdCount}</td>
                        <td style="text-align: center; font-size: 8px;">${woCount}</td>
                        <td style="text-align: center; font-size: 8px;">${hCount}</td>
                        <td style="text-align: center; font-size: 8px;">${lCount}</td>
                        <td style="text-align: center; font-size: 8px; color: #059669;">${fmt(totalWorkSec)}</td>
                        <td style="text-align: center; font-size: 8px; color: #2563EB;">${fmt(totalOTSec)}</td>
                        </tr>
                    `;
                });
            } else {
                let headers = ['Date', 'Emp ID', 'Name', 'In Time', 'Out Time', 'Status'];
                if (reportType === 'late-report') headers = ['Date', 'Emp ID', 'Name', 'Late (Mins)', 'Dept', 'In Time'];

                htmlContent += `<thead><tr>`;
                headers.forEach(h => htmlContent += `<th>${h}</th>`);
                htmlContent += `</tr></thead><tbody>`;

                filteredData.sort((a, b) => new Date(b.date) - new Date(a.date));
                filteredData.forEach(a => {
                    let statusClass = 'status-other';
                    if (a.status === 'Present') statusClass = 'status-present';
                    else if (a.status === 'Absent') statusClass = 'status-absent';
                    else if (a.status === 'On Leave') statusClass = 'status-leave';

                    if (reportType === 'late-report') {
                        let lateMins = 0;
                        if (a.late_punch_in && a.late_punch_in !== '00:00') {
                            const [h, m] = String(a.late_punch_in).split(':').map(Number);
                            lateMins = (h * 60) + m;
                        }
                        htmlContent += `
                            <tr>
                                <td>${a.date}</td>
                                <td>${a.emp_id}</td>
                                <td style="font-weight: 500;">${a.employee_name}</td>
                                <td style="font-weight: bold; color: #DC2626;">${lateMins}</td>
                                <td>${a.department}</td>
                                <td>${a.punch_in || '--:--'}</td>
                            </tr>
                        `;
                    } else {
                        htmlContent += `
                            <tr>
                                <td>${a.date}</td>
                                <td>${a.emp_id}</td>
                                <td style="font-weight: 500;">${a.employee_name}</td>
                                <td>${a.punch_in || '--:--'}</td>
                                <td>${a.punch_out || '--:--'}</td>
                                <td class="${statusClass}">${a.status}</td>
                            </tr>
                        `;
                    }
                });
            }

            htmlContent += `</tbody></table><div class="footer">Confidential HR Document - HRM Portal v2.0</div></body></html>`;

            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({
                format: 'A4',
                landscape: reportType === 'muster-roll',
                printBackground: true,
                margin: { top: '10mm', right: '5mm', bottom: '10mm', left: '5mm' }
            });

            await browser.close();

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${reportType}_${startDate}.pdf`);
            return res.send(pdfBuffer);
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(title);

        // Formatting Helpers
        const formatExcelDate = (dateStr) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
        };

        const formatExcelTime = (timeStr) => {
            if (!timeStr || timeStr === '00:00:00' || timeStr === '--:--') return '';
            const [h, m] = timeStr.split(':').map(Number);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const hh = h % 12 || 12;
            return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
        };

        const getDayName = (dateStr) => {
            return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(dateStr));
        };

        const getStatusCode = (status) => {
            if (status === 'Present') return 'P';
            if (status === 'Absent') return 'A';
            if (status === 'On Leave') return 'L';
            if (status === 'Week Off') return 'WO';
            if (status === 'Holiday') return 'H';
            return status;
        };

        // Metadata Header
        worksheet.addRow(['Report Generated:', title]);
        worksheet.addRow(['Date Range:', `${formatExcelDate(startDate)} to ${formatExcelDate(endDate)}`]);
        worksheet.addRow(['Generated By:', req.user.employee_name || req.user.name || 'admin']);
        worksheet.addRow(['Generated At:', new Intl.DateTimeFormat('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        }).format(new Date()).replace(',', '')]);
        worksheet.addRow([]); // Blank row

        // Styling Constants
        const headerBgColor = '4CAF50'; // Green theme from screenshot
        const headerTextColor = 'FFFFFF';
        const borderColor = 'D1D5DB';

        if (reportType === 'muster-roll') {
            const dates = [];
            const dateHeaders = [];
            let curr = new Date(startDate);
            const end = new Date(endDate);
            while (curr <= end) {
                dates.push(formatDate(curr));
                dateHeaders.push(String(curr.getDate()).padStart(2, '0') + '-' + curr.toLocaleString('en-US', { month: 'short' }));
                curr.setDate(curr.getDate() + 1);
            }

            const headerRowContent = [
                'Employee Name', 'Employee ID', 'Branch', 'Department', 'Designation',
                ...dateHeaders,
                'Total Days', 'Present', 'Absent', 'Half Day', 'Week Off', 'Non-Payable Week Off', 'Holiday', 'Leaves', 'Work Hrs', 'OT Hrs'
            ];
            const headerRow = worksheet.addRow(headerRowContent);

            headerRow.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
                cell.font = { bold: true, color: { argb: headerTextColor }, size: 10 };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            const empGroups = {};
            attendanceData.forEach(a => {
                if (!empGroups[a.user_id]) {
                    empGroups[a.user_id] = {
                        id: a.user_id,
                        emp_id: a.emp_id,
                        name: a.employee_name,
                        dept: a.department,
                        branch: a.branch || '-',
                        designation: a.designation || '-',
                        records: {}
                    };
                }
                empGroups[a.user_id].records[formatDate(a.date)] = a;
            });

            Object.values(empGroups).forEach(emp => {
                let present = 0, absent = 0, leaves = 0, halfDays = 0, weekOffs = 0, holidays = 0;
                let totalWorkSeconds = 0;
                let totalOTSeconds = 0;

                const rowData = [emp.name, emp.emp_id, emp.branch, emp.dept, emp.designation];

                dates.forEach(d => {
                    const record = emp.records[d];
                    const status = record?.status || 'N/A';
                    let code = '-';

                    if (status === 'Present') {
                        const inTime = formatExcelTime(record.punch_in);
                        const outTime = formatExcelTime(record.punch_out);
                        code = `P (${inTime}${(inTime && outTime) ? ' ,' : ''}${outTime})`;
                        present++;
                    } else if (status === 'Absent') {
                        code = 'A';
                        absent++;
                    } else if (status === 'On Leave' || status === 'Permission') {
                        code = 'L';
                        leaves++;
                    } else if (status === 'Week Off') {
                        code = 'WO';
                        weekOffs++;
                    } else if (status === 'Holiday') {
                        code = 'H';
                        holidays++;
                    } else if (status === 'Half Day' || (record && record.working_day_value === 0.5)) {
                        code = 'HD';
                        halfDays++;
                    }

                    // Accumulate totals
                    if (record) {
                        if (record.total_hours && record.total_hours !== '00:00:00') {
                            const [h, m, s] = record.total_hours.split(':').map(Number);
                            totalWorkSeconds += (h * 3600) + (m * 60) + (s || 0);
                        }
                        if (record.late_punch_out && record.late_punch_out !== '00:00:00') {
                            const [h, m, s] = record.late_punch_out.split(':').map(Number);
                            totalOTSeconds += (h * 3600) + (m * 60) + (s || 0);
                        }
                    }

                    rowData.push(code);
                });

                const formatDuration = (totalSeconds) => {
                    const h = Math.floor(totalSeconds / 3600);
                    const m = Math.floor((totalSeconds % 3600) / 60);
                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                };

                rowData.push(
                    dates.length, // Total Days
                    present,
                    absent,
                    halfDays,
                    weekOffs,
                    0, // Non-Payable Week Off (placeholder as not explicitly tracked yet)
                    holidays,
                    leaves,
                    formatDuration(totalWorkSeconds),
                    formatDuration(totalOTSeconds)
                );

                const row = worksheet.addRow(rowData);
                row.eachCell((cell, colNumber) => {
                    cell.alignment = { vertical: 'middle', horizontal: colNumber <= 5 ? 'left' : 'center' };
                    cell.font = { size: 9 };
                    cell.border = {
                        top: { style: 'thin', color: { argb: borderColor } },
                        left: { style: 'thin', color: { argb: borderColor } },
                        bottom: { style: 'thin', color: { argb: borderColor } },
                        right: { style: 'thin', color: { argb: borderColor } }
                    };

                    // Conditional colors based on status code
                    const val = String(cell.value || '');
                    if (val.startsWith('P')) cell.font = { color: { argb: '059669' }, size: 9 }; // Greenish
                    if (val === 'A') cell.font = { color: { argb: 'DC2626' }, size: 9 }; // Red
                    if (val === 'WO' || val === 'H') cell.font = { color: { argb: '2563EB' }, size: 9 }; // Blue
                });
            });

        } else {
            // Tabular View logic
            let headers;
            if (reportType === 'late-report') {
                headers = ['Employee Name', 'Employee ID', 'Date', 'Late Duration (Mins)', 'Department', 'In Time', 'Out Time'];
            } else {
                headers = ['Employee Name', 'Employee ID', 'Date', 'Day', 'Status', 'Shift', 'Department', 'Branch', 'In Time', 'Out Time'];
            }
            const headerRow = worksheet.addRow(headers);

            headerRow.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
                cell.font = { bold: true, color: { argb: headerTextColor }, size: 11 };
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            filteredData.sort((a, b) => {
                if (a.employee_name !== b.employee_name) return a.employee_name.localeCompare(b.employee_name);
                return new Date(a.date) - new Date(b.date);
            });

            filteredData.forEach((a) => {
                let rowData;
                if (reportType === 'late-report') {
                    // Calculate late duration in minutes
                    let lateMins = 0;
                    if (a.late_punch_in && a.late_punch_in !== '00:00') {
                        const [h, m, s] = String(a.late_punch_in).split(':').map(Number);
                        lateMins = (h * 60) + m;
                    }
                    rowData = [
                        a.employee_name,
                        a.emp_id,
                        formatExcelDate(a.date),
                        lateMins,
                        a.department,
                        formatExcelTime(a.punch_in),
                        formatExcelTime(a.punch_out)
                    ];
                } else {
                    rowData = [
                        a.employee_name,
                        a.emp_id,
                        formatExcelDate(a.date),
                        getDayName(a.date),
                        getStatusCode(a.status),
                        a.shift || '-',
                        a.department,
                        a.branch || '-',
                        formatExcelTime(a.punch_in),
                        formatExcelTime(a.punch_out)
                    ];
                }

                const row = worksheet.addRow(rowData);
                row.eachCell((cell) => {
                    cell.alignment = { vertical: 'middle', horizontal: 'left' };
                    cell.font = { size: 10 };
                });
            });

            // Set column widths for better readability
            if (reportType === 'late-report') {
                worksheet.columns = [
                    { width: 25 }, // Name
                    { width: 15 }, // ID
                    { width: 15 }, // Date
                    { width: 15 }, // Late Duration
                    { width: 25 }, // Dept
                    { width: 12 }, // In Time
                    { width: 12 }  // Out Time
                ];
            } else {
                worksheet.columns = [
                    { width: 25 }, // Name
                    { width: 15 }, // ID
                    { width: 15 }, // Date
                    { width: 12 }, // Day
                    { width: 8 },  // Status
                    { width: 15 }, // Shift
                    { width: 25 }, // Dept
                    { width: 20 }, // Branch
                    { width: 12 }, // In Time
                    { width: 12 }  // Out Time
                ];
            }
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${reportType}_${startDate}_to_${endDate}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ message: 'Error generating report', error: error.message });
    }
};

module.exports = {
    ...exports,
    getAttendanceDataInternal,
    enrichAttendanceRecord,
    isWeekOff,
    formatDate,
    getShiftTimes
};
