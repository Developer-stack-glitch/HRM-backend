const AttendancePolicy = require('../models/attendancePolicyModel');
const asyncHandler = require('express-async-handler');

// @desc    Get all attendance policy rules
// @route   GET /api/attendance/policy-rules
// @access  Private
const getAllRules = asyncHandler(async (req, res) => {
    const rules = await AttendancePolicy.getAllRules();
    res.status(200).json(rules);
});

// @desc    Create a new attendance policy rule
// @route   POST /api/attendance/policy-rules
// @access  Private
const createRule = asyncHandler(async (req, res) => {
    const ruleId = await AttendancePolicy.createRule(req.body);
    res.status(201).json({ message: 'Rule created successfully', id: ruleId });
});

// @desc    Update an attendance policy rule
// @route   PUT /api/attendance/policy-rules/:id
// @access  Private
const updateRule = asyncHandler(async (req, res) => {
    await AttendancePolicy.updateRule(req.params.id, req.body);
    res.status(200).json({ message: 'Rule updated successfully' });
});

// @desc    Delete an attendance policy rule
// @route   DELETE /api/attendance/policy-rules/:id
// @access  Private
const deleteRule = asyncHandler(async (req, res) => {
    await AttendancePolicy.deleteRule(req.params.id);
    res.status(200).json({ message: 'Rule deleted successfully' });
});

module.exports = {
    getAllRules,
    createRule,
    updateRule,
    deleteRule
};
