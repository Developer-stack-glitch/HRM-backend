const WeekOff = require('../models/weekoffModel');

exports.createWeekOff = async (req, res) => {
    try {
        const { userid, weekoffdate, alternative_date } = req.body;
        if (!userid || !weekoffdate) {
            return res.status(400).json({ message: 'User ID and Week Off Date are required' });
        }

        const conflictingDate = await WeekOff.checkDuplicateInWeek(userid, weekoffdate);
        if (conflictingDate) {
            return res.status(400).json({
                message: `This employee already has a week off assigned for ${conflictingDate} in the same week.`
            });
        }

        const id = await WeekOff.create({ userid, weekoffdate, alternative_date });
        res.status(201).json({ message: 'Week off assigned successfully', id });
    } catch (error) {
        console.error('Error creating weekoff:', error);
        res.status(500).json({ message: 'Error assigning week off', error: error.message });
    }
};

exports.getWeekOffs = async (req, res) => {
    try {
        let rows;
        if (req.user.role === 'employee') {
            rows = await WeekOff.getByUserId(req.user.id);
        } else {
            rows = await WeekOff.getAll();
        }
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching week offs', error: error.message });
    }
};

exports.deleteWeekOff = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await WeekOff.delete(id);
        if (!deleted) return res.status(404).json({ message: 'Week off record not found' });
        res.status(200).json({ message: 'Week off deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting week off', error: error.message });
    }
};

exports.updateWeekOff = async (req, res) => {
    try {
        const { id } = req.params;
        const { weekoffdate, userid } = req.body;

        // Get user_id if not provided
        let targetUserId = userid;
        if (!targetUserId) {
            const existing = await WeekOff.getById(id);
            if (!existing) return res.status(404).json({ message: 'Week off record not found' });
            targetUserId = existing.userid;
        }

        if (weekoffdate) {
            const conflictingDate = await WeekOff.checkDuplicateInWeek(targetUserId, weekoffdate, id);
            if (conflictingDate) {
                return res.status(400).json({
                    message: `This employee already has a week off assigned for ${conflictingDate} in the specific updated week.`
                });
            }
        }

        const updated = await WeekOff.update(id, req.body);
        if (!updated) return res.status(404).json({ message: 'Week off record not found' });
        res.status(200).json({ message: 'Week off updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating week off', error: error.message });
    }
};
