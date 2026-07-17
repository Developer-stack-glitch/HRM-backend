const Policy = require('../models/policyModel');
const asyncHandler = require('express-async-handler');
const { sendNotification } = require('../utils/notificationHelper');

// @desc    Get all policies
// @route   GET /api/policies
// @access  Private
const getPolicies = asyncHandler(async (req, res) => {
    const policies = await Policy.getAll();
    res.status(200).json(policies);
});

// @desc    Create a new policy
// @route   POST /api/policies
// @access  Private/Admin
const createPolicy = asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Unauthorized access' });
    }

    const { title, description, category } = req.body;
    const file_url = req.file ? `/uploads/${req.file.filename}` : null;
    const created_by = req.user.id;

    if (!title) {
        return res.status(400).json({ message: 'Title is required' });
    }

    const policyId = await Policy.create({
        title,
        description,
        category,
        file_url,
        created_by
    });

    // Send push notification to all employees about new policy
    const io = req.app.get('io');
    await sendNotification(io, {
        role: 'employee',
        type: 'policy_published',
        title: 'New Company Policy',
        message: `A new policy "${title}" has been published${category ? ` under ${category}` : ''}.`,
        extra_data: { policy_id: policyId }
    });
    await sendNotification(io, {
        role: 'admin',
        type: 'policy_published',
        title: 'New Company Policy',
        message: `A new policy "${title}" has been published${category ? ` under ${category}` : ''}.`,
        extra_data: { policy_id: policyId }
    });

    res.status(201).json({ message: 'Policy created successfully', policyId });
});

// @desc    Update a policy
// @route   PUT /api/policies/:id
// @access  Private/Admin
const updatePolicy = asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Unauthorized access' });
    }

    const { id } = req.params;
    const { title, description, category } = req.body;
    const file_url = req.file ? `/uploads/${req.file.filename}` : null;

    const existingPolicy = await Policy.getById(id);
    if (!existingPolicy) {
        return res.status(404).json({ message: 'Policy not found' });
    }

    const dataToUpdate = {
        title,
        description,
        category,
        file_url
    };

    await Policy.update(id, dataToUpdate);

    // Notify all employees about policy update
    const io = req.app.get('io');
    await sendNotification(io, {
        role: 'employee',
        type: 'policy_updated',
        title: 'Company Policy Updated',
        message: `The policy "${title || existingPolicy.title}" has been updated. Please review the changes.`,
        extra_data: { policy_id: id }
    });

    res.status(200).json({ message: 'Policy updated successfully' });
});

// @desc    Delete a policy
// @route   DELETE /api/policies/:id
// @access  Private/Admin
const deletePolicy = asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Unauthorized access' });
    }

    const { id } = req.params;
    const existingPolicy = await Policy.getById(id);

    if (!existingPolicy) {
        return res.status(404).json({ message: 'Policy not found' });
    }

    await Policy.delete(id);
    res.status(200).json({ message: 'Policy deleted successfully' });
});

module.exports = {
    getPolicies,
    createPolicy,
    updatePolicy,
    deletePolicy
};
