const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool } = require('../Config/dbConfig');
const ExcelJS = require('exceljs');
const fs = require('fs');

// Master Permission Catalog with Human-Readable Labels, Categories, and Descriptions
const PERMISSION_CATALOG = [
    // 1. DASHBOARD
    {
        key: 'dashboard',
        category: 'Dashboard & Executive View',
        module: 'Dashboard',
        feature: 'Main Executive Dashboard',
        description: 'Access primary dashboard with company announcements, key metrics, quick attendance & leave stats'
    },
    // 2. EMPLOYEE MANAGEMENT
    {
        key: 'employees',
        category: 'Employee Management',
        module: 'Employees',
        feature: 'Employee Directory & Core Module',
        description: 'Master access to employee administration module'
    },
    {
        key: 'employees_list',
        category: 'Employee Management',
        module: 'Employees',
        feature: 'View Employee Directory',
        description: 'Browse, view, and search comprehensive staff profiles and contact lists'
    },
    {
        key: 'employees_add',
        category: 'Employee Management',
        module: 'Employees',
        feature: 'Add / Register New Employee',
        description: 'Create, onboard, and register new employee accounts into the HRM database'
    },
    {
        key: 'employees_id_card',
        category: 'Employee Management',
        module: 'Employees',
        feature: 'Generate & Print ID Cards',
        description: 'Generate, preview, and print official company identification cards'
    },
    {
        key: 'employees_credentials',
        category: 'Employee Management',
        module: 'Employees',
        feature: 'Employee Credentials & Access',
        description: 'Manage staff system login passwords, credentials reset, and web access permissions'
    },
    {
        key: 'employees_permissions',
        category: 'Employee Management',
        module: 'Employees',
        feature: 'Role Permissions Management',
        description: 'Configure and assign role-based access control and module authorizations'
    },
    // 3. ORGANIZATION & SETUP
    {
        key: 'organization',
        category: 'Organization & Hierarchy',
        module: 'Organization',
        feature: 'Organization Settings',
        description: 'Master access to organizational setup and structural configurations'
    },
    {
        key: 'organization_company',
        category: 'Organization & Hierarchy',
        module: 'Organization',
        feature: 'Company Profile & Registration',
        description: 'Manage corporate entities, addresses, tax registration, and legal branding'
    },
    {
        key: 'organization_databases',
        category: 'Organization & Hierarchy',
        module: 'Organization',
        feature: 'Tenant Database Management',
        description: 'Manage multi-tenant database pools and company data separation'
    },
    {
        key: 'organization_branches',
        category: 'Organization & Hierarchy',
        module: 'Organization',
        feature: 'Branch Office Management',
        description: 'Create, edit, and configure company office branch locations'
    },
    {
        key: 'organization_departments',
        category: 'Organization & Hierarchy',
        module: 'Organization',
        feature: 'Department Management',
        description: 'Define and organize functional business units and departments'
    },
    {
        key: 'organization_designations',
        category: 'Organization & Hierarchy',
        module: 'Organization',
        feature: 'Designation & Job Title Setup',
        description: 'Manage employee hierarchical job titles and position rankings'
    },
    {
        key: 'organization_shifts',
        category: 'Organization & Hierarchy',
        module: 'Organization',
        feature: 'Shift Rosters & Timings',
        description: 'Configure daily shifts, standard work hours, and punch-in grace boundaries'
    },
    {
        key: 'organization_roles',
        category: 'Organization & Hierarchy',
        module: 'Organization',
        feature: 'Custom User Roles',
        description: 'Create, edit, and customize operational roles across the enterprise'
    },
    // 4. PAYROLL & COMPENSATION
    {
        key: 'payroll',
        category: 'Payroll & Compensation',
        module: 'Payroll',
        feature: 'Payroll Processing Module',
        description: 'Master access to payroll runs, salary calculations, and disbursement tracking'
    },
    {
        key: 'payroll_dashboard',
        category: 'Payroll & Compensation',
        module: 'Payroll',
        feature: 'Payroll Analytics Dashboard',
        description: 'View monthly payroll expenses, payout trends, deduction summaries, and net CTC'
    },
    {
        key: 'payroll_structure',
        category: 'Payroll & Compensation',
        module: 'Payroll',
        feature: 'Salary Structure Configuration',
        description: 'Define salary bands (Basic, HRA, Conveyance, Special Allowance, PF, ESI, etc.)'
    },
    {
        key: 'payroll_components',
        category: 'Payroll & Compensation',
        module: 'Payroll',
        feature: 'Salary Components Management',
        description: 'Configure recurring allowance heads, taxable allowances, and deduction policies'
    },
    {
        key: 'payroll_formulas',
        category: 'Payroll & Compensation',
        module: 'Payroll',
        feature: 'Salary Calculation Formulas',
        description: 'Create and edit mathematical computation rules for automated payroll processing'
    },
    {
        key: 'payroll_templates',
        category: 'Payroll & Compensation',
        module: 'Payroll',
        feature: 'Payslip Template Builder',
        description: 'Design and customize visual PDF templates for employee salary slips'
    },
    {
        key: 'payroll_payslips',
        category: 'Payroll & Compensation',
        module: 'Payroll',
        feature: 'Self-Service Payslip Access',
        description: 'View and download personal monthly salary payslips'
    },
    {
        key: 'payroll_advance_salary',
        category: 'Payroll & Compensation',
        module: 'Payroll',
        feature: 'Advance Salary Management',
        description: 'Apply for or approve advance salary requests and automated monthly recovery'
    },
    // 5. REIMBURSEMENTS
    {
        key: 'reimbursements',
        category: 'Expense Reimbursements',
        module: 'Reimbursements',
        feature: 'Expense Claims & Approvals',
        description: 'Submit, review, verify, and approve official business travel and operational expense claims'
    },
    // 6. ATTENDANCE & TIME TRACKING
    {
        key: 'attendance',
        category: 'Attendance & Time Tracking',
        module: 'Attendance',
        feature: 'Attendance Tracking Module',
        description: 'Master access to employee attendance, timesheets, and daily logging'
    },
    {
        key: 'attendance_shift',
        category: 'Attendance & Time Tracking',
        module: 'Attendance',
        feature: 'Shift Roster & Assignment',
        description: 'Assign and manage rotational shifts, daily staff schedules, and shift changes'
    },
    {
        key: 'attendance_biometric',
        category: 'Attendance & Time Tracking',
        module: 'Attendance',
        feature: 'Biometric Punch Logs',
        description: 'View, verify, and monitor hardware biometric fingerprint / face punch records'
    },
    {
        key: 'attendance_weekoff',
        category: 'Attendance & Time Tracking',
        module: 'Attendance',
        feature: 'Weekly Off Management',
        description: 'Configure standard company weekly off days and rotational employee rest cycles'
    },
    {
        key: 'attendance_calendar',
        category: 'Attendance & Time Tracking',
        module: 'Attendance',
        feature: 'Attendance Calendar View',
        description: 'Visual month-view calendar showing working days, presents, absents, and holidays'
    },
    {
        key: 'attendance_rules',
        category: 'Attendance & Time Tracking',
        module: 'Attendance',
        feature: 'Attendance Rules & Penalties',
        description: 'Configure late-arrival grace minutes, early departure cuts, and half-day deduct rules'
    },
    {
        key: 'attendance_policy',
        category: 'Attendance & Time Tracking',
        module: 'Attendance',
        feature: 'Company Attendance Policy',
        description: 'Establish standard working hour quotas, break rules, and compliance criteria'
    },
    {
        key: 'attendance_devices',
        category: 'Attendance & Time Tracking',
        module: 'Attendance',
        feature: 'Biometric Hardware Integration',
        description: 'Register and monitor biometric IoT device IPs, communication ports, and connection status'
    },
    // 7. LEAVES & HOLIDAYS
    {
        key: 'leaves',
        category: 'Leaves & Holidays',
        module: 'Leaves',
        feature: 'Leave Management Module',
        description: 'Master access to employee leave policies, quotas, and applications'
    },
    {
        key: 'leaves_manage',
        category: 'Leaves & Holidays',
        module: 'Leaves',
        feature: 'Leave Approval & Administration',
        description: 'Review, approve, reject, or adjust employee leave applications and balances'
    },
    {
        key: 'leaves_list',
        category: 'Leaves & Holidays',
        module: 'Leaves',
        feature: 'Leave History & Balances',
        description: 'View organization-wide leave consumption history and available leave quotas'
    },
    {
        key: 'leaves_apply',
        category: 'Leaves & Holidays',
        module: 'Leaves',
        feature: 'Apply for Leave (Self-Service)',
        description: 'Submit leave applications for Casual Leave, Sick Leave, Earned Leave, or Unpaid Leave'
    },
    {
        key: 'leaves_holiday',
        category: 'Leaves & Holidays',
        module: 'Leaves',
        feature: 'Holiday List & Calendar',
        description: 'Configure and publish annual list of mandatory and optional public holidays'
    },
    // 8. POLICIES & ASSETS
    {
        key: 'company_policies',
        category: 'Policies & Assets',
        module: 'Company Policies',
        feature: 'Company Policy Repository',
        description: 'Publish, view, and acknowledge corporate standard operating procedures and code of conduct'
    },
    {
        key: 'company-policies',
        category: 'Policies & Assets',
        module: 'Company Policies',
        feature: 'Company Policy Access (Legacy)',
        description: 'Legacy endpoint for viewing corporate policy documents'
    },
    {
        key: 'asset_management',
        category: 'Policies & Assets',
        module: 'Asset Management',
        feature: 'Hardware & Asset Tracking',
        description: 'Track IT inventory, laptop serials, office equipment allocation, and return handovers'
    },
    {
        key: 'asset-management',
        category: 'Policies & Assets',
        module: 'Asset Management',
        feature: 'Asset Management (Legacy)',
        description: 'Legacy endpoint for corporate asset tracking'
    },
    // 9. RECRUITMENT & HIRING
    {
        key: 'jobs_recruitment',
        category: 'Recruitment & ATS',
        module: 'Recruitment',
        feature: 'Jobs & Recruitment Module',
        description: 'Master access to applicant tracking system (ATS) and recruitment pipeline'
    },
    {
        key: 'jobs-recruitment',
        category: 'Recruitment & ATS',
        module: 'Recruitment',
        feature: 'Jobs & Recruitment (Legacy)',
        description: 'Legacy endpoint for hiring workflows'
    },
    {
        key: 'jobs_recruitment_overview',
        category: 'Recruitment & ATS',
        module: 'Recruitment',
        feature: 'Recruitment Pipeline Overview',
        description: 'Analytics on active job requisitions, candidate stages, and hiring velocity'
    },
    {
        key: 'jobs_recruitment_board',
        category: 'Recruitment & ATS',
        module: 'Recruitment',
        feature: 'Job Board & Vacancy Postings',
        description: 'Create, publish, and manage job openings on external careers pages and portals'
    },
    {
        key: 'jobs_recruitment_applicants',
        category: 'Recruitment & ATS',
        module: 'Recruitment',
        feature: 'Candidate Pipeline & Resumes',
        description: 'Review resumes, shortlist candidates, record interview feedback, and release offer letters'
    },
    // 10. ANALYTICS & REPORTS
    {
        key: 'reports',
        category: 'Analytics & Reports',
        module: 'Reports Hub',
        feature: 'Reports & Analytics Center',
        description: 'Master access to business intelligence, audit trails, and reporting dashboards'
    },
    {
        key: 'reports_attendance',
        category: 'Analytics & Reports',
        module: 'Reports Hub',
        feature: 'Attendance & Punctuality Reports',
        description: 'Generate monthly muster rolls, late-in / early-out summaries, and overtime reports'
    },
    {
        key: 'reports_reimbursements',
        category: 'Analytics & Reports',
        module: 'Reports Hub',
        feature: 'Expense Reimbursement Reports',
        description: 'Export expense claim audits, department-level spend analysis, and disbursement logs'
    },
    {
        key: 'reports_leave',
        category: 'Analytics & Reports',
        module: 'Reports Hub',
        feature: 'Leave Utilization & LOP Reports',
        description: 'Export employee leave consumption logs, balance summaries, and Loss of Pay (LOP) registers'
    },
    {
        key: 'reports_asset',
        category: 'Analytics & Reports',
        module: 'Reports Hub',
        feature: 'Asset Assignment Reports',
        description: 'Generate IT hardware allocation logs, maintenance records, and warranty audit sheets'
    },
    {
        key: 'reports_payroll',
        category: 'Analytics & Reports',
        module: 'Reports Hub',
        feature: 'Payroll Register & CTC Reports',
        description: 'Export complete monthly salary registers, bank disbursement advice, and statutory compliance files'
    }
];

