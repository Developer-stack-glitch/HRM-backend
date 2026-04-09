const express = require('express');
const router = express.Router();

// --- Middlewares ---
const { protect, superAdminOnly } = require('../middleware/authMiddleware');
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
router.post('/auth/login', authController.loginUser);
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/verify-otp', authController.verifyOtp);
router.post('/auth/reset-password', authController.resetPassword);

// --- User Routes ---
router.get('/users/me', protect, userController.getProfile);
router.post('/users/', protect, upload.fields(documentFields), userController.createUser);
router.get('/users/milestones', protect, userController.getMilestones);
router.get('/users/user-attendance', protect, userController.getUserAttendance);
router.get('/users/bulk-template', protect, userController.downloadBulkTemplate);
router.get('/users/reference-ids', protect, userController.downloadReferenceIds);
router.post('/users/bulk-upload', protect, upload.single('file'), userController.bulkUploadUsers);
router.get('/users/', protect, userController.getUsers);
router.get('/users/:id', protect, userController.getUserById);
router.put('/users/:id', protect, upload.fields(documentFields), userController.updateUser);
router.delete('/users/:id', protect, userController.deleteUser);

// --- Organization Routes ---
router.post('/organization/companies', protect, superAdminOnly, upload.fields([{ name: 'logo', maxCount: 1 }]), orgController.createCompany);
router.put('/organization/companies/:id', protect, superAdminOnly, upload.fields([{ name: 'logo', maxCount: 1 }]), orgController.updateCompany);
router.delete('/organization/companies/:id', protect, superAdminOnly, orgController.deleteCompany);
router.get('/organization/companies', protect, superAdminOnly, orgController.getCompanies);
router.get('/organization/companies/:id', protect, superAdminOnly, orgController.getCompanyById);
router.post('/organization/companies/setup-database', protect, superAdminOnly, orgController.setupCompanyDatabase);
router.post('/organization/branches', orgController.createBranch);
router.get('/organization/branches', orgController.getBranches);
router.post('/organization/designations', orgController.createDesignation);
router.get('/organization/designations', orgController.getDesignations);
router.post('/organization/shifts', orgController.createShift);
router.get('/organization/shifts', orgController.getShifts);
router.post('/organization/departments', orgController.createDepartment);
router.get('/organization/departments', protect, orgController.getDepartments);
router.get('/organization/employment-types', protect, orgController.getEmploymentTypes);
router.get('/organization/work-locations', protect, orgController.getWorkLocations);
router.get('/organization/metadata', protect, orgController.getMetadata);

// --- Attendance Routes ---
router.post('/attendance/', protect, attendanceController.saveAttendance);
router.get('/attendance/', protect, attendanceController.getAttendance);
router.get('/attendance/generate-report', protect, attendanceController.generateAttendanceReport);
router.get('/attendance/today-status/:userId', protect, attendanceController.getTodayStatus);
router.post('/attendance/web-clock-in', protect, attendanceController.webClockIn);
router.post('/attendance/web-clock-out', protect, attendanceController.webClockOut);
router.post('/attendance/start-break', protect, attendanceController.startBreak);
router.post('/attendance/end-break', protect, attendanceController.endBreak);
router.get('/attendance/biometric-logs', protect, attendanceController.previewBiometricLogs);
router.post('/attendance/sync', protect, attendanceController.syncBiometricLogs);
router.put('/attendance/:id', protect, attendanceController.updateAttendance);
router.delete('/attendance/:id', protect, attendanceController.deleteAttendance);
router.get('/attendance/policy-rules', protect, attendancePolicyController.getAllRules);
router.post('/attendance/policy-rules', protect, attendancePolicyController.createRule);
router.put('/attendance/policy-rules/:id', protect, attendancePolicyController.updateRule);
router.delete('/attendance/policy-rules/:id', protect, attendancePolicyController.deleteRule);
router.get('/attendance/company-policy/:companyId', protect, companyPolicyController.getCompanyPolicy);
router.post('/attendance/company-policy', protect, companyPolicyController.saveCompanyPolicy);

// --- Holiday Routes ---
router.get('/holidays/', protect, holidayController.getHolidays);
router.post('/holidays/', protect, holidayController.createHoliday);
router.put('/holidays/:id', protect, holidayController.updateHoliday);
router.delete('/holidays/:id', protect, holidayController.deleteHoliday);

// --- Leave Routes ---
router.post('/leaves/', protect, leaveController.createLeave);
router.get('/leaves/', protect, leaveController.getLeaves);
router.get('/leaves/generate-report', protect, leaveController.generateLeaveReport);
router.put('/leaves/:id', protect, leaveController.updateLeave);
router.delete('/leaves/:id', protect, leaveController.deleteLeave);

// --- Weekoff Routes ---
router.post('/weekoff/', protect, weekoffController.createWeekOff);
router.get('/weekoff/', protect, weekoffController.getWeekOffs);
router.put('/weekoff/:id', protect, weekoffController.updateWeekOff);
router.delete('/weekoff/:id', protect, weekoffController.deleteWeekOff);

