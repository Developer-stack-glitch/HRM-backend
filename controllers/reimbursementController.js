const Reimbursement = require('../models/reimbursementModel');

const createReimbursement = async (req, res) => {
    try {
        const { category, title, description, amount, date } = req.body;
        const receipt_url = req.file ? `/uploads/${req.file.filename}` : null;

        // Use user id from auth middleware
        const user_id = req.user.id;

        const claimId = await Reimbursement.create({
            user_id,
            category,
            title,
            description,
            amount,
            date,
            receipt_url
        });

        const io = req.app.get('socketio');
        const { sendNotification } = require('../utils/notificationHelper');
        const userName = req.user.name || req.user.employee_name || 'Employee';

        await sendNotification(io, {
            role: 'admin',
            type: 'request',
            title: 'New Reimbursement Claim',
            message: `${userName} submitted a claim of ₹${amount} for ${category}`,
            extra_data: { claim_id: claimId, type: 'reimbursement_request' }
        });

        res.status(201).json({ message: 'Claim submitted successfully', claimId });
    } catch (error) {
        console.error('Error creating reimbursement:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const getReimbursements = async (req, res) => {
    try {
        const filters = {};
        if (req.user.role === 'employee') {
            filters.user_id = req.user.id;
        }

        const { fromDate, toDate, departments, categories, statuses, status } = req.query;

        if (fromDate) filters.fromDate = fromDate;
        if (toDate) filters.toDate = toDate;
        if (departments) filters.departments = departments.split(',');
        if (categories) filters.categories = categories.split(',');
        if (statuses) filters.statuses = statuses.split(',');
        if (status) filters.status = status;

        const claims = await Reimbursement.getAll(filters);
        res.status(200).json(claims);
    } catch (error) {
        console.error('Error fetching reimbursements:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const updateClaimStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, comment } = req.body;

        if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Unauthorized to update status' });
        }

        const affectedRows = await Reimbursement.updateStatus(id, status, comment);

        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Claim not found' });
        }

        // Send notification to employee
        const claim = await Reimbursement.getById(id);
        if (claim) {
            const io = req.app.get('socketio');
            const { sendNotification } = require('../utils/notificationHelper');
            await sendNotification(io, {
                user_id: claim.user_id,
                type: 'reimbursement',
                title: `Claim ${status}`,
                message: `Your reimbursement claim for ₹${claim.amount} has been ${status.toLowerCase()}${comment ? ': ' + comment : ''}`,
                extra_data: { claim_id: id, status, type: 'reimbursement_status_update' }
            });
        }

        res.status(200).json({ message: `Claim ${status.toLowerCase()} successfully` });
    } catch (error) {
        console.error('Error updating claim status:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const deleteClaim = async (req, res) => {
    try {
        const { id } = req.params;
        const claim = await Reimbursement.getById(id);

        if (!claim) {
            return res.status(404).json({ message: 'Claim not found' });
        }

        // Only owner or admin can delete
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin' && claim.user_id !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized to delete this claim' });
        }

        if (claim.status !== 'Pending' && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(400).json({ message: 'Cannot delete processed claims' });
        }

        await Reimbursement.delete(id);
        res.status(200).json({ message: 'Claim deleted successfully' });
    } catch (error) {
        console.error('Error deleting claim:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const getReimbursementCategories = async (req, res) => {
    try {
        const categories = await Reimbursement.getCategories();
        res.status(200).json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = {
    createReimbursement,
    getReimbursements,
    updateClaimStatus,
    deleteClaim,
    getReimbursementCategories
};
