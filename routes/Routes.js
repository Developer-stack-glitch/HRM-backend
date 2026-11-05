const express = require('express');
const router = express.Router();

// --- Middlewares ---
const { protect, adminOnly, superAdminOnly } = require('../middleware/authMiddleware');
const { loginLimiter, otpLimiter } = require('../middleware/rateLimitMiddleware');
const upload = require('../middleware/uploadMiddleware');

// --- Controllers ---
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const orgController = require('../controllers/organizationController');
const attendanceController = require('../controllers/attendanceController');
const attendancePolicyController = require('../controllers/attendancePolicyController');
const companyPolicyController = require('../controllers/companyPolicyController');
const holidayController = require('../controllers/holidayController');
const leaveController = require('../controllers/leaveController');
const weekoffController = require('../controllers/weekoffController');
const companyWeekoffController = require('../controllers/companyWeekoffController');
const salaryStructureController = require('../controllers/salaryStructureController');
const payrollRunController = require('../controllers/payrollRunController');
const assetController = require('../controllers/assetController');
const reimbursementController = require('../controllers/reimbursementController');
const deviceController = require('../controllers/deviceController');
const jobController = require('../controllers/jobController');
const applicantController = require('../controllers/applicantController');
const advanceSalaryController = require('../controllers/advanceSalaryController');
const salaryComponentController = require('../controllers/salaryComponentController');
const policyController = require('../controllers/policyController');
const statutoryComplianceController = require('../controllers/statutoryComplianceController');
const complianceSettingsController = require('../controllers/complianceSettingsController');
const salaryFormulaController = require('../controllers/salaryFormulaController');
const rolePermissionController = require('../controllers/rolePermissionController');
const notificationController = require('../controllers/notificationController');
const regularisationController = require('../controllers/regularisationController');
const shiftRosterController = require('../controllers/shiftRosterController');
const incentiveController = require('../controllers/incentiveController');
const helpdeskController = require('../controllers/helpdeskController');

// --- Upload Configurations ---
const assetUploadFields = [
    { name: 'asset_image', maxCount: 1 },
    { name: 'invoice', maxCount: 1 }
];

const documentFields = [
    { name: 'resume', maxCount: 1 },
    { name: 'test_paper', maxCount: 1 },
    { name: '10th', maxCount: 1 },
    { name: '12th', maxCount: 1 },
    { name: 'ug', maxCount: 1 },
    { name: 'pg', maxCount: 1 },
    { name: 'aadhar_file', maxCount: 1 },
    { name: 'pan_file', maxCount: 1 },
    { name: 'passbook', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'relieving_letter', maxCount: 1 },
    { name: 'exp_letter', maxCount: 1 },
    { name: 'payslips', maxCount: 5 },
    { name: 'emp_details_form', maxCount: 1 }
];

// ==========================================
// ROUTES
// ==========================================

// --- Auth Routes ---
router.post('/auth/login', loginLimiter, authController.loginUser);
router.post('/auth/forgot-password', otpLimiter, authController.forgotPassword);
router.post('/auth/verify-otp', otpLimiter, authController.verifyOtp);
router.post('/auth/reset-password', otpLimiter, authController.resetPassword);
router.post('/auth/logout', protect, authController.logoutUser);

// --- User Routes ---
router.get('/users/me', protect, userController.getProfile);
router.post('/users/', protect, adminOnly, upload.fields(documentFields), userController.createUser);
router.get('/users/milestones', protect, userController.getMilestones);
router.get('/users/user-attendance', protect, userController.getUserAttendance);
router.get('/users/bulk-template', protect, adminOnly, userController.downloadBulkTemplate);
router.get('/users/reference-ids', protect, adminOnly, userController.downloadReferenceIds);
router.post('/users/bulk-upload', protect, adminOnly, upload.single('file'), userController.bulkUploadUsers);
router.get('/users/check-duplicate', protect, adminOnly, userController.checkDuplicate);
router.get('/users/', protect, userController.getUsers);
router.get('/users/:id', protect, userController.getUserById);
router.put('/users/:id', protect, upload.fields(documentFields), userController.updateUser);
router.delete('/users/:id', protect, adminOnly, userController.deleteUser);

