const AdvanceSalary = require("../models/advanceSalaryModel");

const createAdvanceSalary = async (req, res) => {
    try {
        const { amount, reason, repayment_months } = req.body;
        const user_id = req.user.id;

        const numAmount = parseFloat(amount);
        if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ message: "A valid positive advance amount is required" });
        }

        const data = {
            user_id,
            amount: numAmount,
            reason: reason ? String(reason).trim().slice(0, 500) : '',
            repayment_months: Math.max(1, parseInt(repayment_months) || 1),
            request_date: new Date()
        };

        const insertId = await AdvanceSalary.create(data);
        res.status(201).json({ message: "Advance salary request submitted", id: insertId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAdvanceSalaries = async (req, res) => {
    try {
        const { status, page = 1, limit = 10, search, sortBy, sortOrder } = req.query;
        let user_id = null;

        const role = (req.user.role || '').toLowerCase();
        if (role !== 'admin' && role !== 'superadmin' && role !== 'hr executive') {
            user_id = req.user.id;
        }

        const params = { status, page, limit, user_id, search, sortBy, sortOrder };
        const data = await AdvanceSalary.getAll(params);
        const total = await AdvanceSalary.getCount({ status, user_id, search });

        res.json({ data, total, page, limit });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyAdvanceSalaries = async (req, res) => {
    try {
        const { status, page = 1, limit = 10, search, sortBy, sortOrder } = req.query;
        const user_id = req.user.id;

        const params = { status, page, limit, user_id, search, sortBy, sortOrder };
        const data = await AdvanceSalary.getAll(params);
        const total = await AdvanceSalary.getCount({ status, user_id, search });

        res.json({ data, total, page, limit });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateAdvanceSalaryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_comments } = req.body;
        const approved_by = req.user.id;

        const role = (req.user.role || '').toLowerCase();
        if (role !== 'admin' && role !== 'superadmin' && role !== 'hr executive') {
            return res.status(403).json({ message: "Forbidden: Only admins can update status" });
        }

        const success = await AdvanceSalary.updateStatus(id, { status, admin_comments, approved_by });

        if (success) {
            res.json({ message: `Request ${status.toLowerCase()} successfully` });
        } else {
            res.status(404).json({ message: "Request not found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteAdvanceSalary = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await AdvanceSalary.getById(id);
        if (!existing) {
            return res.status(404).json({ message: "Request not found" });
        }

        const role = (req.user.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'superadmin' || role === 'hr executive';

        if (!isAdmin) {
            if (existing.user_id !== req.user.id) {
                return res.status(403).json({ message: "Forbidden: You can only delete your own advance salary requests" });
            }
            if (existing.status !== 'Pending') {
                return res.status(400).json({ message: "Cannot delete advance salary request once processed" });
            }
        }

        const success = await AdvanceSalary.delete(id);
        if (success) {
            res.json({ message: "Request deleted successfully" });
        } else {
            res.status(404).json({ message: "Request not found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createAdvanceSalary,
    getAdvanceSalaries,
    getMyAdvanceSalaries,
    updateAdvanceSalaryStatus,
    deleteAdvanceSalary
};
