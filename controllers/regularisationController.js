const Regularisation = require('../models/regularisationModel');
const Attendance = require('../models/attendanceModel');
const { pool } = require('../Config/dbConfig');

const calculateTotalHours = (inTime, outTime) => {
    if (!inTime || !outTime) return "00:00:00";
    try {
        const [hIn, mIn, sIn] = inTime.split(':').map(Number);
        const [hOut, mOut, sOut] = outTime.split(':').map(Number);
        let diff = (hOut * 3600 + mOut * 60 + (sOut || 0)) - (hIn * 3600 + mIn * 60 + (sIn || 0));
        if (diff < 0) diff += 24 * 3600; // Handle overnight shifts
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } catch {
        return "00:00:00";
    }
};

const createRequest = async (req, res) => {
    try {
        const { date, check_in, check_out, reason } = req.body;
        const user_id = req.user.id;

        if (!date) {
            return res.status(400).json({ message: 'Target correction date is required' });
        }

        const resolvedCheckIn = check_in && check_in.trim() !== '' ? check_in.trim() : null;
        const resolvedCheckOut = check_out && check_out.trim() !== '' ? check_out.trim() : null;

        if (!resolvedCheckIn && !resolvedCheckOut) {
            return res.status(400).json({ message: 'Please provide either Clock In, Clock Out, or both' });
        }

        const requestId = await Regularisation.create({
            user_id,
            date,
            check_in: resolvedCheckIn,
            check_out: resolvedCheckOut,
            reason,
            status: 'Pending'
        });

        // Send Notification
        const io = req.app.get('socketio');
        const { sendNotification } = require('../utils/notificationHelper');
        const { User } = require('../models/userModel');
        const userData = await User.findById(user_id);
        const userName = userData?.employee_name || 'Employee';

        const punchTypeDesc = (resolvedCheckIn && resolvedCheckOut) 
            ? 'Punch In & Out' 
            : resolvedCheckIn 
            ? 'Punch In Only' 
            : 'Punch Out Only';

        // 1. Send to Reporting Manager if exists
        if (userData && userData.reporting_manager) {
            await sendNotification(io, {
                user_id: userData.reporting_manager,
                type: 'request',
                title: 'New Regularisation Request',
                message: `${userName} has requested attendance regularisation (${punchTypeDesc}) for ${date}`,
                extra_data: { requestId, type: 'regularisation_request' }
            });
        }

        // 2. Send to Admin/Superadmin
        await sendNotification(io, {
            role: 'admin',
            type: 'request',
            title: 'New Regularisation Request',
            message: `${userName} has requested attendance regularisation (${punchTypeDesc}) for ${date}`,
            extra_data: { requestId, type: 'regularisation_request' }
        });

        res.status(201).json({ message: 'Regularisation request submitted successfully', requestId });
    } catch (error) {
        console.error('Error creating regularisation request:', error);
        res.status(500).json({ message: 'Error submitting request', error: error.message });
    }
};

const getRequests = async (req, res) => {
    try {
        const filters = { ...req.query };
        if (req.user.role === 'employee') {
            // Include their own requests AND requests from their reportees
            filters.reporting_manager = req.user.id;
            filters.personal_user_id = req.user.id;
        }

        const requests = await Regularisation.getAll(filters);
        res.status(200).json(requests);
    } catch (error) {
        console.error('Error fetching regularisation requests:', error);
        res.status(500).json({ message: 'Error fetching requests', error: error.message });
    }
};