// --- Organization Routes ---
router.post('/organization/companies', protect, superAdminOnly, upload.fields([{ name: 'logo', maxCount: 1 }]), orgController.createCompany);
router.put('/organization/companies/:id', protect, superAdminOnly, upload.fields([{ name: 'logo', maxCount: 1 }]), orgController.updateCompany);
router.delete('/organization/companies/:id', protect, superAdminOnly, orgController.deleteCompany);
router.get('/organization/companies', protect, superAdminOnly, orgController.getCompanies);
router.get('/organization/companies/:id', protect, superAdminOnly, orgController.getCompanyById);
router.post('/organization/companies/setup-database', protect, superAdminOnly, orgController.setupCompanyDatabase);
router.post('/organization/branches', protect, adminOnly, orgController.createBranch);
router.get('/organization/branches', protect, orgController.getBranches);
router.post('/organization/designations', protect, adminOnly, orgController.createDesignation);
router.get('/organization/designations', protect, orgController.getDesignations);
router.post('/organization/shifts', protect, adminOnly, orgController.createShift);
router.get('/organization/shifts', protect, orgController.getShifts);
router.post('/organization/departments', protect, adminOnly, orgController.createDepartment);
router.get('/organization/departments', protect, orgController.getDepartments);
router.get('/organization/employment-types', protect, orgController.getEmploymentTypes);
router.get('/organization/work-locations', protect, orgController.getWorkLocations);
router.get('/organization/metadata', protect, orgController.getMetadata);

// --- Attendance Routes ---
router.post('/attendance/', protect, adminOnly, attendanceController.saveAttendance);
router.get('/attendance/', protect, attendanceController.getAttendance);
router.get('/attendance/generate-report', protect, adminOnly, attendanceController.generateAttendanceReport);
router.get('/attendance/today-status/:userId', protect, attendanceController.getTodayStatus);
router.post('/attendance/web-clock-in', protect, attendanceController.webClockIn);
router.post('/attendance/web-clock-out', protect, attendanceController.webClockOut);
router.post('/attendance/start-break', protect, attendanceController.startBreak);
router.post('/attendance/end-break', protect, attendanceController.endBreak);
router.get('/attendance/biometric-logs', protect, adminOnly, attendanceController.previewBiometricLogs);
router.post('/attendance/sync', protect, adminOnly, attendanceController.syncBiometricLogs);
router.put('/attendance/:id', protect, adminOnly, attendanceController.updateAttendance);
router.delete('/attendance/:id', protect, adminOnly, attendanceController.deleteAttendance);
router.get('/attendance/policy-rules', protect, attendancePolicyController.getAllRules);
router.post('/attendance/policy-rules', protect, adminOnly, attendancePolicyController.createRule);
router.put('/attendance/policy-rules/:id', protect, adminOnly, attendancePolicyController.updateRule);
router.delete('/attendance/policy-rules/:id', protect, adminOnly, attendancePolicyController.deleteRule);
router.get('/attendance/company-policy/:companyId', protect, companyPolicyController.getCompanyPolicy);
router.post('/attendance/company-policy', protect, adminOnly, companyPolicyController.saveCompanyPolicy);

// --- Regularisation Routes ---
router.post('/regularisations/', protect, regularisationController.createRequest);
router.get('/regularisations/', protect, regularisationController.getRequests);
router.get('/regularisations/counts', protect, regularisationController.getCounts);
router.put('/regularisations/:id/status', protect, regularisationController.updateStatus);

// --- Shift Roster Routes ---
router.get('/shift-roster', protect, shiftRosterController.getRoster);
router.post('/shift-roster/assign', protect, adminOnly, shiftRosterController.assignShift);
router.post('/shift-roster/bulk-assign', protect, adminOnly, shiftRosterController.bulkAssign);
router.delete('/shift-roster/:id', protect, adminOnly, shiftRosterController.deleteAssignment);

// --- Holiday Routes ---
router.get('/holidays/', protect, holidayController.getHolidays);
router.post('/holidays/', protect, adminOnly, holidayController.createHoliday);
router.put('/holidays/:id', protect, adminOnly, holidayController.updateHoliday);
router.delete('/holidays/:id', protect, adminOnly, holidayController.deleteHoliday);

// --- Leave Routes ---
router.post('/leaves/', protect, upload.array('documents', 5), leaveController.createLeave);
router.get('/leaves/', protect, leaveController.getLeaves);
router.get('/leaves/generate-report', protect, adminOnly, leaveController.generateLeaveReport);
router.put('/leaves/:id', protect, leaveController.updateLeave);
router.delete('/leaves/:id', protect, leaveController.deleteLeave);

