const CompanyPolicy = require('../models/companyPolicyModel');
const asyncHandler = require('express-async-handler');

// @desc    Get company policy
// @route   GET /api/attendance/company-policy/:companyId
// @access  Private
const getCompanyPolicy = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const policy = await CompanyPolicy.getByCompanyId(companyId);
    if (!policy) {
        // Return default values if not set
        return res.status(200).json({
            company_id: companyId,
            cl_limit: 0.0,
            permission_limit: 0.0
        });
    }
    res.status(200).json(policy);
});

// @desc    Save company policy
// @route   POST /api/attendance/company-policy
// @access  Private
const saveCompanyPolicy = asyncHandler(async (req, res) => {
    const { company_id, cl_limit, permission_limit } = req.body;
    if (!company_id) {
        return res.status(400).json({ message: 'Company ID is required' });
    }
    const id = await CompanyPolicy.save({ company_id, cl_limit, permission_limit });
    res.status(200).json({ message: 'Company policy saved successfully', id });
});

module.exports = {
    getCompanyPolicy,
    saveCompanyPolicy
};