// --- Company Weekoff Routes ---
router.post('/company-weekoff/', protect, companyWeekoffController.saveCompanyWeekOffs);
router.get('/company-weekoff/', protect, companyWeekoffController.getCompanyWeekOffs);

// --- Salary Structure (Batch Allocation) Routes ---
router.post('/batch-allocation/', salaryStructureController.create);
router.get('/batch-allocation/', salaryStructureController.getAll);
router.get('/batch-allocation/all-assigned-users', salaryStructureController.getAllAssignedUsers);
router.get('/batch-allocation/:id/users', salaryStructureController.getAssignedUsers);
router.post('/batch-allocation/:id/users', salaryStructureController.assignUsers);
router.delete('/batch-allocation/:id/users/:userId', salaryStructureController.removeUser);
router.get('/batch-allocation/:id/components', salaryStructureController.getComponents);
router.post('/batch-allocation/:id/components', salaryStructureController.assignComponents);
router.get('/batch-allocation/:id', salaryStructureController.getById);
router.put('/batch-allocation/:id', salaryStructureController.update);
router.delete('/batch-allocation/:id', salaryStructureController.delete);

// --- Payroll Run Routes ---
router.post('/payroll-run/', protect, payrollRunController.create);
router.get('/payroll-run/', protect, payrollRunController.getAll);
router.get('/payroll-run/analytics', protect, payrollRunController.getAnalytics);
router.get('/payroll-run/generate-report', protect, payrollRunController.generateReport);
router.get('/payroll-run/my-payslips', protect, payrollRunController.getMyPayslips);
router.get('/payroll-run/holds', protect, payrollRunController.getHoldList);
router.post('/payroll-run/toggle-hold', protect, payrollRunController.toggleHold);
router.get('/payroll-run/payslip/:itemId/download', protect, payrollRunController.downloadPayslip);
router.get('/payroll-run/:id/employees', protect, payrollRunController.getPayrollEmployees);
router.put('/payroll-run/:id/status', protect, payrollRunController.updateStatus);
router.put('/payroll-run/:id', protect, payrollRunController.update);
router.post('/payroll-run/:id/finalize', protect, payrollRunController.finalize);

// --- Asset Routes ---
router.get('/assets/categories', assetController.getCategories);
router.post('/assets/categories', assetController.addCategory);
router.delete('/assets/categories/:id', assetController.deleteCategory);
router.post('/assets/requests', protect, assetController.requestAsset);
router.get('/assets/requests', protect, assetController.getAssetRequests);
router.get('/assets/requests/my', protect, assetController.getMyAssetRequests);
router.put('/assets/requests/:id/approve', protect, assetController.updateRequestStatus);
router.get('/assets/analytics', protect, assetController.getAssetAnalytics);
router.get('/assets/my-assets', protect, assetController.getMyAssets);
router.get('/assets/generate-report', protect, assetController.generateAssetReport);
router.get('/assets/', assetController.getAssets);
router.post('/assets/', protect, upload.fields(assetUploadFields), assetController.createAsset);
router.put('/assets/:id', protect, upload.fields(assetUploadFields), assetController.updateAsset);
router.delete('/assets/:id', protect, assetController.deleteAsset);

// --- Reimbursement Routes ---
router.get('/reimbursements/', protect, reimbursementController.getReimbursements);
router.get('/reimbursements/categories', protect, reimbursementController.getReimbursementCategories);
router.post('/reimbursements/', protect, upload.single('receipt'), reimbursementController.createReimbursement);
router.put('/reimbursements/:id/status', protect, reimbursementController.updateClaimStatus);
router.delete('/reimbursements/:id', protect, reimbursementController.deleteClaim);

// --- Device Routes ---
router.get('/devices/', deviceController.getAllDevices);
router.get('/devices/:id', deviceController.getDeviceById);
router.post('/devices/', deviceController.createDevice);
router.put('/devices/:id', deviceController.updateDevice);
router.delete('/devices/:id', deviceController.deleteDevice);

// --- Job Routes ---
router.get('/jobs/open-positions', protect, jobController.getOpenJobs);
router.get('/jobs/', jobController.getJobs);
router.post('/jobs/', jobController.createJob);
router.get('/jobs/:id', jobController.getJobById);
router.put('/jobs/:id', jobController.updateJob);
router.delete('/jobs/:id', jobController.deleteJob);

// --- Applicant Routes ---
router.get('/applicants/', applicantController.getApplicants);
router.post('/applicants/', upload.single('resume'), applicantController.createApplicant);
router.get('/applicants/job/:jobId', applicantController.getApplicantsByJob);
router.put('/applicants/:id/status', applicantController.updateApplicantStatus);
router.post('/applicants/:id/schedule-interview', applicantController.scheduleInterview);
router.post('/applicants/:id/send-offer', applicantController.sendOfferLetter);
router.post('/applicants/:id/request-documents', applicantController.requestDocuments);
router.delete('/applicants/:id', applicantController.deleteApplicant);