// --- Weekoff Routes ---
router.post('/weekoff/', protect, adminOnly, weekoffController.createWeekOff);
router.get('/weekoff/', protect, weekoffController.getWeekOffs);
router.put('/weekoff/:id', protect, adminOnly, weekoffController.updateWeekOff);
router.delete('/weekoff/:id', protect, adminOnly, weekoffController.deleteWeekOff);

// --- Company Weekoff Routes ---
router.post('/company-weekoff/', protect, adminOnly, companyWeekoffController.saveCompanyWeekOffs);
router.get('/company-weekoff/', protect, companyWeekoffController.getCompanyWeekOffs);

// --- Salary Structure (Batch Allocation) Routes ---
router.post('/batch-allocation/', protect, adminOnly, salaryStructureController.create);
router.get('/batch-allocation/', protect, adminOnly, salaryStructureController.getAll);
router.get('/batch-allocation/all-assigned-users', protect, adminOnly, salaryStructureController.getAllAssignedUsers);
router.get('/batch-allocation/:id/users', protect, adminOnly, salaryStructureController.getAssignedUsers);
router.post('/batch-allocation/:id/users', protect, adminOnly, salaryStructureController.assignUsers);
router.delete('/batch-allocation/:id/users/:userId', protect, adminOnly, salaryStructureController.removeUser);
router.get('/batch-allocation/:id/components', protect, adminOnly, salaryStructureController.getComponents);
router.post('/batch-allocation/:id/components', protect, adminOnly, salaryStructureController.assignComponents);
router.get('/batch-allocation/:id', protect, adminOnly, salaryStructureController.getById);
router.put('/batch-allocation/:id', protect, adminOnly, salaryStructureController.update);
router.delete('/batch-allocation/:id', protect, adminOnly, salaryStructureController.delete);

// --- Payroll Run Routes ---
router.post('/payroll-run/', protect, adminOnly, payrollRunController.create);
router.get('/payroll-run/', protect, adminOnly, payrollRunController.getAll);
router.get('/payroll-run/analytics', protect, adminOnly, payrollRunController.getAnalytics);
router.get('/payroll-run/generate-report', protect, adminOnly, payrollRunController.generateReport);
router.get('/payroll-run/my-payslips', protect, payrollRunController.getMyPayslips);
router.get('/payroll-run/holds', protect, adminOnly, payrollRunController.getHoldList);
router.post('/payroll-run/toggle-hold', protect, adminOnly, payrollRunController.toggleHold);
router.get('/payroll-run/payslip/:itemId/download', protect, payrollRunController.downloadPayslip);
router.get('/payroll-run/:id/employees', protect, adminOnly, payrollRunController.getPayrollEmployees);
router.put('/payroll-run/:id/status', protect, adminOnly, payrollRunController.updateStatus);
router.put('/payroll-run/:id', protect, adminOnly, payrollRunController.update);
router.delete('/payroll-run/:id', protect, adminOnly, payrollRunController.delete);
router.post('/payroll-run/:id/finalize', protect, adminOnly, payrollRunController.finalize);

// --- Asset Routes ---
router.get('/assets/categories', protect, assetController.getCategories);
router.post('/assets/categories', protect, adminOnly, assetController.addCategory);
router.delete('/assets/categories/:id', protect, adminOnly, assetController.deleteCategory);
router.post('/assets/requests', protect, assetController.requestAsset);
router.get('/assets/requests', protect, adminOnly, assetController.getAssetRequests);
router.get('/assets/requests/my', protect, assetController.getMyAssetRequests);
router.put('/assets/requests/:id/approve', protect, adminOnly, assetController.updateRequestStatus);
router.get('/assets/analytics', protect, adminOnly, assetController.getAssetAnalytics);
router.get('/assets/my-assets', protect, assetController.getMyAssets);
router.get('/assets/generate-report', protect, adminOnly, assetController.generateAssetReport);
router.get('/assets/', protect, assetController.getAssets);
router.post('/assets/', protect, adminOnly, upload.fields(assetUploadFields), assetController.createAsset);
router.put('/assets/:id', protect, adminOnly, upload.fields(assetUploadFields), assetController.updateAsset);
router.delete('/assets/:id', protect, adminOnly, assetController.deleteAsset);

// --- Reimbursement Routes ---
router.get('/reimbursements/', protect, reimbursementController.getReimbursements);
router.get('/reimbursements/categories', protect, reimbursementController.getReimbursementCategories);
router.post('/reimbursements/', protect, upload.single('receipt'), reimbursementController.createReimbursement);
router.put('/reimbursements/:id/status', protect, reimbursementController.updateClaimStatus);
router.delete('/reimbursements/:id', protect, reimbursementController.deleteClaim);