const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body;
        const approved_by = req.user.id;

        const request = await Regularisation.getById(id);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        const success = await Regularisation.updateStatus(id, status, approved_by, rejection_reason);

        if (success && status === 'Approved') {
            // Update or Create Attendance record
            const formattedDate = new Date(request.date).toISOString().split('T')[0];
            const [existingAttendance] = await pool.execute(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                [request.user_id, formattedDate]
            );

            let punch_in = request.check_in || null;
            let punch_out = request.check_out || null;

            if (existingAttendance.length > 0) {
                const ex = existingAttendance[0];
                // If only one punch was regularised, preserve the other existing punch
                if (!punch_in) punch_in = ex.punch_in;
                if (!punch_out) punch_out = ex.punch_out;

                const total_hours = (punch_in && punch_out) 
                    ? calculateTotalHours(punch_in, punch_out) 
                    : (ex.total_hours || '00:00:00');

                const attendanceData = {
                    ...ex,
                    punch_in,
                    punch_out,
                    total_hours,
                    status: 'Present',
                    is_web_punch: 1,
                    is_edited: 1
                };

                await Attendance.update(ex.id, attendanceData);
            } else {
                const total_hours = (punch_in && punch_out) 
                    ? calculateTotalHours(punch_in, punch_out) 
                    : '00:00:00';

                const attendanceData = {
                    user_id: request.user_id,
                    date: formattedDate,
                    punch_in: punch_in,
                    punch_out: punch_out,
                    total_hours,
                    status: 'Present',
                    is_web_punch: 1,
                    is_edited: 1
                };

                await Attendance.create(attendanceData);
            }
        }

        // Send status update notification to the employee
        if (success && status) {
            const io = req.app.get('socketio');
            const { sendNotification } = require('../utils/notificationHelper');
            const { User } = require('../models/userModel');
            
            // Get manager name for better message
            const managerData = await User.findById(approved_by);
            const managerName = managerData?.employee_name || 'Administrator';
            
            await sendNotification(io, {
                user_id: request.user_id,
                type: 'regularisation',
                title: `Attendance Correction ${status}`,
                message: `Your regularisation request for ${request.date} has been ${status.toLowerCase()} by ${managerName}${rejection_reason ? ': ' + rejection_reason : ''}`,
                extra_data: { requestId: id, status, type: 'regularisation_status_update' }
            });
        }

        res.status(200).json({ message: `Request ${status.toLowerCase()} successfully` });
    } catch (error) {
        console.error('Error updating regularisation status:', error);
        res.status(500).json({ message: 'Error updating status', error: error.message });
    }
};

const getCounts = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { startDate, endDate, date } = req.query;

        let query = '';
        let dateCondition = '';
        const params = [];
        const dateParams = [];

        if (startDate && endDate) {
            dateCondition = ' AND r.date BETWEEN ? AND ?';
            dateParams.push(startDate, endDate);
        } else if (startDate) {
            dateCondition = ' AND r.date >= ?';
            dateParams.push(startDate);
        } else if (endDate) {
            dateCondition = ' AND r.date <= ?';
            dateParams.push(endDate);
        } else if (date) {
            dateCondition = ' AND r.date = ?';
            dateParams.push(date);
        }

        if (userRole === 'admin' || userRole === 'superadmin') {
            query = `SELECT r.status, COUNT(*) as count FROM regularisations r WHERE 1=1 ${dateCondition} GROUP BY r.status`;
            params.push(...dateParams);
        } else {
            // Include their own requests AND requests from their reportees
            query = `
                SELECT r.status, COUNT(*) as count 
                FROM regularisations r
                JOIN users u ON r.user_id = u.id
                WHERE (r.user_id = ? OR u.reporting_manager = ?) ${dateCondition}
                GROUP BY r.status
            `;
            params.push(userId, userId, ...dateParams);
        }

        const [rows] = await pool.execute(query, params);
        
        const counts = {
            Requested: 0,
            Pending: 0,
            Approved: 0,
            Rejected: 0
        };

        rows.forEach(row => {
            // Map case-insensitive status to the keys in the counts object
            const status = row.status.charAt(0).toUpperCase() + row.status.slice(1).toLowerCase();
            if (status === 'Pending') counts.Pending = row.count;
            else if (status === 'Approved') counts.Approved = row.count;
            else if (status === 'Rejected') counts.Rejected = row.count;
        });

        // Calculate total Requested count
        counts.Requested = counts.Pending + counts.Approved + counts.Rejected;

        res.status(200).json(counts);
    } catch (error) {
        console.error('Error fetching regularisation counts:', error);
        res.status(500).json({ message: 'Error fetching counts', error: error.message });
    }
};

module.exports = {
    createRequest,
    getRequests,
    updateStatus,
    getCounts
};