// --- Advance Salary Routes ---
router.post('/advance-salary/', protect, advanceSalaryController.createAdvanceSalary);
router.get('/advance-salary/', protect, advanceSalaryController.getAdvanceSalaries);
router.get('/advance-salary/my-requests', protect, advanceSalaryController.getMyAdvanceSalaries);
router.put('/advance-salary/:id/status', protect, advanceSalaryController.updateAdvanceSalaryStatus);
router.delete('/advance-salary/:id', protect, advanceSalaryController.deleteAdvanceSalary);

// --- Salary Component Routes ---
router.post('/salary-components/', salaryComponentController.create);
router.get('/salary-components/', salaryComponentController.getAll);
router.post('/salary-components/bulk-order', salaryComponentController.bulkUpdateOrder);
router.get('/salary-components/:id', salaryComponentController.getById);
router.put('/salary-components/:id', salaryComponentController.update);
router.delete('/salary-components/:id', salaryComponentController.delete);

// --- Policy Routes ---
router.get('/policies/', protect, policyController.getPolicies);
router.post('/policies/', protect, upload.single('file'), policyController.createPolicy);
router.put('/policies/:id', protect, upload.single('file'), policyController.updatePolicy);
router.delete('/policies/:id', protect, policyController.deletePolicy);

// --- Statutory Compliance Routes ---
router.get('/statutory-compliance/pf', statutoryComplianceController.getPF);
router.post('/statutory-compliance/pf', statutoryComplianceController.createPF);
router.delete('/statutory-compliance/pf/:id', statutoryComplianceController.deletePF);
router.get('/statutory-compliance/esi', statutoryComplianceController.getESI);
router.post('/statutory-compliance/esi', statutoryComplianceController.createESI);
router.delete('/statutory-compliance/esi/:id', statutoryComplianceController.deleteESI);
router.get('/statutory-compliance/pt', statutoryComplianceController.getPT);
router.post('/statutory-compliance/pt', statutoryComplianceController.createPT);
router.delete('/statutory-compliance/pt/:id', statutoryComplianceController.deletePT);
router.get('/statutory-compliance/tds', statutoryComplianceController.getTDS);
router.post('/statutory-compliance/tds', statutoryComplianceController.createTDS);
router.delete('/statutory-compliance/tds/:id', statutoryComplianceController.deleteTDS);
router.get('/statutory-compliance/summary', statutoryComplianceController.getSummaryStats);
router.get('/statutory-compliance/settings/pf', complianceSettingsController.getPFSettings);
router.post('/statutory-compliance/settings/pf', complianceSettingsController.updatePFSettings);
router.get('/statutory-compliance/settings/esi', complianceSettingsController.getESISettings);
router.post('/statutory-compliance/settings/esi', complianceSettingsController.updateESISettings);
router.get('/statutory-compliance/settings/pt', complianceSettingsController.getPTSettings);
router.post('/statutory-compliance/settings/pt', complianceSettingsController.updatePTSettings);
router.get('/statutory-compliance/settings/pt/states', complianceSettingsController.getPTStates);
router.put('/statutory-compliance/settings/pt/states/:id', complianceSettingsController.updatePTState);
router.get('/statutory-compliance/settings/lwf', complianceSettingsController.getLWFSettings);
router.post('/statutory-compliance/settings/lwf', complianceSettingsController.updateLWFSettings);
router.get('/statutory-compliance/settings/lwf/states', complianceSettingsController.getLWFStates);
router.put('/statutory-compliance/settings/lwf/states/:id', complianceSettingsController.updateLWFState);
router.get('/statutory-compliance/settings/tds', complianceSettingsController.getTDSSettings);
router.post('/statutory-compliance/settings/tds', complianceSettingsController.updateTDSSettings);

// --- Salary Formula Routes ---
router.post('/salary-formulas/', salaryFormulaController.create);
router.get('/salary-formulas/', salaryFormulaController.getAll);
router.get('/salary-formulas/:id', salaryFormulaController.getById);
router.put('/salary-formulas/:id', salaryFormulaController.update);
router.delete('/salary-formulas/:id', salaryFormulaController.delete);
router.post('/salary-formulas/validate', salaryFormulaController.validate);

// --- Role Permission Routes ---
router.get('/role-permissions/', rolePermissionController.getAllRolePermissions);
router.post('/role-permissions/', rolePermissionController.updateRolePermissions);
router.get('/role-permissions/:role', rolePermissionController.getRolePermissions);
router.delete('/role-permissions/:role', rolePermissionController.deleteRoleFull);

// --- Notification Routes ---
router.get('/notifications/my', protect, notificationController.getMyNotifications);
router.patch('/notifications/:id/read', protect, notificationController.markRead);
router.patch('/notifications/read-all', protect, notificationController.markAllRead);

module.exports = router;