// --- Payroll Incentive (Addons) Routes ---
router.post('/incentives/', protect, adminOnly, incentiveController.create);
router.get('/incentives/', protect, adminOnly, incentiveController.getAll);
router.delete('/incentives/:id', protect, adminOnly, incentiveController.delete);

// --- Device Routes ---
router.get('/devices/', protect, adminOnly, deviceController.getAllDevices);
router.get('/devices/:id', protect, adminOnly, deviceController.getDeviceById);
router.post('/devices/', protect, adminOnly, deviceController.createDevice);
router.put('/devices/:id', protect, adminOnly, deviceController.updateDevice);
router.delete('/devices/:id', protect, adminOnly, deviceController.deleteDevice);

// --- Job Routes ---
router.get('/jobs/open-positions', protect, jobController.getOpenJobs);
router.get('/jobs/', protect, jobController.getJobs);
router.post('/jobs/', protect, adminOnly, jobController.createJob);
router.get('/jobs/:id', protect, jobController.getJobById);
router.put('/jobs/:id', protect, adminOnly, jobController.updateJob);
router.delete('/jobs/:id', protect, adminOnly, jobController.deleteJob);

// --- Applicant Routes ---
router.get('/applicants/', protect, adminOnly, applicantController.getApplicants);
router.get('/applicants/interviews/all', protect, adminOnly, applicantController.getInterviews);
router.post('/applicants/', protect, adminOnly, upload.single('resume'), applicantController.createApplicant);
router.get('/applicants/job/:jobId', protect, adminOnly, applicantController.getApplicantsByJob);
router.put('/applicants/:id/status', protect, adminOnly, applicantController.updateApplicantStatus);
router.post('/applicants/:id/schedule-interview', protect, adminOnly, applicantController.scheduleInterview);
router.post('/applicants/:id/send-offer', protect, adminOnly, applicantController.sendOfferLetter);
router.post('/applicants/:id/request-documents', protect, adminOnly, applicantController.requestDocuments);
router.delete('/applicants/:id', protect, adminOnly, applicantController.deleteApplicant);

// --- Advance Salary Routes ---
router.post('/advance-salary/', protect, advanceSalaryController.createAdvanceSalary);
router.get('/advance-salary/', protect, advanceSalaryController.getAdvanceSalaries);
router.get('/advance-salary/my-requests', protect, advanceSalaryController.getMyAdvanceSalaries);
router.put('/advance-salary/:id/status', protect, advanceSalaryController.updateAdvanceSalaryStatus);
router.delete('/advance-salary/:id', protect, advanceSalaryController.deleteAdvanceSalary);

// --- Salary Component Routes ---
router.post('/salary-components/', protect, adminOnly, salaryComponentController.create);
router.get('/salary-components/', protect, adminOnly, salaryComponentController.getAll);
router.post('/salary-components/bulk-order', protect, adminOnly, salaryComponentController.bulkUpdateOrder);
router.get('/salary-components/:id', protect, adminOnly, salaryComponentController.getById);
router.put('/salary-components/:id', protect, adminOnly, salaryComponentController.update);
router.delete('/salary-components/:id', protect, adminOnly, salaryComponentController.delete);

// --- Policy Routes ---
router.get('/policies/', protect, policyController.getPolicies);
router.post('/policies/', protect, adminOnly, upload.single('file'), policyController.createPolicy);
router.put('/policies/:id', protect, adminOnly, upload.single('file'), policyController.updatePolicy);
router.delete('/policies/:id', protect, adminOnly, policyController.deletePolicy);