async function generateExcel() {
    console.log('Fetching database records...');
    
    // 1. Fetch Users
    const [users] = await pool.query(`
        SELECT 
            u.id, u.emp_id, u.employee_name, u.name as username, u.email, u.role, u.biometric_id,
            COALESCE(c.name, 'ACTE Technologies Private Limited') as company_name,
            COALESCE(d.name, 'Not Assigned') as department_name,
            COALESCE(des.name, 'Not Assigned') as designation_name,
            COALESCE(b.name, 'Headquarters') as branch_name,
            COALESCE(wl.name, 'On-site') as work_location_name,
            COALESCE(et.name, 'Permanent') as employment_type_name,
            s.name as shift_name,
            s.start_time as shift_start,
            s.end_time as shift_end,
            rm.employee_name as reporting_manager_name,
            u.team_lead, u.is_experienced,
            u.doj, u.dor, u.duration,
            u.gender, u.dob, u.blood_group, u.mother_tongue,
            u.off_contact_no, u.off_mail_id,
            u.per_contact_no, u.per_mail_id,
            u.father_spouse_name, u.father_spouse_contact,
            u.mother_name, u.mother_contact,
            u.temp_address, u.perm_address,
            u.bank_ac_no, u.ifsc,
            u.aadhar, u.pan, u.uan, u.pf, u.esi,
            u.year_gross_salary, u.variable, u.travel_allowance,
            u.employer_epfo, u.epf, u.pt,
            u.last_increment, u.increment_type, u.upcoming_increment,
            u.web_clock_in_allowed,
            u.created_at
        FROM users u
        LEFT JOIN companies c ON u.company = c.id
        LEFT JOIN departments d ON u.department = d.id
        LEFT JOIN designations des ON u.designation = des.id
        LEFT JOIN branches b ON u.branch = b.id
        LEFT JOIN work_locations wl ON u.work_location = wl.id
        LEFT JOIN employment_types et ON u.employment_type = et.id
        LEFT JOIN shifts s ON u.shift = s.id
        LEFT JOIN users rm ON u.reporting_manager = rm.id
        ORDER BY 
            CASE 
                WHEN u.role = 'superadmin' THEN 1 
                WHEN u.role = 'admin' THEN 2 
                ELSE 3 
            END,
            u.id ASC
    `);

    // 2. Fetch Role Permissions
    const [rpRows] = await pool.query('SELECT * FROM role_permissions');
    const rolePermissionsMap = {};
    for (const row of rpRows) {
        let perms = row.permissions;
        if (typeof perms === 'string') {
            try { perms = JSON.parse(perms); } catch (e) { perms = []; }
        }
        rolePermissionsMap[row.role.toLowerCase()] = new Set(perms || []);
    }

    console.log(`Loaded ${users.length} employees and ${Object.keys(rolePermissionsMap).length} roles from database.`);

    // Helper functions
    const calculateShiftHours = (start, end) => {
        if (!start || !end) return "N/A";
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60;
        return (diff / 60).toFixed(1) + " hrs";
    };

    const getRoleLevelDescription = (role) => {
        const r = (role || '').toLowerCase();
        if (r === 'superadmin') return 'Super Administrator (Full System Control)';
        if (r === 'admin') return 'System Administrator (HR & Org Management)';
        return 'Standard Employee (Self-Service & Basic Operations)';
    };

    const getRoleModulesSummary = (role) => {
        const r = (role || '').toLowerCase();
        if (r === 'superadmin') return 'All Modules (Full Control, DB, Roles, Organization, Payroll, Attendance, Leaves, ATS)';
        if (r === 'admin') return 'Organization, Employees, Payroll, Attendance, Leaves, Reimbursements, Assets, Jobs, Reports';
        return 'Dashboard, Attendance Logs, Leave Application, Payslips, Advance Salary, Reimbursements';
    };

    // Initialize Excel Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HRM Enterprise System';
    workbook.lastModifiedBy = 'HRM Enterprise System';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Palette Colors
    const COLORS = {
        NAVY_DARK: 'FF0F172A',
        NAVY_HEADER: 'FF1E3A8A',
        NAVY_MEDIUM: 'FF1E40AF',
        WHITE: 'FFFFFFFF',
        ZEBRA: 'FFF8FAFC',
        BORDER_GRAY: 'FFE2E8F0',
        BORDER_DARK: 'FF94A3B8',
        TEXT_DARK: 'FF0F172A',
        TEXT_MUTED: 'FF64748B',
        // Group Headers
        GRP_BASIC: 'FFE2E8F0',
        GRP_ORG: 'FFDBEAFE',
        GRP_CONTACT: 'FFE0F2FE',
        GRP_PERSONAL: 'FFFCE7F3',
        GRP_STATUTORY: 'FFFEF3C7',
        GRP_BANK: 'FFD1FAE5',
        GRP_COMP: 'FFF3E8FF',
        GRP_PERM: 'FFFEE2E2',
        // Badges
        BADGE_YES_BG: 'FFDCFCE7',
        BADGE_YES_TXT: 'FF15803D',
        BADGE_NO_BG: 'FFF1F5F9',
        BADGE_NO_TXT: 'FF94A3B8',
        BADGE_ADMIN_BG: 'FFDBEAFE',
        BADGE_ADMIN_TXT: 'FF1E40AF',
        BADGE_SUPER_BG: 'FFFEE2E2',
        BADGE_SUPER_TXT: 'FF991B1B',
        BADGE_EMP_BG: 'FFE0E7FF',
        BADGE_EMP_TXT: 'FF3730A3',
    };

    // Default borders
    const thinBorder = {
        top: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
        bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
        left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
        right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };

    // ==========================================
    // SHEET 1: EXECUTIVE SUMMARY & DASHBOARD
    // ==========================================
    console.log('Building Sheet 1: Executive Summary...');
    const wsSummary = workbook.addWorksheet('📊 Executive Summary', {
        properties: { tabColor: { argb: 'FF1E3A8A' } },
        views: [{ showGridLines: true }]
    });

    // Title Banner
    wsSummary.mergeCells('B2:K3');
    const titleCell = wsSummary.getCell('B2');
    titleCell.value = 'HRM ENTERPRISE - WORKFORCE & PERMISSIONS REPORT';
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: COLORS.WHITE } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    wsSummary.mergeCells('B4:K4');
    const subCell = wsSummary.getCell('B4');
    subCell.value = `Export Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} | Organization: ACTE Technologies Private Limited | Database Status: Connected Live`;
    subCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: COLORS.TEXT_MUTED } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // KPI Cards Row
    const kpiData = [
        { label: 'TOTAL EMPLOYEES', val: users.length, color: 'FF1E40AF', startCol: 2, endCol: 3 },
        { label: 'ADMINISTRATORS', val: users.filter(u => u.role === 'admin').length, color: 'FF0D9488', startCol: 4, endCol: 5 },
        { label: 'STANDARD STAFF', val: users.filter(u => u.role === 'employee').length, color: 'FF4F46E5', startCol: 6, endCol: 7 },
        { label: 'SUPER ADMINS', val: users.filter(u => u.role === 'superadmin').length, color: 'FFDC2626', startCol: 8, endCol: 9 },
        { label: 'TOTAL DEPARTMENTS', val: new Set(users.map(u => u.department_name)).size, color: 'FF059669', startCol: 10, endCol: 11 }
    ];

    kpiData.forEach(kpi => {
        wsSummary.mergeCells(6, kpi.startCol, 6, kpi.endCol);
        const lCell = wsSummary.getCell(6, kpi.startCol);
        lCell.value = kpi.label;
        lCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.TEXT_MUTED } };
        lCell.alignment = { horizontal: 'center', vertical: 'middle' };

        wsSummary.mergeCells(7, kpi.startCol, 7, kpi.endCol);
        const vCell = wsSummary.getCell(7, kpi.startCol);
        vCell.value = kpi.val;
        vCell.font = { name: 'Segoe UI', size: 20, bold: true, color: { argb: kpi.color } };
        vCell.alignment = { horizontal: 'center', vertical: 'middle' };

        for (let r = 6; r <= 7; r++) {
            for (let c = kpi.startCol; c <= kpi.endCol; c++) {
                const cell = wsSummary.getCell(r, c);
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                cell.border = thinBorder;
            }
        }
    });

    // Section 1: Role Permissions Overview Table
    wsSummary.mergeCells('B9:K9');
    const roleHead = wsSummary.getCell('B9');
    roleHead.value = '1. SYSTEM ROLES & ACCESS CONTROL OVERVIEW';
    roleHead.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: COLORS.WHITE } };
    roleHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
    roleHead.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    wsSummary.getRow(9).height = 25;

    const roleHeaders = ['Role Identifier', 'Display Title', 'Assigned Users', 'Active Permissions Count', 'Access Scope & Capabilities'];
    const roleColSpans = [
        { start: 2, end: 3 },
        { start: 4, end: 5 },
        { start: 6, end: 6 },
        { start: 7, end: 7 },
        { start: 8, end: 11 }
    ];

    wsSummary.getRow(10).height = 22;
    roleColSpans.forEach((col, idx) => {
        if (col.start !== col.end) wsSummary.mergeCells(10, col.start, 10, col.end);
        const cell = wsSummary.getCell(10, col.start);
        cell.value = roleHeaders[idx];
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.TEXT_DARK } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.alignment = { horizontal: idx === 2 || idx === 3 ? 'center' : 'left', vertical: 'middle', indent: idx === 2 || idx === 3 ? 0 : 1 };
        for (let c = col.start; c <= col.end; c++) wsSummary.getCell(10, c).border = thinBorder;
    });

    const rolesList = [
        {
            role: 'superadmin',
            title: 'Super Administrator',
            users: users.filter(u => u.role === 'superadmin').length,
            perms: rolePermissionsMap['superadmin'] ? rolePermissionsMap['superadmin'].size : 45,
            desc: 'Root authority with unlimited access across all modules, company settings, database connections, and custom roles.'
        },
        {
            role: 'admin',
            title: 'System Administrator (HR)',
            users: users.filter(u => u.role === 'admin').length,
            perms: rolePermissionsMap['admin'] ? rolePermissionsMap['admin'].size : 48,
            desc: 'Complete administrative access to employee records, organizational departments/shifts, payroll runs, attendance policies, leaves, recruitment, and analytical reports.'
        },
        {
            role: 'employee',
            title: 'Standard Employee',
            users: users.filter(u => u.role === 'employee').length,
            perms: rolePermissionsMap['employee'] ? rolePermissionsMap['employee'].size : 29,
            desc: 'Self-service portal access for biometric attendance viewing, personal leave applications, monthly payslip downloads, advance salary requests, and expense reimbursements.'
        }
    ];

    rolesList.forEach((r, idx) => {
        const rowNum = 11 + idx;
        wsSummary.getRow(rowNum).height = 24;
        roleColSpans.forEach((col, cIdx) => {
            if (col.start !== col.end) wsSummary.mergeCells(rowNum, col.start, rowNum, col.end);
            const cell = wsSummary.getCell(rowNum, col.start);
            if (cIdx === 0) cell.value = r.role.toUpperCase();
            if (cIdx === 1) cell.value = r.title;
            if (cIdx === 2) cell.value = r.users;
            if (cIdx === 3) cell.value = `${r.perms} Permissions`;
            if (cIdx === 4) cell.value = r.desc;

            cell.font = { name: 'Segoe UI', size: 9.5, bold: cIdx === 0 || cIdx === 2 };
            cell.alignment = { horizontal: cIdx === 2 || cIdx === 3 ? 'center' : 'left', vertical: 'middle', indent: cIdx === 2 || cIdx === 3 ? 0 : 1 };
            for (let c = col.start; c <= col.end; c++) {
                const cCell = wsSummary.getCell(rowNum, c);
                cCell.border = thinBorder;
                if (idx % 2 === 1) cCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ZEBRA } };
            }
        });
    });

    // Section 2: Department Breakdown
    const deptStartRow = 15;
    wsSummary.mergeCells(deptStartRow, 2, deptStartRow, 6);
    const deptHead = wsSummary.getCell(deptStartRow, 2);
    deptHead.value = '2. DEPARTMENT-WISE HEADCOUNT DISTRIBUTION';
    deptHead.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: COLORS.WHITE } };
    deptHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
    deptHead.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    wsSummary.getRow(deptStartRow).height = 24;

    const deptCounts = {};
    users.forEach(u => {
        const d = u.department_name || 'Unassigned';
        deptCounts[d] = (deptCounts[d] || 0) + 1;
    });

    const deptHeaders = ['Department Name', 'Total Staff', '% Share'];
    const deptColSpans = [
        { start: 2, end: 4 },
        { start: 5, end: 5 },
        { start: 6, end: 6 }
    ];

    wsSummary.getRow(deptStartRow + 1).height = 20;
    deptColSpans.forEach((col, idx) => {
        if (col.start !== col.end) wsSummary.mergeCells(deptStartRow + 1, col.start, deptStartRow + 1, col.end);
        const cell = wsSummary.getCell(deptStartRow + 1, col.start);
        cell.value = deptHeaders[idx];
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.alignment = { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle', indent: idx === 0 ? 1 : 0 };
        for (let c = col.start; c <= col.end; c++) wsSummary.getCell(deptStartRow + 1, c).border = thinBorder;
    });

    let currentDeptRow = deptStartRow + 2;
    Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).forEach(([dept, cnt], idx) => {
        wsSummary.getRow(currentDeptRow).height = 20;
        deptColSpans.forEach((col, cIdx) => {
            if (col.start !== col.end) wsSummary.mergeCells(currentDeptRow, col.start, currentDeptRow, col.end);
            const cell = wsSummary.getCell(currentDeptRow, col.start);
            if (cIdx === 0) cell.value = dept;
            if (cIdx === 1) cell.value = cnt;
            if (cIdx === 2) cell.value = `${((cnt / users.length) * 100).toFixed(1)}%`;

            cell.font = { name: 'Segoe UI', size: 9 };
            cell.alignment = { horizontal: cIdx === 0 ? 'left' : 'center', vertical: 'middle', indent: cIdx === 0 ? 1 : 0 };
            for (let c = col.start; c <= col.end; c++) {
                const cCell = wsSummary.getCell(currentDeptRow, c);
                cCell.border = thinBorder;
                if (idx % 2 === 1) cCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ZEBRA } };
            }
        });
        currentDeptRow++;
    });

    // Section 3: Workbook Navigation Guide
    wsSummary.mergeCells(deptStartRow, 7, deptStartRow, 11);
    const navHead = wsSummary.getCell(deptStartRow, 7);
    navHead.value = '3. WORKBOOK STRUCTURE & USER GUIDE';
    navHead.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: COLORS.WHITE } };
    navHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
    navHead.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    const navItems = [
        {
            sheet: '📊 Executive Summary',
            desc: 'High-level workforce KPIs, role breakdowns, department metrics, and navigation overview.'
        },
        {
            sheet: '👥 Employees Master Details',
            desc: 'Comprehensive employee profile table with 57 fields: Job, Contact, Personal, Statutory, Banking, Salary & Permissions.'
        },
        {
            sheet: '🔐 Role Permissions Matrix',
            desc: 'Detailed matrix of all 52 system capabilities and permissions across Superadmin, Admin, and Employee roles.'
        },
        {
            sheet: '📋 Employee vs Module Access',
            desc: 'Audit-ready cross-tab view showing each individual staff member and their effective YES/NO module access rights.'
        }
    ];

    navItems.forEach((item, idx) => {
        const row = deptStartRow + 1 + (idx * 2);
        wsSummary.mergeCells(row, 7, row, 11);
        const sCell = wsSummary.getCell(row, 7);
        sCell.value = item.sheet;
        sCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.NAVY_MEDIUM } };
        sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
        sCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        for (let c = 7; c <= 11; c++) wsSummary.getCell(row, c).border = thinBorder;

        wsSummary.mergeCells(row + 1, 7, row + 1, 11);
        const dCell = wsSummary.getCell(row + 1, 7);
        dCell.value = item.desc;
        dCell.font = { name: 'Segoe UI', size: 9, italic: true };
        dCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        for (let c = 7; c <= 11; c++) wsSummary.getCell(row + 1, c).border = thinBorder;
    });

    // Column widths for Summary
    wsSummary.getColumn(1).width = 4;
    wsSummary.getColumn(2).width = 18;
    wsSummary.getColumn(3).width = 16;
    wsSummary.getColumn(4).width = 20;
    wsSummary.getColumn(5).width = 16;
    wsSummary.getColumn(6).width = 14;
    wsSummary.getColumn(7).width = 18;
    wsSummary.getColumn(8).width = 20;
    wsSummary.getColumn(9).width = 22;
    wsSummary.getColumn(10).width = 18;
    wsSummary.getColumn(11).width = 24;

    // ==========================================
    // SHEET 2: EMPLOYEES MASTER DETAILS
    // ==========================================
    console.log('Building Sheet 2: Employees Master Details...');
    const wsEmp = workbook.addWorksheet('👥 Employees Master Details', {
        properties: { tabColor: { argb: 'FF0D9488' } },
        views: [{ showGridLines: true, state: 'frozen', xSplit: 3, ySplit: 4 }]
    });

    // Super Header Groups definition
    const empGroups = [
        { label: 'BASIC PROFILE', startCol: 1, endCol: 5, fill: COLORS.GRP_BASIC },
        { label: 'SYSTEM ROLE & PERMISSIONS SUMMARY', startCol: 6, endCol: 9, fill: COLORS.GRP_PERM },
        { label: 'ORGANIZATION & EMPLOYMENT', startCol: 10, endCol: 21, fill: COLORS.GRP_ORG },
        { label: 'SERVICE DATES & TENURE', startCol: 22, endCol: 27, fill: COLORS.GRP_BASIC },
        { label: 'OFFICIAL & PERSONAL CONTACT', startCol: 28, endCol: 31, fill: COLORS.GRP_CONTACT },
        { label: 'PERSONAL & FAMILY DETAILS', startCol: 32, endCol: 41, fill: COLORS.GRP_PERSONAL },
        { label: 'STATUTORY & COMPLIANCE', startCol: 42, endCol: 46, fill: COLORS.GRP_STATUTORY },
        { label: 'BANK ACCOUNT DETAILS', startCol: 47, endCol: 48, fill: COLORS.GRP_BANK },
        { label: 'COMPENSATION & PAYROLL', startCol: 49, endCol: 55, fill: COLORS.GRP_COMP },
        { label: 'SYSTEM ACCESS & METADATA', startCol: 56, endCol: 58, fill: COLORS.GRP_BASIC }
    ];

    // Column Definitions for Employees Sheet
    const empCols = [
        // Basic Profile
        { header: 'S.No', key: 'sno', width: 8, align: 'center' },
        { header: 'Employee ID', key: 'emp_id', width: 16, align: 'center' },
        { header: 'Full Name', key: 'employee_name', width: 26, align: 'left' },
        { header: 'System Username', key: 'username', width: 22, align: 'left' },
        { header: 'Work Email', key: 'email', width: 30, align: 'left' },

        // System Role & Permissions Summary
        { header: 'Assigned Role', key: 'role', width: 16, align: 'center' },
        { header: 'Role Access Level', key: 'role_level', width: 35, align: 'left' },
        { header: 'Total Permissions', key: 'total_perms', width: 18, align: 'center' },
        { header: 'Granted Functional Modules', key: 'granted_modules', width: 45, align: 'left' },

        // Organization & Employment
        { header: 'Company Name', key: 'company_name', width: 32, align: 'left' },
        { header: 'Department', key: 'department_name', width: 24, align: 'left' },
        { header: 'Designation', key: 'designation_name', width: 26, align: 'left' },
        { header: 'Branch Office', key: 'branch_name', width: 18, align: 'left' },
        { header: 'Work Location', key: 'work_location_name', width: 16, align: 'center' },
        { header: 'Employment Type', key: 'employment_type_name', width: 18, align: 'center' },
        { header: 'Assigned Shift', key: 'shift_name', width: 22, align: 'left' },
        { header: 'Shift Start', key: 'shift_start', width: 14, align: 'center' },
        { header: 'Shift End', key: 'shift_end', width: 14, align: 'center' },
        { header: 'Daily Hours', key: 'shift_hours', width: 14, align: 'center' },
        { header: 'Reporting Manager', key: 'reporting_manager_name', width: 24, align: 'left' },
        { header: 'Team Lead Status', key: 'team_lead', width: 16, align: 'center' },

        // Service Dates & Tenure
        { header: 'Experience Level', key: 'is_experienced', width: 16, align: 'center' },
        { header: 'Date of Joining', key: 'doj', width: 16, align: 'center' },
        { header: 'Date of Relieving', key: 'dor', width: 16, align: 'center' },
        { header: 'Tenure / Duration', key: 'duration', width: 18, align: 'center' },
        { header: 'Last Increment Date', key: 'last_increment', width: 18, align: 'center' },
        { header: 'Upcoming Increment', key: 'upcoming_increment', width: 18, align: 'center' },

        // Contact
        { header: 'Official Contact No', key: 'off_contact_no', width: 18, align: 'center' },
        { header: 'Official Mail ID', key: 'off_mail_id', width: 28, align: 'left' },
        { header: 'Personal Contact No', key: 'per_contact_no', width: 18, align: 'center' },
        { header: 'Personal Mail ID', key: 'per_mail_id', width: 28, align: 'left' },

        // Personal & Family
        { header: 'Date of Birth', key: 'dob', width: 16, align: 'center' },
        { header: 'Gender', key: 'gender', width: 12, align: 'center' },
        { header: 'Blood Group', key: 'blood_group', width: 14, align: 'center' },
        { header: 'Mother Tongue', key: 'mother_tongue', width: 16, align: 'center' },
        { header: 'Father / Spouse Name', key: 'father_spouse_name', width: 24, align: 'left' },
        { header: 'Father / Spouse Contact', key: 'father_spouse_contact', width: 20, align: 'center' },
        { header: 'Mother Name', key: 'mother_name', width: 22, align: 'left' },
        { header: 'Mother Contact', key: 'mother_contact', width: 18, align: 'center' },
        { header: 'Temporary Address', key: 'temp_address', width: 30, align: 'left' },
        { header: 'Permanent Address', key: 'perm_address', width: 30, align: 'left' },

        // Statutory
        { header: 'Aadhar Number', key: 'aadhar', width: 18, align: 'center' },
        { header: 'PAN Card Number', key: 'pan', width: 16, align: 'center' },
        { header: 'UAN Number', key: 'uan', width: 18, align: 'center' },
        { header: 'PF Number', key: 'pf', width: 18, align: 'center' },
        { header: 'ESI Number', key: 'esi', width: 18, align: 'center' },

        // Bank
        { header: 'Bank Account No', key: 'bank_ac_no', width: 20, align: 'center' },
        { header: 'Bank IFSC Code', key: 'ifsc', width: 16, align: 'center' },

        // Compensation
        { header: 'Annual Gross Salary', key: 'year_gross_salary', width: 20, align: 'right' },
        { header: 'Est. Monthly Gross', key: 'monthly_gross', width: 18, align: 'right' },
        { header: 'Variable Pay', key: 'variable', width: 16, align: 'right' },
        { header: 'Travel Allowance', key: 'travel_allowance', width: 18, align: 'right' },
        { header: 'Employer EPFO', key: 'employer_epfo', width: 16, align: 'right' },
        { header: 'EPF Deduction', key: 'epf', width: 16, align: 'right' },
        { header: 'Professional Tax (PT)', key: 'pt', width: 18, align: 'right' },

        // System Access & Metadata
        { header: 'Web Clock-In Allowed', key: 'web_clock_in_allowed', width: 20, align: 'center' },
        { header: 'Biometric Device ID', key: 'biometric_id', width: 18, align: 'center' },
        { header: 'Profile Created On', key: 'created_at', width: 20, align: 'center' }
    ];

    // Title Row 1 & 2
    wsEmp.mergeCells(1, 1, 1, empCols.length);
    const empTitleCell = wsEmp.getCell(1, 1);
    empTitleCell.value = 'ACTE TECHNOLOGIES - MASTER EMPLOYEES & ROLE-BASED ACCESS DIRECTORY';
    empTitleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: COLORS.WHITE } };
    empTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
    empTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsEmp.getRow(1).height = 30;

    wsEmp.mergeCells(2, 1, 2, empCols.length);
    const empSubCell = wsEmp.getCell(2, 1);
    empSubCell.value = `Total Records: ${users.length} Active Profiles | Generated: ${new Date().toLocaleString()} | Includes Full Personal, Statutory, Compensation & Role Permission Metadata`;
    empSubCell.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: COLORS.TEXT_MUTED } };
    empSubCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsEmp.getRow(2).height = 20;

    // Super Headers Row 3
    wsEmp.getRow(3).height = 24;
    empGroups.forEach(grp => {
        wsEmp.mergeCells(3, grp.startCol, 3, grp.endCol);
        const cell = wsEmp.getCell(3, grp.startCol);
        cell.value = grp.label;
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.NAVY_DARK } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grp.fill } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        for (let c = grp.startCol; c <= grp.endCol; c++) {
            wsEmp.getCell(3, c).border = thinBorder;
        }
    });

    // Column Headers Row 4
    wsEmp.getRow(4).height = 28;
    empCols.forEach((col, idx) => {
        const cNum = idx + 1;
        const cell = wsEmp.getCell(4, cNum);
        cell.value = col.header;
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
        wsEmp.getColumn(cNum).width = col.width;
    });

    // Populate Data Rows
    users.forEach((u, uIdx) => {
        const rowNum = 5 + uIdx;
        const row = wsEmp.getRow(rowNum);
        row.height = 22;

        const roleLower = (u.role || '').toLowerCase();
        const rolePermSet = rolePermissionsMap[roleLower] || new Set();
        const annualSalary = parseFloat(u.year_gross_salary) || 0;
        const monthlySalary = annualSalary > 0 ? (annualSalary / 12) : 0;

        const rowValues = [
            uIdx + 1, // S.No
            u.emp_id || `EMP${u.id}`,
            u.employee_name || u.name || 'N/A',
            u.username || 'N/A',
            u.email || 'N/A',
            (u.role || 'employee').toUpperCase(),
            getRoleLevelDescription(u.role),
            rolePermSet.size > 0 ? `${rolePermSet.size} Modules` : 'Default Staff Access',
            getRoleModulesSummary(u.role),
            u.company_name,
            u.department_name,
            u.designation_name,
            u.branch_name,
            u.work_location_name,
            u.employment_type_name,
            u.shift_name || 'General Shift',
            u.shift_start ? u.shift_start.slice(0, 5) : 'N/A',
            u.shift_end ? u.shift_end.slice(0, 5) : 'N/A',
            calculateShiftHours(u.shift_start, u.shift_end),
            u.reporting_manager_name || 'Direct / None',
            u.team_lead === 'yes' || u.team_lead === 1 ? 'Yes' : 'No',
            u.is_experienced === 1 ? 'Experienced' : 'Fresher',
            u.doj || 'N/A',
            u.dor || 'Active / Present',
            u.duration || 'N/A',
            u.last_increment || 'N/A',
            u.upcoming_increment || 'N/A',
            u.off_contact_no || 'N/A',
            u.off_mail_id || u.email || 'N/A',
            u.per_contact_no || 'N/A',
            u.per_mail_id || 'N/A',
            u.dob || 'N/A',
            u.gender || 'N/A',
            u.blood_group || 'N/A',
            u.mother_tongue || 'N/A',
            u.father_spouse_name || 'N/A',
            u.father_spouse_contact || 'N/A',
            u.mother_name || 'N/A',
            u.mother_contact || 'N/A',
            u.temp_address || 'N/A',
            u.perm_address || 'N/A',
            u.aadhar || 'N/A',
            u.pan || 'N/A',
            u.uan || 'N/A',
            u.pf || 'N/A',
            u.esi || 'N/A',
            u.bank_ac_no || 'N/A',
            u.ifsc || 'N/A',
            annualSalary > 0 ? annualSalary : 0,
            monthlySalary > 0 ? monthlySalary : 0,
            parseFloat(u.variable) || 0,
            parseFloat(u.travel_allowance) || 0,
            parseFloat(u.employer_epfo) || 0,
            parseFloat(u.epf) || 0,
            parseFloat(u.pt) || 0,
            u.web_clock_in_allowed === 1 ? 'Allowed' : 'Restricted',
            u.biometric_id || 'N/A',
            u.created_at ? u.created_at.slice(0, 10) : 'N/A'
        ];

        rowValues.forEach((val, cIdx) => {
            const cell = row.getCell(cIdx + 1);
            cell.value = val;
            cell.font = { name: 'Segoe UI', size: 9 };
            cell.border = thinBorder;

            // Zebra background
            if (uIdx % 2 === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ZEBRA } };
            }

            // Alignment
            const colDef = empCols[cIdx];
            cell.alignment = {
                horizontal: colDef ? colDef.align : 'left',
                vertical: 'middle',
                indent: colDef && colDef.align === 'left' ? 1 : 0
            };

            // Formatting numbers / currency
            if (cIdx === 48 || cIdx === 49 || cIdx === 50 || cIdx === 51) {
                cell.numFmt = '₹#,##0.00';
            }

            // Role Badge styling
            if (cIdx === 5) {
                cell.font = { name: 'Segoe UI', size: 9, bold: true };
                if (val === 'SUPERADMIN') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_SUPER_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.BADGE_SUPER_TXT } };
                } else if (val === 'ADMIN') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_ADMIN_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.BADGE_ADMIN_TXT } };
                } else {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_EMP_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.BADGE_EMP_TXT } };
                }
            }

            // Web Clock In Badge styling
            if (cIdx === 55) {
                if (val === 'Allowed') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_YES_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.BADGE_YES_TXT } };
                } else {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_NO_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, color: { argb: COLORS.BADGE_NO_TXT } };
                }
            }
        });
    });

    // Auto-filter on data columns
    wsEmp.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4 + users.length, column: empCols.length }
    };

    // ==========================================
    // SHEET 3: ROLE PERMISSIONS MATRIX
    // ==========================================
    console.log('Building Sheet 3: Role Permissions Matrix...');
    const wsMatrix = workbook.addWorksheet('🔐 Role Permissions Matrix', {
        properties: { tabColor: { argb: 'FF7C3AED' } },
        views: [{ showGridLines: true, state: 'frozen', ySplit: 4 }]
    });

    // Title Row
    wsMatrix.mergeCells('A1:H1');
    const matTitleCell = wsMatrix.getCell('A1');
    matTitleCell.value = 'ENTERPRISE ACCESS CONTROL & ROLE PERMISSIONS MATRIX';
    matTitleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: COLORS.WHITE } };
    matTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
    matTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsMatrix.getRow(1).height = 30;

    wsMatrix.mergeCells('A2:H2');
    const matSubCell = wsMatrix.getCell('A2');
    matSubCell.value = 'Comprehensive mapping of all HRM system modules, functional permissions, and authorization rights for Superadmin, Admin, and Employee roles';
    matSubCell.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: COLORS.TEXT_MUTED } };
    matSubCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsMatrix.getRow(2).height = 20;

    // Super Headers Row 3
    wsMatrix.getRow(3).height = 22;
    wsMatrix.mergeCells('A3:E3');
    const permInfoHead = wsMatrix.getCell('A3');
    permInfoHead.value = 'PERMISSION DEFINITION & SCOPE';
    permInfoHead.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.NAVY_DARK } };
    permInfoHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    permInfoHead.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= 5; c++) wsMatrix.getCell(3, c).border = thinBorder;

    wsMatrix.mergeCells('F3:H3');
    const roleAccessHead = wsMatrix.getCell('F3');
    roleAccessHead.value = 'ROLE AUTHORIZATION STATUS';
    roleAccessHead.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.WHITE } };
    roleAccessHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_MEDIUM } };
    roleAccessHead.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 6; c <= 8; c++) wsMatrix.getCell(3, c).border = thinBorder;

    // Headers Row 4
    const matHeaders = [
        { header: 'S.No', width: 8, align: 'center' },
        { header: 'Module Category', width: 26, align: 'left' },
        { header: 'Functional Module', width: 22, align: 'left' },
        { header: 'Feature / Capability Name', width: 32, align: 'left' },
        { header: 'Permission Identifier Code', width: 30, align: 'left' },
        { header: 'Super Administrator', width: 22, align: 'center' },
        { header: 'System Administrator (HR)', width: 24, align: 'center' },
        { header: 'Standard Employee', width: 22, align: 'center' }
    ];

    wsMatrix.getRow(4).height = 28;
    matHeaders.forEach((col, idx) => {
        const cNum = idx + 1;
        const cell = wsMatrix.getCell(4, cNum);
        cell.value = col.header;
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
        wsMatrix.getColumn(cNum).width = col.width;
    });

    const superPerms = rolePermissionsMap['superadmin'] || new Set();
    const adminPerms = rolePermissionsMap['admin'] || new Set();
    const empPerms = rolePermissionsMap['employee'] || new Set();

    PERMISSION_CATALOG.forEach((item, idx) => {
        const rowNum = 5 + idx;
        const row = wsMatrix.getRow(rowNum);
        row.height = 22;

        const hasSuper = superPerms.has(item.key) || superPerms.has(item.key.replace(/-/g, '_')) || superPerms.has(item.key.replace(/_/g, '-'));
        const hasAdmin = adminPerms.has(item.key) || adminPerms.has(item.key.replace(/-/g, '_')) || adminPerms.has(item.key.replace(/_/g, '-'));
        const hasEmp = empPerms.has(item.key) || empPerms.has(item.key.replace(/-/g, '_')) || empPerms.has(item.key.replace(/_/g, '-'));

        const rowValues = [
            idx + 1,
            item.category,
            item.module,
            item.feature,
            item.key,
            hasSuper ? '✅ GRANTED' : '❌ DENIED',
            hasAdmin ? '✅ GRANTED' : '❌ DENIED',
            hasEmp ? '✅ GRANTED' : '❌ DENIED'
        ];

        rowValues.forEach((val, cIdx) => {
            const cell = row.getCell(cIdx + 1);
            cell.value = val;
            cell.font = { name: 'Segoe UI', size: 9.5 };
            cell.border = thinBorder;

            if (idx % 2 === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ZEBRA } };
            }

            const colDef = matHeaders[cIdx];
            cell.alignment = {
                horizontal: colDef ? colDef.align : 'left',
                vertical: 'middle',
                indent: colDef && colDef.align === 'left' ? 1 : 0
            };

            // Status Badge Formatting
            if (cIdx >= 5) {
                if (val.includes('GRANTED')) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_YES_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.BADGE_YES_TXT } };
                } else {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_NO_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, color: { argb: COLORS.BADGE_NO_TXT } };
                }
            }
        });
    });

    wsMatrix.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4 + PERMISSION_CATALOG.length, column: matHeaders.length }
    };

    // ==========================================
    // SHEET 4: EMPLOYEE VS MODULE ACCESS MATRIX
    // ==========================================
    console.log('Building Sheet 4: Employee vs Module Access...');
    const wsEmpAccess = workbook.addWorksheet('📋 Employee vs Module Access', {
        properties: { tabColor: { argb: 'FF059669' } },
        views: [{ showGridLines: true, state: 'frozen', xSplit: 3, ySplit: 4 }]
    });

    // Modules to evaluate per employee
    const evalModules = [
        { name: 'Dashboard', key: 'dashboard' },
        { name: 'Staff Directory', key: 'employees_list' },
        { name: 'Add Employees', key: 'employees_add' },
        { name: 'ID Cards', key: 'employees_id_card' },
        { name: 'Staff Credentials', key: 'employees_credentials' },
        { name: 'Role Permissions', key: 'employees_permissions' },
        { name: 'Organization Setup', key: 'organization' },
        { name: 'Payroll Processing', key: 'payroll' },
        { name: 'Salary Structures', key: 'payroll_structure' },
        { name: 'View My Payslip', key: 'payroll_payslips' },
        { name: 'Advance Salary', key: 'payroll_advance_salary' },
        { name: 'Reimbursements', key: 'reimbursements' },
        { name: 'Attendance Management', key: 'attendance' },
        { name: 'Biometric Punch Logs', key: 'attendance_biometric' },
        { name: 'Biometric Devices', key: 'attendance_devices' },
        { name: 'Leave Approvals', key: 'leaves_manage' },
        { name: 'Apply For Leave', key: 'leaves_apply' },
        { name: 'Holiday Calendar', key: 'leaves_holiday' },
        { name: 'Company Policies', key: 'company_policies' },
        { name: 'Asset Management', key: 'asset_management' },
        { name: 'Recruitment & ATS', key: 'jobs_recruitment' },
        { name: 'Analytics & Reports', key: 'reports' }
    ];

    const accessCols = [
        { header: 'S.No', width: 8, align: 'center' },
        { header: 'Employee ID', width: 16, align: 'center' },
        { header: 'Full Name', width: 26, align: 'left' },
        { header: 'Department', width: 22, align: 'left' },
        { header: 'Designation', width: 24, align: 'left' },
        { header: 'Role', width: 14, align: 'center' },
        ...evalModules.map(m => ({ header: m.name, width: 18, align: 'center' }))
    ];

    // Title Row
    wsEmpAccess.mergeCells(1, 1, 1, accessCols.length);
    const empAccTitle = wsEmpAccess.getCell(1, 1);
    empAccTitle.value = 'EMPLOYEE INDIVIDUAL MODULE ACCESS & PRIVILEGE MATRIX';
    empAccTitle.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: COLORS.WHITE } };
    empAccTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
    empAccTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    wsEmpAccess.getRow(1).height = 30;

    wsEmpAccess.mergeCells(2, 1, 2, accessCols.length);
    const empAccSub = wsEmpAccess.getCell(2, 1);
    empAccSub.value = 'Per-Employee audit view showing effective operational capabilities across all functional HRM modules';
    empAccSub.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: COLORS.TEXT_MUTED } };
    empAccSub.alignment = { horizontal: 'center', vertical: 'middle' };
    wsEmpAccess.getRow(2).height = 20;

    // Super Headers Row 3
    wsEmpAccess.getRow(3).height = 22;
    wsEmpAccess.mergeCells(3, 1, 3, 6);
    const empProfileHead = wsEmpAccess.getCell(3, 1);
    empProfileHead.value = 'EMPLOYEE IDENTIFICATION & POSITION';
    empProfileHead.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.NAVY_DARK } };
    empProfileHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    empProfileHead.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= 6; c++) wsEmpAccess.getCell(3, c).border = thinBorder;

    wsEmpAccess.mergeCells(3, 7, 3, accessCols.length);
    const modulePermHead = wsEmpAccess.getCell(3, 7);
    modulePermHead.value = 'FUNCTIONAL SYSTEM MODULE ACCESS PERMISSION STATUS';
    modulePermHead.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.WHITE } };
    modulePermHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_MEDIUM } };
    modulePermHead.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 7; c <= accessCols.length; c++) wsEmpAccess.getCell(3, c).border = thinBorder;

    // Headers Row 4
    wsEmpAccess.getRow(4).height = 28;
    accessCols.forEach((col, idx) => {
        const cNum = idx + 1;
        const cell = wsEmpAccess.getCell(4, cNum);
        cell.value = col.header;
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.NAVY_HEADER } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
        wsEmpAccess.getColumn(cNum).width = col.width;
    });

    // Populate Rows
    users.forEach((u, uIdx) => {
        const rowNum = 5 + uIdx;
        const row = wsEmpAccess.getRow(rowNum);
        row.height = 22;

        const roleLower = (u.role || '').toLowerCase();
        const rolePermSet = rolePermissionsMap[roleLower] || new Set();

        const baseVals = [
            uIdx + 1,
            u.emp_id || `EMP${u.id}`,
            u.employee_name || u.name || 'N/A',
            u.department_name,
            u.designation_name,
            (u.role || 'employee').toUpperCase()
        ];

        const moduleVals = evalModules.map(m => {
            // Check direct or alternate key naming
            const hasAccess = rolePermSet.has(m.key) || 
                              rolePermSet.has(m.key.replace(/_/g, '-')) || 
                              rolePermSet.has(m.key.replace(/-/g, '_'));
            return hasAccess ? '✅ YES' : '❌ NO';
        });

        const allVals = [...baseVals, ...moduleVals];

        allVals.forEach((val, cIdx) => {
            const cell = row.getCell(cIdx + 1);
            cell.value = val;
            cell.font = { name: 'Segoe UI', size: 9 };
            cell.border = thinBorder;

            if (uIdx % 2 === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ZEBRA } };
            }

            const colDef = accessCols[cIdx];
            cell.alignment = {
                horizontal: colDef ? colDef.align : 'left',
                vertical: 'middle',
                indent: colDef && colDef.align === 'left' ? 1 : 0
            };

            // Role formatting
            if (cIdx === 5) {
                cell.font = { name: 'Segoe UI', size: 9, bold: true };
                if (val === 'SUPERADMIN') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_SUPER_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.BADGE_SUPER_TXT } };
                } else if (val === 'ADMIN') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_ADMIN_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.BADGE_ADMIN_TXT } };
                } else {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_EMP_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.BADGE_EMP_TXT } };
                }
            }

            // Yes / No formatting
            if (cIdx >= 6) {
                if (val === '✅ YES') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_YES_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: COLORS.BADGE_YES_TXT } };
                } else {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.BADGE_NO_BG } };
                    cell.font = { name: 'Segoe UI', size: 9, color: { argb: COLORS.BADGE_NO_TXT } };
                }
            }
        });
    });

    wsEmpAccess.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4 + users.length, column: accessCols.length }
    };

    // Save Workbook to disk
    const targetDir = path.resolve(__dirname, '../../');
    const outputPath = path.join(targetDir, 'Employees_Details_And_Role_Permissions.xlsx');
    console.log(`Writing Excel workbook to: ${outputPath}`);
    await workbook.xlsx.writeFile(outputPath);
    console.log(`Successfully generated Excel file! File size: ${fs.statSync(outputPath).size} bytes`);

    process.exit(0);
}

generateExcel().catch(err => {
    console.error('Fatal error during Excel generation:', err);
    process.exit(1);
});

