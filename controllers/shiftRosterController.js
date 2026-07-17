const ShiftRoster = require('../models/shiftRosterModel');
const { sendNotification } = require('../utils/notificationHelper');

const getRoster = async (req, res) => {
    try {
        const { start_date, end_date, department, branch } = req.query;
        if (!start_date || !end_date) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        const roster = await ShiftRoster.getRoster(start_date, end_date, { department, branch });
        res.status(200).json(roster);
    } catch (error) {
        console.error('Error fetching roster:', error);
        res.status(500).json({ message: 'Error fetching roster', error: error.message });
    }
};

const assignShift = async (req, res) => {
    try {
        const { user_id, shift_id, roster_date } = req.body;
        if (!user_id || !shift_id || !roster_date) {
            return res.status(400).json({ message: 'User ID, Shift ID, and Date are required' });
        }

        await ShiftRoster.assignShift({ user_id, shift_id, roster_date });
        
        await sendNotification(req.app.get('io'), {
            user_id: user_id,
            type: 'shift_assigned',
            title: 'New Shift Assigned',
            message: `You have been assigned a new shift on ${new Date(roster_date).toLocaleDateString()}.`,
            extra_data: { shift_id, roster_date }
        });

        res.status(200).json({ message: 'Shift assigned successfully' });
    } catch (error) {
        console.error('Error assigning shift:', error);
        res.status(500).json({ message: 'Error assigning shift', error: error.message });
    }
};

const bulkAssign = async (req, res) => {
    try {
        const { user_ids, shift_id, start_date, end_date } = req.body;
        if (!user_ids || !shift_id || !start_date || !end_date) {
            return res.status(400).json({ message: 'User IDs, Shift ID, and Date range are required' });
        }

        await ShiftRoster.bulkAssign(user_ids, shift_id, start_date, end_date);

        for (const uid of user_ids) {
            await sendNotification(req.app.get('io'), {
                user_id: uid,
                type: 'shift_assigned',
                title: 'New Shifts Assigned',
                message: `You have been assigned new shifts from ${new Date(start_date).toLocaleDateString()} to ${new Date(end_date).toLocaleDateString()}.`,
                extra_data: { shift_id, start_date, end_date }
            });
        }

        res.status(200).json({ message: 'Bulk shift assignment completed' });
    } catch (error) {
        console.error('Error in bulk shift assignment:', error);
        res.status(500).json({ message: 'Error in bulk shift assignment', error: error.message });
    }
};

const deleteAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        await ShiftRoster.deleteAssignment(id);
        res.status(200).json({ message: 'Shift assignment removed' });
    } catch (error) {
        console.error('Error deleting shift assignment:', error);
        res.status(500).json({ message: 'Error deleting shift assignment', error: error.message });
    }
};

module.exports = {
    getRoster,
    assignShift,
    bulkAssign,
    deleteAssignment
};