// --- Statutory Compliance Routes ---
router.get('/statutory-compliance/pf', protect, adminOnly, statutoryComplianceController.getPF);
router.post('/statutory-compliance/pf', protect, adminOnly, statutoryComplianceController.createPF);
router.delete('/statutory-compliance/pf/:id', protect, adminOnly, statutoryComplianceController.deletePF);
router.get('/statutory-compliance/esi', protect, adminOnly, statutoryComplianceController.getESI);
router.post('/statutory-compliance/esi', protect, adminOnly, statutoryComplianceController.createESI);
router.delete('/statutory-compliance/esi/:id', protect, adminOnly, statutoryComplianceController.deleteESI);
router.get('/statutory-compliance/pt', protect, adminOnly, statutoryComplianceController.getPT);
router.post('/statutory-compliance/pt', protect, adminOnly, statutoryComplianceController.createPT);
router.delete('/statutory-compliance/pt/:id', protect, adminOnly, statutoryComplianceController.deletePT);
router.get('/statutory-compliance/tds', protect, adminOnly, statutoryComplianceController.getTDS);
router.post('/statutory-compliance/tds', protect, adminOnly, statutoryComplianceController.createTDS);
router.delete('/statutory-compliance/tds/:id', protect, adminOnly, statutoryComplianceController.deleteTDS);
router.get('/statutory-compliance/summary', protect, adminOnly, statutoryComplianceController.getSummaryStats);
router.get('/statutory-compliance/settings/pf', protect, adminOnly, complianceSettingsController.getPFSettings);
router.post('/statutory-compliance/settings/pf', protect, adminOnly, complianceSettingsController.updatePFSettings);
router.get('/statutory-compliance/settings/esi', protect, adminOnly, complianceSettingsController.getESISettings);
router.post('/statutory-compliance/settings/esi', protect, adminOnly, complianceSettingsController.updateESISettings);
router.get('/statutory-compliance/settings/pt', protect, adminOnly, complianceSettingsController.getPTSettings);
router.post('/statutory-compliance/settings/pt', protect, adminOnly, complianceSettingsController.updatePTSettings);
router.get('/statutory-compliance/settings/pt/states', protect, adminOnly, complianceSettingsController.getPTStates);
router.put('/statutory-compliance/settings/pt/states/:id', protect, adminOnly, complianceSettingsController.updatePTState);
router.get('/statutory-compliance/settings/lwf', protect, adminOnly, complianceSettingsController.getLWFSettings);
router.post('/statutory-compliance/settings/lwf', protect, adminOnly, complianceSettingsController.updateLWFSettings);
router.get('/statutory-compliance/settings/lwf/states', protect, adminOnly, complianceSettingsController.getLWFStates);
router.put('/statutory-compliance/settings/lwf/states/:id', protect, adminOnly, complianceSettingsController.updateLWFState);
router.get('/statutory-compliance/settings/tds', protect, adminOnly, complianceSettingsController.getTDSSettings);
router.post('/statutory-compliance/settings/tds', protect, adminOnly, complianceSettingsController.updateTDSSettings);

// --- Salary Formula Routes ---
router.post('/salary-formulas/', protect, adminOnly, salaryFormulaController.create);
router.get('/salary-formulas/', protect, adminOnly, salaryFormulaController.getAll);
router.get('/salary-formulas/:id', protect, adminOnly, salaryFormulaController.getById);
router.put('/salary-formulas/:id', protect, adminOnly, salaryFormulaController.update);
router.delete('/salary-formulas/:id', protect, adminOnly, salaryFormulaController.delete);
router.post('/salary-formulas/validate', protect, adminOnly, salaryFormulaController.validate);

// --- Role Permission Routes ---
router.get('/role-permissions/', protect, adminOnly, rolePermissionController.getAllRolePermissions);
router.post('/role-permissions/', protect, superAdminOnly, rolePermissionController.updateRolePermissions);
router.get('/role-permissions/:role', protect, adminOnly, rolePermissionController.getRolePermissions);
router.delete('/role-permissions/:role', protect, superAdminOnly, rolePermissionController.deleteRoleFull);

// --- Notification Routes ---
router.get('/notifications/my', protect, notificationController.getMyNotifications);
router.patch('/notifications/:id/read', protect, notificationController.markRead);
router.patch('/notifications/read-all', protect, notificationController.markAllRead);

// --- Helpdesk Routes ---
router.get('/helpdesk', protect, helpdeskController.getTickets);
router.get('/helpdesk/stats', protect, adminOnly, helpdeskController.getStats);
router.post('/helpdesk', protect, helpdeskController.createTicket);
router.put('/helpdesk/:id/status', protect, helpdeskController.updateTicketStatus);
router.patch('/helpdesk/:id/status', protect, helpdeskController.updateTicketStatus);
router.put('/helpdesk/:id/assign', protect, adminOnly, helpdeskController.assignTicket);
router.patch('/helpdesk/:id/assign', protect, adminOnly, helpdeskController.assignTicket);
router.delete('/helpdesk/:id', protect, adminOnly, helpdeskController.deleteTicket);

module.exports = router;
