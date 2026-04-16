const Regularisation = require('../models/regularisationModel');
const Attendance = require('../models/attendanceModel');
const { pool } = require('../Config/dbConfig');

const createRequest = async (req, res) => {
    try {
        const { date, check_in, check_out, reason } = req.body;
        const user_id = req.user.id;

        const requestId = await Regularisation.create({
            user_id,
            date,
            check_in,
            check_out,
            reason,
            status: 'Pending'
        });

        // Send Notification
        const io = req.app.get('socketio');
        const { sendNotification } = require('../utils/notificationHelper');
        const { User } = require('../models/userModel');
        const userData = await User.findById(user_id);
        const userName = userData?.employee_name || 'Employee';

        // 1. Send to Reporting Manager if exists
        if (userData && userData.reporting_manager) {
            await sendNotification(io, {
                user_id: userData.reporting_manager,
                type: 'request',
                title: 'New Regularisation Request',
                message: `${userName} has requested attendance regularisation for ${date}`,
                extra_data: { requestId, type: 'regularisation_request' }
            });
        }

        // 2. Send to Admin/Superadmin
        await sendNotification(io, {
            role: 'admin',
            type: 'request',
            title: 'New Regularisation Request',
            message: `${userName} has requested attendance regularisation for ${date}`,
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
            const [existingAttendance] = await pool.execute(
                'SELECT id FROM attendance WHERE user_id = ? AND date = ?',
                [request.user_id, request.date]
            );

            const attendanceData = {
                user_id: request.user_id,
                date: request.date,
                punch_in: request.check_in,
                punch_out: request.check_out,
                status: 'Present', // Regularized usually means present
                is_web_punch: 1 // Marking as web/manual punch
            };

            if (existingAttendance.length > 0) {
                await Attendance.update(existingAttendance[0].id, attendanceData);
            } else {
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

        let query = '';
        const params = [];

        if (userRole === 'admin' || userRole === 'superadmin') {
            query = 'SELECT status, COUNT(*) as count FROM regularisations GROUP BY status';
        } else {
            // Include their own requests AND requests from their reportees
            query = `
                SELECT r.status, COUNT(*) as count 
                FROM regularisations r
                JOIN users u ON r.user_id = u.id
                WHERE r.user_id = ? OR u.reporting_manager = ?
                GROUP BY r.status
            `;
            params.push(userId, userId);
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
