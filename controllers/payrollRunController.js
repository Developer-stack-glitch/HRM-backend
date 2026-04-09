const PayrollRun = require('../models/payrollRunModel');
const { User } = require('../models/userModel');
const Attendance = require('../models/attendanceModel');
const Holiday = require('../models/holidayModel');
const CompanyWeekOff = require('../models/companyWeekoffModel');
const { pool } = require('../Config/dbConfig');
const { sendEmail } = require('../utils/emailService');
const Organization = require('../models/organizationModel');
const { generatePayslipPDF } = require('../utils/pdfGenerator');

// Helper: get all dates between start and end (inclusive)
function getDateRange(start, end) {
    const dates = [];
    const current = new Date(start);
    const endDate = new Date(end);
    while (current <= endDate) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

// Helper: day name from Date object
function getDayName(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
}

// Helper: format date as YYYY-MM-DD
function formatDateStr(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const payrollRunController = {
    create: async (req, res) => {
        try {
            const data = { ...req.body };

            // Auto-calculate total_employees from batch allocation assignments
            if (data.batch_allocation_id) {
                const BatchAllocation = require('../models/salaryStructureModel');
                const assignedUserIds = await BatchAllocation.getAssignedUserIds(data.batch_allocation_id);
                data.total_employees = assignedUserIds.length;
            }

            const id = await PayrollRun.create(data);
            res.status(201).json({ message: 'Payroll run created successfully', id });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getAll: async (req, res) => {
        try {
            const { company_id, status, page = 1, limit = 10, startDate, endDate, branch, department, shift } = req.query;
            const filters = { startDate, endDate, branch, department, shift };
            const { rows: runs, total, totalSum } = await PayrollRun.getAll(company_id, page, limit, status, filters);

            // Dynamically set total_employees from batch allocation assignments
            const BatchAllocation = require('../models/salaryStructureModel');
            const enrichedRuns = await Promise.all(runs.map(async (run) => {
                const [itemCount] = await pool.execute('SELECT COUNT(*) as count FROM payroll_items WHERE payroll_run_id = ?', [run.id || null]);
                const processed = itemCount[0].count;

                if (run.batch_allocation_id) {
                    const assignedUserIds = await BatchAllocation.getAssignedUserIds(run.batch_allocation_id);
                    return { ...run, total_employees: assignedUserIds.length, processed_employees: processed };
                }
                return { ...run, processed_employees: processed };
            }));

            res.json({
                data: enrichedRuns,
                pagination: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages: Math.ceil(total / limit),
                    totalAmountSum: parseFloat(totalSum || 0)
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    updateStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            await PayrollRun.updateStatus(id, status);
            res.json({ message: 'Payroll status updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const data = req.body;
            await PayrollRun.update(id, data);
            res.json({ message: 'Payroll run updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Internal Helper: Calculate payroll for a list of employees
    calculatePayrollInternal: async (payrollRun, employees) => {
        const CompanyPolicy = require('../models/companyPolicyModel');
        const periodStart = payrollRun.period_start;
        const periodEnd = payrollRun.period_end;
        const companyId = payrollRun.company_id;
        // Get all salary structures and their components to avoid repeated queries
        const [allStructures] = await pool.execute('SELECT * FROM batch_allocations');
        const [allStructureComponents] = await pool.execute(`
            SELECT sc.*, ssc.batch_allocation_id
            FROM salary_components sc
            JOIN salary_structure_components ssc ON sc.id = ssc.component_id
            WHERE sc.is_active = 1
            ORDER BY sc.sort_order ASC, sc.created_at ASC
        `);

        const structureMap = {};
        allStructures.forEach(s => {
            structureMap[s.id] = { ...s, components: [] };
        });
        allStructureComponents.forEach(sc => {
            if (structureMap[sc.batch_allocation_id]) {
                structureMap[sc.batch_allocation_id].components.push(sc);
            }
        });

        const { getAttendanceDataInternal, isWeekOff } = require('./attendanceController');

        // Get attendance in the payroll period (from both DB AND Biometric)
        const attendanceRecords = await getAttendanceDataInternal(
            formatDateStr(periodStart),
            formatDateStr(periodEnd)
        );

        const attendanceByUser = {};
        attendanceRecords.forEach(record => {
            if (!attendanceByUser[record.user_id]) attendanceByUser[record.user_id] = [];
            attendanceByUser[record.user_id].push(record);
        });

        // Get holidays 
        let holidays = [];
        try {
            holidays = companyId ? await Holiday.getByCompanyId(companyId) : await Holiday.getAll();
        } catch (e) { console.log('Could not fetch holidays:', e.message); }

        const holidayDates = new Set();
        holidays.forEach(h => {
            const hDate = formatDateStr(h.date);
            if (hDate >= formatDateStr(periodStart) && hDate <= formatDateStr(periodEnd)) holidayDates.add(hDate);
        });

        const allDates = getDateRange(periodStart, periodEnd);
        const totalCalendarDays = allDates.length;

        // Use total calendar days as the divisor (e.g., 31)
        const workingDays = totalCalendarDays;

        // Fetch Company Policy for dynamic allowances
        const policy = await CompanyPolicy.getByCompanyId(companyId);
        const clLimit = policy ? parseFloat(policy.cl_limit) : 1.0;
        const permissionLimit = policy ? parseFloat(policy.permission_limit) : 0.2;

        // Use shared formula evaluator
        const { getDefinitions, evaluateFormula } = require('../utils/formulaEvaluator');
        const definitions = await getDefinitions(companyId);

        const payrollEmployees = await Promise.all(employees.map(async (emp) => {
            const structureId = emp.salary_structure_id || payrollRun.batch_allocation_id;
            const structure = structureMap[structureId] || { name: 'Standard Salary', components: [] };

            // Determine monthly salary based on new year_gross_salary field
            const yearGross = parseFloat(emp.year_gross_salary) || (parseFloat(emp.cur_sal_gross) * 12) || 0;
            const monthlySalary = yearGross / 12;

            const userAttendance = attendanceByUser[emp.id] || [];

            // Respect joining date: ensure we only calculate for days the employee was actually active
            const startDay = new Date(periodStart);
            startDay.setHours(0, 0, 0, 0);

            const joinDay = emp.doj ? new Date(emp.doj) : null;
            if (joinDay) joinDay.setHours(0, 0, 0, 0);

            const actualStart = (joinDay && joinDay > startDay) ? joinDay : startDay;

            const effectiveDates = getDateRange(actualStart, periodEnd).map(d => formatDateStr(d));
            const effectiveTotalDays = effectiveDates.length;
            let cumulativePaidDays = 0;
            const attendedMap = new Map();
            const statusMap = new Map();

            userAttendance.forEach(record => {
                const dateStr = formatDateStr(record.date);
                if (dateStr >= formatDateStr(actualStart) && dateStr <= formatDateStr(periodEnd)) {
                    const val = parseFloat(record.working_day_value || 0);
                    // If multiple records for same day, take the highest value (e.g. manual entry might override biometric)
                    if (!attendedMap.has(dateStr) || attendedMap.get(dateStr) < val) {
                        attendedMap.set(dateStr, val);
                        statusMap.set(dateStr, record.status);
                    }
                }
            });

            // 1. Calculate cumulative paid days (Worked + Rest Days) for the effective period
            for (const dateStr of effectiveDates) {
                if (attendedMap.has(dateStr)) {
                    cumulativePaidDays += attendedMap.get(dateStr);
                } else if (holidayDates.has(dateStr)) {
                    cumulativePaidDays += 1;
                } else {
                    const isWO = await isWeekOff(emp.id, emp.company, dateStr);
                    cumulativePaidDays += isWO ? 1 : 0;
                }
            }

            const perDaySalary = effectiveTotalDays > 0 ? monthlySalary / effectiveTotalDays : 0;

            // 2. Identify "Total Missed" within the effective employment period
            const totalMissed = Math.max(0, effectiveTotalDays - cumulativePaidDays);

            // 3. Apply Allowances to the missed pool
            const clUsed = Math.min(totalMissed, clLimit);
            const remainingMissed = totalMissed - clUsed;
            const permissionUsed = Math.min(remainingMissed, permissionLimit);

            const appliedAllowance = clUsed + permissionUsed;
            const absentDays = Math.max(0, totalMissed - appliedAllowance);
            const paidDaysFinal = cumulativePaidDays + appliedAllowance;

            const lop = absentDays * perDaySalary;

            // --- Determine Structure for this Employee ---
            const empStructureId = emp.salary_structure_id || payrollRun.batch_allocation_id;
            const currentStructure = structureMap[empStructureId];
            const structureName = currentStructure ? currentStructure.name : 'Standard';
            const dynamicComponents = currentStructure ? currentStructure.components : [];

            // --- Dynamic Component Calculation ---
            const earnings = {};
            const deductions = {};

            // Context needs to be per-employee
            const context = {
                'CTC_YEAR': yearGross,
                'CTC': monthlySalary, // Monthly CTC
                'GROSS': monthlySalary,
                'Basic': monthlySalary * 0.5 // Default Basic if not found
            };

            for (const comp of dynamicComponents) {
                let val = 0;
                const typeStr = comp.calculation_type?.toLowerCase();

                if (typeStr === 'fixed') {
                    val = parseFloat(comp.calculation_value) || 0;
                } else if (typeStr === 'formula') {
                    try {
                        val = evaluateFormula(comp.calculation_value, context, definitions);
                    } catch (e) { val = 0; }
                } else if (typeStr === 'variable') {
                    val = parseFloat(emp[comp.name.toLowerCase()]) || parseFloat(emp.variable) || 0;
                }

                // Update context for subsequent formulas
                context[comp.name] = val;

                if (comp.type === 'Earning') {
                    earnings[comp.name] = val;
                } else {
                    deductions[comp.name] = val;
                }
            }

            // If no components, fallback to legacy basic calculation
            if (Object.keys(earnings).length === 0) {
                earnings['Basic'] = monthlySalary * 0.5;
                earnings['HRA'] = earnings['Basic'] * 0.5;
                earnings['Conveyance'] = 1600;
                earnings['Medical'] = 1250;
                earnings['Special Allowance'] = Math.max(0, monthlySalary - (earnings['Basic'] + earnings['HRA'] + 1600 + 1250));
            }

            const totalDeductions = Object.values(deductions).reduce((a, b) => a + b, 0);
            const totalDeductionsIncludingLOP = totalDeductions + lop;
            const net = Math.max(0, monthlySalary - totalDeductionsIncludingLOP + (parseFloat(emp.variable) || 0) + (parseFloat(emp.travel_allowance) || 0));

            // Helper to get pro-rated value from breakdown (case-insensitive)
            const getCompValue = (compBreakdown, nameList) => {
                for (const name of nameList) {
                    const foundKey = Object.keys(compBreakdown).find(k => k.toLowerCase() === name.toLowerCase());
                    if (foundKey) return compBreakdown[foundKey];
                }
                return 0;
            };

            const result = {
                user_id: emp.id,
                name: emp.employee_name || emp.name,
                emp_id: emp.emp_id,
                department: emp.department_name || emp.department,
                designation: emp.designation_name || emp.designation,
                structure: structureName,
                official_email: emp.off_mail_id || emp.email,
                paidDays: parseFloat(paidDaysFinal.toFixed(2)),
                totalWorkingDays: workingDays,
                absentDays: parseFloat(absentDays.toFixed(2)),
                allowance_applied: parseFloat(appliedAllowance.toFixed(2)),
                cl_used: parseFloat(clUsed.toFixed(2)),
                permission_used: parseFloat(permissionUsed.toFixed(2)),
                fullSalary: monthlySalary,
                gross: parseFloat(monthlySalary.toFixed(2)),
                lop: parseFloat(lop.toFixed(2)),
                deductions: parseFloat(totalDeductionsIncludingLOP.toFixed(2)),
                other_deductions: getCompValue(deductions, ['Other', 'Other Deduction', 'Other Deductions']),
                net: parseFloat(net.toFixed(2)),

                // Full legacy fields for UI compatibility (non-pro-rated to show expectations)
                salary: getCompValue(earnings, ['Basic', 'BASIC']),
                hra: getCompValue(earnings, ['HRA']),
                conveyance: getCompValue(earnings, ['Conveyance', 'Conveyance Allowance']),
                medical: getCompValue(earnings, ['Medical', 'Medical Allowance', 'Medical Reimbursement', 'Medical Reim']),
                special: getCompValue(earnings, ['Special Allowance', 'Special', 'Spl Allowance']),
                perDiem: getCompValue(earnings, ['Per Diem', 'Per Diem Allowance']),
                incentives: getCompValue(earnings, ['Incentive', 'Incentives']),
                other: getCompValue(earnings, ['Other', 'Other Allowance', 'Other Earnings']),

                // Deductions (Legacy)
                epf: getCompValue(deductions, ['EPF']),
                esi: getCompValue(deductions, ['ESI']),
                pt: getCompValue(deductions, ['PT']),
                it: getCompValue(deductions, ['IT', 'Income Tax']),
                vpf: getCompValue(deductions, ['VPF', 'Voluntary PF']),
                employer_epfo: getCompValue(deductions, ['ER EPFO', 'ER EPF', 'Employer EPF']),

                // New dynamic breakdown
                earnings_breakdown: earnings,
                deductions_breakdown: deductions,
                pro_rated_earnings: earnings, // Even pro-rated shows full now as LOP is a separate deduction

                balance: 0,
                bank_ac_no: emp.bank_ac_no,
                pf_no: emp.pf,
                travel: parseFloat(emp.travel_allowance || 0)
            };

            return result;
        }));

        const weekOffResults = await Promise.all(allDates.map(date => isWeekOff(null, companyId, date)));
        const weekOffs = weekOffResults.filter(Boolean).length;

        const actualWorkDays = totalCalendarDays - weekOffs;

        return {
            payrollEmployees,
            workingDays: actualWorkDays, // Displays as "Working Days" in UI
            totalCalendarDays,           // Displays as "Calendar Days" in UI
            totalAmount: parseFloat(payrollEmployees.reduce((sum, emp) => sum + emp.net, 0).toFixed(2))
        };
    },

    toggleHold: async (req, res) => {
        try {
            const { payroll_run_id, user_id, is_hold, reason } = req.body;

            // 1. Check if run is completed
            const [runRows] = await pool.execute('SELECT status FROM payroll_runs WHERE id = ?', [payroll_run_id]);
            if (!runRows.length) return res.status(404).json({ error: 'Payroll run not found' });

            const isCompleted = runRows[0].status === 'Completed';

            if (isCompleted) {
                // Update finalized item
                await pool.execute(
                    'UPDATE payroll_items SET is_hold = ? WHERE payroll_run_id = ? AND user_id = ?',
                    [is_hold ? 1 : 0, payroll_run_id, user_id]
                );
            }

            // Always manage payroll_holds table for consistency and active run tracking
            if (is_hold) {
                await pool.execute(
                    'INSERT INTO payroll_holds (payroll_run_id, user_id, reason) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = ?',
                    [payroll_run_id, user_id, reason || '', reason || '']
                );
            } else {
                await pool.execute(
                    'DELETE FROM payroll_holds WHERE payroll_run_id = ? AND user_id = ?',
                    [payroll_run_id, user_id]
                );
            }

            res.json({ message: `Salary ${is_hold ? 'placed on hold' : 'released'} successfully` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getHoldList: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute(`
                SELECT 
                    h.*, 
                    u.employee_name, u.emp_id, u.off_mail_id as email,
                    pr.batch_name, pr.period_start, pr.period_end, pr.status as run_status
                FROM payroll_holds h
                JOIN users u ON h.user_id = u.id
                JOIN payroll_runs pr ON h.payroll_run_id = pr.id
                WHERE u.company = ? OR ? IS NULL
                ORDER BY h.created_at DESC
            `, [company_id || null, company_id || null]);

            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getAnalytics: async (req, res) => {
        try {
            const { company_id, startDate, endDate, branch, department, shift } = req.query;
            const status = 'Completed'; // Only finalized payrolls

            // 1. Fetch Aggregated Payroll Items for the current range
            const [baseItems] = await pool.execute(`
                SELECT 
                    pi.*, 
                    u.employee_name, u.emp_id, u.off_mail_id as email, u.gender,
                    pr.batch_name, pr.period_start, pr.period_end,
                    COALESCE(d.name, u.department) as department_name, 
                    COALESCE(des.name, u.designation) as designation_name,
                    b.name as branch_name
                FROM payroll_items pi
                JOIN users u ON pi.user_id = u.id
                JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
                LEFT JOIN departments d ON u.department = d.id
                LEFT JOIN designations des ON u.designation = des.id
                LEFT JOIN branches b ON u.branch = b.id
                WHERE (u.company = ? OR ? IS NULL)
                  AND (pr.period_start >= ? OR ? IS NULL)
                  AND (pr.period_end <= ? OR ? IS NULL)
                  AND (u.branch = ? OR ? IS NULL)
                  AND (u.department = ? OR ? IS NULL)
                ORDER BY pi.gross_salary DESC
            `, [
                company_id || null, company_id || null,
                startDate || null, startDate || null,
                endDate || null, endDate || null,
                branch || null, branch || null,
                department || null, department || null
            ]);

            // 2. Fetch PF/ESI Trend for last 6 months
            const d = new Date();
            d.setMonth(d.getMonth() - 6);
            const sixMonthsAgo = formatDateStr(d);
            const [trendRows] = await pool.execute(`
                SELECT 
                    DATE_FORMAT(pr.period_start, '%b %Y') as monthName,
                    SUM(pi.epf_deduction) as pfEmployee,
                    SUM(pi.employer_epfo_deduction) as pfEmployer,
                    SUM(pi.esi_deduction) as esiEmployee,
                    SUM(pi.esi_deduction * 4.3) as esiEmployer -- Approximate 3.25/0.75 ratio if not stored
                FROM payroll_items pi
                JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
                JOIN users u ON pi.user_id = u.id
                WHERE (u.company = ? OR ? IS NULL)
                  AND pr.period_start >= ?
                GROUP BY monthName, pr.period_start
                ORDER BY pr.period_start ASC
            `, [company_id || null, company_id || null, sixMonthsAgo]);

            // 3. Fetch Reimbursement Report (by status and type)
            const [reimRows] = await pool.execute(`
                SELECT 
                    r.status,
                    r.category as type,
                    SUM(r.amount) as totalAmount,
                    COUNT(*) as count
                FROM reimbursements r
                JOIN users u ON r.user_id = u.id
                WHERE (u.company = ? OR ? IS NULL)
                  AND (r.date >= ? OR ? IS NULL)
                  AND (r.date <= ? OR ? IS NULL)
                GROUP BY r.status, r.category
            `, [company_id || null, company_id || null, startDate || null, startDate || null, endDate || null, endDate || null]);

            // 4. Fetch Advances (Loan Tracker)
            const [advRows] = await pool.execute(`
                SELECT 
                    u.employee_name,
                    u.emp_id,
                    COUNT(*) as advance_count,
                    SUM(ads.amount) as total_advance,
                    0 as total_repaid
                FROM advance_salary ads
                JOIN users u ON ads.user_id = u.id
                WHERE (u.company = ? OR ? IS NULL)
                  AND ads.status = 'Approved'
                  AND (ads.request_date >= ? OR ? IS NULL)
                GROUP BY u.id, u.employee_name, u.emp_id
            `, [company_id || null, company_id || null, startDate || null, startDate || null]);

            // Aggregation by user (current range)
            const userAggregated = {};
            const genderStats = { MALE: { gross: 0, count: 0 }, FEMALE: { gross: 0, count: 0 }, OTHER: { gross: 0, count: 0 } };

            baseItems.forEach(item => {
                const uid = item.user_id;
                if (!userAggregated[uid]) {
                    userAggregated[uid] = { ...item, total_gross: 0, total_net: 0, total_deductions: 0, count: 0 };
                }
                userAggregated[uid].total_gross += parseFloat(item.gross_salary) || 0;
                userAggregated[uid].total_net += parseFloat(item.net_salary) || 0;
                userAggregated[uid].total_deductions += (parseFloat(item.epf_deduction) || 0) + (parseFloat(item.esi_deduction) || 0) + (parseFloat(item.pt_deduction) || 0) + (parseFloat(item.lop_amount) || 0) + (parseFloat(item.other_deductions) || 0);
                userAggregated[uid].count += 1;

                const g = (item.gender || 'OTHER').toUpperCase();
                if (genderStats[g]) {
                    genderStats[g].gross += parseFloat(item.net_salary) || 0;
                    genderStats[g].count += 1;
                }
            });

            const aggregatedList = Object.values(userAggregated);

            // Gender Pay Gap Calculation
            const payEquity = Object.entries(genderStats).map(([gender, data]) => ({
                gender,
                avgNet: data.count > 0 ? (data.gross / data.count) : 0
            }));

            res.json({
                topEarners: [...aggregatedList].sort((a, b) => b.total_gross - a.total_gross).slice(0, 5),
                topDeductions: [...aggregatedList].sort((a, b) => b.total_deductions - a.total_deductions).slice(0, 5),
                holds: baseItems.filter(item => item.is_hold === 1),
                allItems: aggregatedList,
                pfEsiTrend: trendRows,
                reimbursementReport: reimRows,
                loanTracker: advRows,
                payEquity
            });

        } catch (error) {
            console.error('Error in getAnalytics:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // Get employees with payroll calculations for a specific payroll run
    getPayrollEmployees: async (req, res) => {
        try {
            const { id } = req.params;

            // 1. Get payroll run details
            const [runRows] = await pool.execute('SELECT * FROM payroll_runs WHERE id = ?', [id || null]);
            if (!runRows || runRows.length === 0) return res.status(404).json({ error: 'Payroll run not found' });
            const payrollRun = runRows[0];

            // 2. If completed, return from payroll_items
            if (payrollRun.status === 'Completed') {
                const [itemRows] = await pool.execute(`
                    SELECT 
                        pi.id, pi.user_id, pi.employee_name as name, pi.emp_id, 
                        COALESCE(pi.department, d.name, u.department) as department, 
                        COALESCE(pi.designation, des.name, u.designation) as designation,
                        pi.base_salary as salary, pi.paid_days as paidDays, pi.absent_days as absentDays,
                        pi.gross_salary as gross, pi.lop_amount as lop, pi.epf_deduction as epf,
                        pi.esi_deduction as esi, pi.pt_deduction as pt, pi.other_deductions,
                        pi.bonus_incentives as variable, pi.net_salary as net,
                        pi.hra, pi.conveyance, pi.medical, pi.special, pi.other,
                        pi.cl_used, pi.permission_used, pi.employer_epfo_deduction as employer_epfo,
                        pi.variable_pay, pi.travel_allowance_pay, pi.per_diem, pi.bank_ac_no, pi.pf_no,
                        pi.earnings_breakdown, pi.deductions_breakdown,
                        pi.is_hold
                    FROM payroll_items pi
                    LEFT JOIN users u ON pi.user_id = u.id
                    LEFT JOIN departments d ON u.department = d.id
                    LEFT JOIN designations des ON u.designation = des.id
                    WHERE pi.payroll_run_id = ?
                `, [id || null]);

                // For historical compatibility, parse strings to numbers and add structure
                const enrichedItems = itemRows.map(item => {
                    const epfVal = Number(item.epf || 0);
                    const esiVal = Number(item.esi || 0);
                    const ptVal = Number(item.pt || 0);
                    const otherDeductions = Number(item.other_deductions || 0);

                    const resObj = {
                        ...item,
                        salary: Number(item.salary || 0),
                        fullSalary: Number(item.salary || 0),
                        paidDays: Number(item.paidDays || 0),
                        absentDays: Number(item.absentDays || 0),
                        gross: Number(item.gross || 0),
                        lop: Number(item.lop || 0),
                        epf: epfVal,
                        esi: esiVal,
                        pt: ptVal,
                        other_deductions: otherDeductions,
                        deductions: epfVal + esiVal + ptVal + otherDeductions,
                        variable: Number(item.variable_pay || item.variable || 0),
                        travel: Number(item.travel_allowance_pay || 0),
                        travel_allowance: Number(item.travel_allowance_pay || 0),
                        employer_epfo: Number(item.employer_epfo || 0),
                        net: Number(item.net || 0),
                        hra: Number(item.hra || 0),
                        conveyance: Number(item.conveyance || 0),
                        medical: Number(item.medical || 0),
                        special: Number(item.special || 0),
                        other: Number(item.other || 0),
                        per_diem: Number(item.per_diem || 0),
                        perDiem: Number(item.per_diem || 0),
                        cl_used: Number(item.cl_used || 0),
                        permission_used: Number(item.permission_used || 0),
                        earnings_breakdown: typeof item.earnings_breakdown === 'string' ? JSON.parse(item.earnings_breakdown) : (item.earnings_breakdown || {}),
                        deductions_breakdown: typeof item.deductions_breakdown === 'string' ? JSON.parse(item.deductions_breakdown) : (item.deductions_breakdown || {}),
                        structure: payrollRun.batch_name || 'Standard'
                    };

                    const earnings = resObj.earnings_breakdown || {};
                    const deductions = resObj.deductions_breakdown || {};

                    const getVal = (obj, names) => {
                        for (const n of names) {
                            const found = Object.keys(obj).find(k => k.toLowerCase() === n.toLowerCase());
                            if (found) return Number(obj[found] || 0);
                        }
                        return 0;
                    };

                    resObj.it = getVal(deductions, ['IT', 'Income Tax']);
                    resObj.vpf = getVal(deductions, ['VPF', 'Voluntary PF']);
                    if (!resObj.other) resObj.other = getVal(earnings, ['Other', 'Other Allowance', 'Other Earnings']);
                    if (!resObj.salary) resObj.salary = getVal(earnings, ['Basic', 'BASIC']);
                    if (!resObj.incentives) resObj.incentives = getVal(earnings, ['Incentive', 'Incentives']);

                    return resObj;
                });

                // Calculate days for display in summary cards
                const { isWeekOff } = require('./attendanceController');
                const start = new Date(payrollRun.period_start);
                const end = new Date(payrollRun.period_end);

                const allDates = getDateRange(start, end);
                const totalCalendarDays = allDates.length;

                const weekOffResults = await Promise.all(allDates.map(date => isWeekOff(null, payrollRun.company_id, date)));
                const weekOffs = weekOffResults.filter(Boolean).length;

                const workingDays = totalCalendarDays - weekOffs;

                return res.json({
                    payrollRun,
                    totalEmployees: enrichedItems.length,
                    totalAmount: parseFloat(payrollRun.total_amount),
                    workingDays,
                    totalCalendarDays,
                    employees: enrichedItems,
                    isHistorical: true
                });
            }

            // 3. Fallback to calculation if active/not completed
            const companyId = payrollRun.company_id;
            const batchAllocationId = payrollRun.batch_allocation_id;

            let employees = [];
            if (batchAllocationId) {
                const BatchAllocation = require('../models/salaryStructureModel');
                employees = await BatchAllocation.getAssignedUsers(batchAllocationId);
                if (employees.length === 0) {
                    const users = await User.getAll();
                    employees = companyId ? users.filter(u => String(u.company) === String(companyId)) : users;
                }
            } else {
                const users = await User.getAll();
                employees = companyId ? users.filter(u => String(u.company) === String(companyId)) : users;
            }

            const calculation = await payrollRunController.calculatePayrollInternal(payrollRun, employees);

            // Fetch holds for this run
            const [holdRows] = await pool.execute('SELECT user_id FROM payroll_holds WHERE payroll_run_id = ?', [id || null]);
            const holdUserIds = new Set(holdRows.map(h => h.user_id));

            const employeesWithHolds = calculation.payrollEmployees.map(emp => ({
                ...emp,
                is_hold: holdUserIds.has(emp.user_id)
            }));

            res.json({
                payrollRun,
                workingDays: calculation.workingDays,
                totalCalendarDays: calculation.totalCalendarDays,
                totalEmployees: calculation.payrollEmployees.length,
                totalAmount: parseFloat(calculation.totalAmount.toFixed(2)),
                employees: employeesWithHolds
            });

        } catch (error) {
            console.error('Error in getPayrollEmployees:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // Finalize payroll: Snapshot all values into items table and mark as completed
    finalize: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { id } = req.params;
            await connection.beginTransaction();

            // 1. Get run details
            const [runRows] = await connection.execute('SELECT * FROM payroll_runs WHERE id = ?', [id || null]);
            if (!runRows || runRows.length === 0) throw new Error('Run not found');
            const payrollRun = runRows[0];
            if (payrollRun.status === 'Completed') throw new Error('Already finalized');

            // 2. Fetch users and calculate
            const BatchAllocation = require('../models/salaryStructureModel');
            let employees = await BatchAllocation.getAssignedUsers(payrollRun.batch_allocation_id);
            if (employees.length === 0) {
                const [users] = await connection.execute(`
                    SELECT u.*, d.name as department_name, des.name as designation_name
                    FROM users u
                    LEFT JOIN departments d ON u.department = d.id
                    LEFT JOIN designations des ON u.designation = des.id
                    WHERE u.company = ?
                `, [payrollRun.company_id || null]);
                employees = users.map(u => ({
                    ...u,
                    department_name: u.department_name || u.department,
                    designation_name: u.designation_name || u.designation
                }));
            }

            const calculation = await payrollRunController.calculatePayrollInternal(payrollRun, employees);

            // 3. Clear existing items (if any re-finalization attempt)
            await connection.execute('DELETE FROM payroll_items WHERE payroll_run_id = ?', [id || null]);

            // 4. Save items
            // Get current holds
            const [holdRows] = await connection.execute('SELECT user_id FROM payroll_holds WHERE payroll_run_id = ?', [id || null]);
            const holdUserIds = new Set(holdRows.map(h => h.user_id));

            for (const emp of calculation.payrollEmployees) {
                const isHold = holdUserIds.has(emp.user_id) ? 1 : 0;
                await connection.execute(`
                    INSERT INTO payroll_items (
                        payroll_run_id, user_id, employee_name, emp_id,
                        department, designation, base_salary, paid_days,
                        absent_days, gross_salary, lop_amount, epf_deduction,
                        esi_deduction, pt_deduction, net_salary,
                        hra, conveyance, medical, special, other,
                        cl_used, permission_used, employer_epfo_deduction, variable_pay, travel_allowance_pay, per_diem,
                        other_deductions,
                        earnings_breakdown, deductions_breakdown,
                        is_hold
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    id || null, emp.user_id || null, emp.name || null, emp.emp_id || null,
                    emp.department || null, emp.designation || null, emp.salary || 0, emp.paidDays || 0,
                    emp.absentDays || 0, emp.gross || 0, emp.lop || 0, emp.epf || 0,
                    emp.esi || 0, emp.pt || 0, emp.net || 0,
                    emp.hra || 0, emp.conveyance || 0, emp.medical || 0, emp.special || 0, emp.other || 0,
                    emp.cl_used || 0, emp.permission_used || 0, emp.employer_epfo || 0, emp.variable || 0, emp.travel || 0, emp.perDiem || 0,
                    emp.other_deductions || 0,
                    JSON.stringify(emp.earnings_breakdown || {}),
                    JSON.stringify(emp.deductions_breakdown || {}),
                    isHold
                ]);
            }

            // 5. Update run status
            await connection.execute(`
                UPDATE payroll_runs 
                SET status = 'Completed', 
                    total_amount = ?, 
                    processed_employees = ?,
                    total_employees = ?
                WHERE id = ?
            `, [calculation.totalAmount, calculation.payrollEmployees.length, calculation.payrollEmployees.length, id || null]);

            await connection.commit();

            // 6. Send emails to employees asynchronously
            const company = await Organization.getCompanyById(payrollRun.company_id);
            payrollRunController.sendEmailsToEmployees(calculation.payrollEmployees, payrollRun, company);

            res.json({ message: 'Payroll finalized and email sent successfully', totalAmount: calculation.totalAmount });

        } catch (error) {
            await connection.rollback();
            res.status(500).json({ error: error.message });
        } finally {
            connection.release();
        }
    },

    // Helper: Send emails to all employees in a payroll run
    sendEmailsToEmployees: async (payrollEmployees, payrollRun, company) => {
        console.log(`Starting email delivery for ${payrollEmployees.length} employees...`);

        for (const emp of payrollEmployees) {
            if (!emp.official_email) {
                console.log(`Skipping email for ${emp.name} (no email address found)`);
                continue;
            }

            try {
                const monthName = new Date(payrollRun.period_start).toLocaleString('default', { month: 'long', year: 'numeric' });
                const subject = `Payslip for ${monthName} - ${emp.name}`;

                // Generate PDF Buffer
                const pdfBuffer = await generatePayslipPDF({
                    company,
                    employee: emp,
                    payrollRun
                });

                await sendEmail({
                    to: emp.official_email,
                    subject,
                    html: ``,
                    attachments: [
                        {
                            filename: `Payslip_${emp.name.replace(/\s+/g, '_')}_${monthName.replace(/\s+/g, '_')}.pdf`,
                            content: pdfBuffer
                        }
                    ]
                });
                console.log(`Payslip email with PDF attachment sent to ${emp.official_email}`);
            } catch (err) {
                console.error(`Failed to send email to ${emp.official_email}:`, err.message);
            }
        }
    },

    getMyPayslips: async (req, res) => {
        try {
            const userId = req.user.id;
            const [rows] = await pool.execute(`
                SELECT 
                    pi.*, 
                    pr.period_start, pr.period_end, pr.batch_name
                FROM payroll_items pi
                JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
                WHERE pi.user_id = ? AND pr.status = 'Completed' AND pi.is_hold = 0
                ORDER BY pr.period_start DESC
            `, [userId]);

            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    downloadPayslip: async (req, res) => {
        try {
            const { itemId } = req.params;
            const userId = req.user.id;

            // 1. Get payroll item details
            const [itemRows] = await pool.execute(`
                SELECT pi.*, pr.period_start, pr.period_end, pr.company_id
                FROM payroll_items pi
                JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
                WHERE pi.id = ? AND (pi.user_id = ? OR ? = 'admin' OR ? = 'superadmin')
            `, [itemId, userId, req.user.role, req.user.role]);

            if (!itemRows || itemRows.length === 0) {
                return res.status(404).json({ error: 'Payslip not found or unauthorized' });
            }

            const item = itemRows[0];
            const company = await Organization.getCompanyById(item.company_id);

            // 2. Generate PDF
            const pdfBuffer = await generatePayslipPDF({
                company,
                employee: {
                    ...item,
                    name: item.employee_name,
                    salary: item.base_salary,
                    gross: item.gross_salary,
                    net: item.net_salary,
                    epf: item.epf_deduction,
                    esi: item.esi_deduction,
                    pt: item.pt_deduction,
                    it: item.it_deduction || 0,
                    vpf: item.vpf_deduction || 0,
                    lop: item.lop_amount,
                    travel: item.travel_allowance_pay || 0,
                    variable: item.variable_pay || 0,
                    employer_epfo: item.employer_epfo_deduction || 0,
                    paidDays: item.paid_days,
                    absentDays: item.absent_days
                },
                payrollRun: {
                    period_start: item.period_start,
                    period_end: item.period_end
                }
            });

            const monthName = new Date(item.period_start).toLocaleString('default', { month: 'long', year: 'numeric' });
            const filename = `Payslip_${item.employee_name.replace(/\s+/g, '_')}_${monthName.replace(/\s+/g, '_')}.pdf`;

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
            res.send(pdfBuffer);
        } catch (error) {
            console.error('Error downloading payslip:', error);
            res.status(500).json({ error: error.message });
        }
    },

    generateReport: async (req, res) => {
        try {
            const ExcelJS = require('exceljs');
            const { month, year, departments, academicYears, employmentTypes, reportType, format } = req.query;

            const reportTitles = {
                'salary-register': 'Salary Register',
                'payslip-batch': 'Payslip Batch Report',
                'bonus-summary': 'Bonus & Incentives Summary',
                'tax-summary': 'Tax & Statutory Deductions',
                'bank-advice': 'Bank Advice Statement',
                'annual-report': 'Annual Payroll Summary'
            };

            const displayTitle = reportTitles[reportType] || 'Payroll Report';

            // 1. Build Query
            let query = `
                SELECT 
                    pi.*, 
                    u.employee_name, u.emp_id, u.off_mail_id as email, u.gender, u.doj,
                    u.bank_ac_no, u.ifsc, u.pan, u.pf as u_pf_no, u.esi, u.blood_group,
                    pr.batch_name, pr.period_start, pr.period_end,
                    d.name as department_name, des.name as designation_name,
                    b.name as branch_name
                FROM payroll_items pi
                JOIN users u ON pi.user_id = u.id
                JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
                LEFT JOIN departments d ON u.department = d.id
                LEFT JOIN designations des ON u.designation = des.id
                LEFT JOIN branches b ON u.branch = b.id
                WHERE pr.status = 'Completed'
            `;

            const params = [];

            const getQueryParam = (name) => req.query[name] || req.query[`${name}[]`];
            const deptParams = getQueryParam('departments');
            const empTypeParams = getQueryParam('employmentTypes');

            if (month && year) {
                query += ' AND ((MONTH(pr.period_start) = ? AND YEAR(pr.period_start) = ?) OR (MONTH(pr.period_end) = ? AND YEAR(pr.period_end) = ?))';
                params.push(month, year, month, year);
            }

            if (deptParams) {
                const deptArray = Array.isArray(deptParams) ? deptParams : deptParams.split(',');
                const branchIds = deptArray.filter(id => typeof id === 'string' && id.startsWith('branch-')).map(id => id.replace('branch-', ''));
                const actualDeptIds = deptArray.filter(id => typeof id !== 'string' || !id.startsWith('branch-'));

                const orgConditions = [];
                if (branchIds.length > 0) {
                    orgConditions.push(`u.branch IN (${branchIds.map(() => '?').join(',')})`);
                    params.push(...branchIds);
                }
                if (actualDeptIds.length > 0) {
                    orgConditions.push(`d.id IN (${actualDeptIds.map(() => '?').join(',')})`);
                    params.push(...actualDeptIds);
                }
                if (orgConditions.length > 0) {
                    query += ` AND (${orgConditions.join(' OR ')})`;
                }
            }

            if (empTypeParams) {
                const typeArray = Array.isArray(empTypeParams) ? empTypeParams : empTypeParams.split(',');
                if (typeArray.length > 0) {
                    query += ` AND u.employment_type IN (${typeArray.map(() => '?').join(',')})`;
                    params.push(...typeArray);
                }
            }

            const academicYearParams = getQueryParam('academicYears');
            if (academicYearParams) {
                const yearArray = Array.isArray(academicYearParams) ? academicYearParams : academicYearParams.split(',');
                if (yearArray.length > 0) {
                    // Logic for academic year filter (e.g. against u.duration or DOJ)
                    // For now, only filter if those years match the period_start year or similar
                    // But we already have month and year params which are more specific.
                }
            }

            const [items] = await pool.execute(query, params);
            console.log(`Found ${items.length} records for report.`);

            if (!items || items.length === 0) {
                return res.status(404).json({ message: 'No payroll records found for the selected month/year.' });
            }

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Payroll Report');

            // 2. Define Columns based on Report Type
            let columns = [];
            if (reportType === 'bank-advice') {
                columns = [
                    { header: 'Emp ID', key: 'emp_id', width: 12 },
                    { header: 'Employee Name', key: 'employee_name', width: 25 },
                    { header: 'Account Number', key: 'bank_ac_no', width: 25 },
                    { header: 'IFSC Code', key: 'ifsc', width: 15 },
                    { header: 'Net Salary', key: 'net_salary', width: 15 },
                    { header: 'Status', key: 'is_hold', width: 12 }
                ];
            } else if (reportType === 'tax-summary') {
                columns = [
                    { header: 'Emp ID', key: 'emp_id', width: 12 },
                    { header: 'Employee Name', key: 'employee_name', width: 25 },
                    { header: 'PAN Number', key: 'pan', width: 15 },
                    { header: 'Gross Salary', key: 'gross_salary', width: 15 },
                    { header: 'EPF (Emp)', key: 'epf_deduction', width: 12 },
                    { header: 'ESI (Emp)', key: 'esi_deduction', width: 12 },
                    { header: 'PT', key: 'pt_deduction', width: 10 },
                    { header: 'Other Deductions', key: 'other_deductions', width: 15 },
                    { header: 'Income Tax', key: 'it', width: 12 },
                    { header: 'Net Payout', key: 'net_salary', width: 15 }
                ];
            } else if (reportType === 'bonus-summary') {
                columns = [
                    { header: 'Emp ID', key: 'emp_id', width: 12 },
                    { header: 'Employee Name', key: 'employee_name', width: 25 },
                    { header: 'Dept/Branch', key: 'dept_branch', width: 25 },
                    { header: 'Variable Pay', key: 'variable_pay', width: 15 },
                    { header: 'Bonus', key: 'bonus', width: 12 },
                    { header: 'Incentives', key: 'incentive', width: 12 },
                    { header: 'Arrears', key: 'arrears', width: 12 },
                    { header: 'Gross Salary', key: 'gross_salary', width: 15 }
                ];
            } else if (reportType === 'annual-report' || reportType === 'annual-summary') {
                columns = [
                    { header: 'Emp ID', key: 'emp_id', width: 10 },
                    { header: 'Employee Name', key: 'employee_name', width: 20 },
                    { header: 'Period', key: 'period', width: 25 },
                    { header: 'Yearly Gross', key: 'gross_salary', width: 15 },
                    { header: 'Yearly Ded.', key: 'deductions', width: 15 },
                    { header: 'Yearly IT', key: 'it', width: 12 },
                    { header: 'Yearly Net', key: 'net_salary', width: 15 }
                ];
            } else if (reportType === 'payslip-batch') {
                columns = [
                    { header: 'Emp ID', key: 'emp_id', width: 12 },
                    { header: 'Employee Name', key: 'employee_name', width: 25 },
                    { header: 'Email', key: 'email', width: 25 },
                    { header: 'Net Salary', key: 'net_salary', width: 15 },
                    { header: 'Account No', key: 'bank_ac_no', width: 20 },
                    { header: 'DOJ', key: 'doj', width: 15 }
                ];
            } else {
                // Default Salary Register
                columns = [
                    { header: 'Emp ID', key: 'emp_id', width: 10 },
                    { header: 'Employee Name', key: 'employee_name', width: 20 },
                    { header: 'Dept/Branch', key: 'dept_branch', width: 25 },
                    { header: 'Paid Days', key: 'paid_days', width: 10 },
                    { header: 'Basic', key: 'base_salary', width: 12 },
                    { header: 'HRA', key: 'hra', width: 12 },
                    { header: 'Conveyance', key: 'conveyance', width: 12 },
                    { header: 'Allowance', key: 'special', width: 12 },
                    { header: 'Variable', key: 'variable_pay', width: 12 },
                    { header: 'Gross', key: 'gross_salary', width: 15 },
                    { header: 'LOP', key: 'lop_amount', width: 10 },
                    { header: 'Total Ded.', key: 'deductions', width: 15 },
                    { header: 'Net Salary', key: 'net_salary', width: 15 }
                ];
            }

            const reportTypeLabels = {
                'salary-register': 'Salary Register',
                'payslip-batch': 'Payslip Batch Report',
                'bonus-summary': 'Bonus & Incentives Report',
                'tax-summary': 'Tax & Deductions Report',
                'bank-advice': 'Bank Advice',
                'annual-report': 'Annual Summary',
                'annual-summary': 'Annual Summary'
            };

            const maxColLetter = String.fromCharCode(64 + columns.length);

            // 3. Styling - Main Title
            worksheet.mergeCells(`A1:${maxColLetter}1`);
            const titleCell = worksheet.getCell('A1');
            const displayTitleFull = reportTypeLabels[reportType] || 'Payroll Report';
            titleCell.value = `${displayTitleFull.toUpperCase()} - ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`;
            titleCell.font = { name: 'Arial Black', size: 16, color: { argb: 'FFFFFFFF' } };
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF41398B' } };
            titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
            worksheet.getRow(1).height = 40;

            // Info Row
            worksheet.mergeCells(`A2:${maxColLetter}2`);
            const infoCell = worksheet.getCell('A2');
            infoCell.value = `Generated on: ${new Date().toLocaleString()} | Total Records: ${items.length}`;
            infoCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
            infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
            worksheet.getRow(2).height = 25;

            // Headers
            const headerRow = worksheet.addRow(columns.map(c => c.header));
            headerRow.eachCell((cell) => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5C52C7' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            worksheet.getRow(3).height = 25;

            // 4. Populate Data
            items.forEach((item, index) => {
                let rowData = [];
                const deductionsBreakdown = typeof item.deductions_breakdown === 'string' ? JSON.parse(item.deductions_breakdown) : (item.deductions_breakdown || {});
                const earningsBreakdown = typeof item.earnings_breakdown === 'string' ? JSON.parse(item.earnings_breakdown) : (item.earnings_breakdown || {});

                const itVal = deductionsBreakdown['IT'] || deductionsBreakdown['Income Tax'] || 0;
                const bonusVal = earningsBreakdown['Bonus'] || earningsBreakdown['Performance Bonus'] || 0;
                const incentiveVal = earningsBreakdown['Incentive'] || earningsBreakdown['Sales Incentive'] || 0;
                const arrearsVal = earningsBreakdown['Arrears'] || 0;

                if (reportType === 'bank-advice') {
                    rowData = [
                        item.emp_id,
                        item.employee_name,
                        item.bank_ac_no || 'N/A',
                        item.ifsc || 'N/A',
                        parseFloat(item.net_salary),
                        item.is_hold ? 'HOLD' : 'ACTIVE'
                    ];
                } else if (reportType === 'tax-summary') {
                    rowData = [
                        item.emp_id,
                        item.employee_name,
                        item.pan || 'N/A',
                        parseFloat(item.gross_salary),
                        parseFloat(item.epf_deduction),
                        parseFloat(item.esi_deduction),
                        parseFloat(item.pt_deduction),
                        parseFloat(item.other_deductions),
                        parseFloat(itVal),
                        parseFloat(item.net_salary)
                    ];
                } else if (reportType === 'bonus-summary') {
                    rowData = [
                        item.emp_id,
                        item.employee_name,
                        `${item.designation_name} / ${item.branch_name}`,
                        parseFloat(item.variable_pay),
                        parseFloat(bonusVal),
                        parseFloat(incentiveVal),
                        parseFloat(arrearsVal),
                        parseFloat(item.gross_salary)
                    ];
                } else if (reportType === 'annual-report' || reportType === 'annual-summary') {
                    rowData = [
                        item.emp_id,
                        item.employee_name,
                        `${new Date(item.period_start).toLocaleDateString()} - ${new Date(item.period_end).toLocaleDateString()}`,
                        parseFloat(item.gross_salary),
                        parseFloat(item.deductions),
                        parseFloat(itVal),
                        parseFloat(item.net_salary)
                    ];
                } else if (reportType === 'payslip-batch') {
                    rowData = [
                        item.emp_id,
                        item.employee_name,
                        item.email || 'N/A',
                        parseFloat(item.net_salary),
                        item.bank_ac_no || 'N/A',
                        item.doj ? new Date(item.doj).toLocaleDateString() : 'N/A'
                    ];
                } else {
                    rowData = [
                        item.emp_id,
                        item.employee_name,
                        `${item.department_name || ''} / ${item.branch_name || ''}`,
                        parseFloat(item.paid_days),
                        parseFloat(item.base_salary),
                        parseFloat(item.hra),
                        parseFloat(item.conveyance),
                        parseFloat(item.special),
                        parseFloat(item.variable_pay),
                        parseFloat(item.gross_salary),
                        parseFloat(item.lop_amount),
                        parseFloat(item.epf_deduction) + parseFloat(item.esi_deduction) + parseFloat(item.pt_deduction) + parseFloat(item.other_deductions) + parseFloat(item.lop_amount),
                        parseFloat(item.net_salary)
                    ];
                }

                const row = worksheet.addRow(rowData);
                row.eachCell((cell, colNum) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                    };
                    cell.alignment = { vertical: 'middle', horizontal: colNum <= 2 ? 'left' : 'center' };
                    cell.font = { name: 'Arial', size: 10 };

                    if (index % 2 === 0) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                    }
                });
            });

            // Footer Totals
            const totalRow = worksheet.addRow([]);
            const startCol = reportType === 'bank-advice' ? 6 : (reportType === 'tax-summary' ? 4 : 5);

            for (let i = startCol; i <= columns.length; i++) {
                const colLetter = String.fromCharCode(64 + i);
                const cell = totalRow.getCell(i);
                cell.value = { formula: `SUM(${colLetter}4:${colLetter}${items.length + 3})` };
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                cell.border = { top: { style: 'double' }, bottom: { style: 'thin' } };
                cell.alignment = { horizontal: 'center' };
            }
            totalRow.getCell(startCol - 1).value = 'TOTALS';
            totalRow.getCell(startCol - 1).font = { bold: true };

            // Set Column Widths
            worksheet.columns = columns.map(c => ({ width: c.width }));

            // 5. Final Output based on Format
            if (format === 'pdf') {
                const puppeteer = require('puppeteer');
                const htmlContent = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            @page { size: A4 landscape; margin: 10mm; }
                            body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; color: #1e293b; }
                            .header { text-align: center; background: #41398B; color: white; padding: 25px; border-radius: 8px 8px 0 0; }
                            .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
                            .info-bar { background: #f8fafc; text-align: center; padding: 12px; border-bottom: 2px solid #e2e8f0; font-size: 11px; color: #64748b; font-style: italic; }
                            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10px; }
                            th { background: #5C52C7; color: white; padding: 10px 5px; border: 1px solid #4a42a0; }
                            td { padding: 8px 5px; border: 1px solid #e2e8f0; text-align: center; }
                            tr:nth-child(even) { background: #f8fafc; }
                            .totals-row { font-weight: bold; background: #f1f5f9 !important; }
                            .status-active { color: #059669; font-weight: bold; }
                            .status-hold { color: #dc2626; font-weight: bold; }
                            .footer { margin-top: 30px; text-align: right; font-size: 10px; color: #94a3b8; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>${displayTitleFull}</h1>
                            <div style="font-size: 14px; margin-top: 5px; opacity: 0.9;">
                                ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}
                            </div>
                        </div>
                        <div class="info-bar">
                            Generated on: ${new Date().toLocaleString()} | Total Records: ${items.length}
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    ${columns.map(c => `<th>${c.header}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map((item, idx) => {
                    const rowData = [];
                    const dBrk = typeof item.deductions_breakdown === 'string' ? JSON.parse(item.deductions_breakdown) : (item.deductions_breakdown || {});
                    const eBrk = typeof item.earnings_breakdown === 'string' ? JSON.parse(item.earnings_breakdown) : (item.earnings_breakdown || {});

                    const itVal = dBrk['IT'] || dBrk['Income Tax'] || 0;
                    const bonusVal = eBrk['Bonus'] || eBrk['Performance Bonus'] || 0;
                    const incentiveVal = eBrk['Incentive'] || eBrk['Sales Incentive'] || 0;
                    const arrearsVal = eBrk['Arrears'] || 0;

                    let vals = [];
                    if (reportType === 'bank-advice') {
                        vals = [item.emp_id, item.employee_name, item.bank_ac_no || '-', item.ifsc || '-', item.net_salary, item.is_hold ? 'HOLD' : 'ACTIVE'];
                    } else if (reportType === 'tax-summary') {
                        vals = [item.emp_id, item.employee_name, item.pan || '-', item.gross_salary, item.epf_deduction, item.esi_deduction, item.pt_deduction, item.other_deductions, itVal, item.net_salary];
                    } else if (reportType === 'bonus-summary') {
                        vals = [item.emp_id, item.employee_name, `${item.designation_name} / ${item.branch_name}`, item.variable_pay, bonusVal, incentiveVal, arrearsVal, item.gross_salary];
                    } else if (reportType === 'payslip-batch') {
                        vals = [item.emp_id, item.employee_name, item.email || '-', item.net_salary, item.bank_ac_no || '-', item.doj ? new Date(item.doj).toLocaleDateString() : '-'];
                    } else if (reportType === 'annual-report' || reportType === 'annual-summary') {
                        vals = [item.emp_id, item.employee_name, `${new Date(item.period_start).toLocaleDateString()} - ${new Date(item.period_end).toLocaleDateString()}`, item.gross_salary, item.deductions, itVal, item.net_salary];
                    } else {
                        vals = [item.emp_id, item.employee_name, `${item.designation_name} / ${item.branch_name}`, item.paid_days || 0, item.base_salary, item.hra, item.conveyance, item.special, item.variable_pay, item.gross_salary, item.lop_amount, item.deductions, item.net_salary];
                    }
                    return `<tr>${vals.map(v => `<td>${typeof v === 'number' ? v.toFixed(2) : v}</td>`).join('')}</tr>`;
                }).join('')}
                                <tr class="totals-row">
                                    <td colspan="${reportType === 'bank-advice' ? 4 : (reportType === 'tax-summary' ? 3 : (reportType === 'payslip_batch' ? 3 : 3))}" style="text-align: right; padding-right: 20px;">TOTALS</td>
                                    ${reportType === 'bank-advice' ? `<td>${items.reduce((sum, i) => sum + parseFloat(i.net_salary || 0), 0).toFixed(2)}</td><td></td>` : ''}
                                    ${reportType === 'tax-summary' ? `<td>${items.reduce((sum, i) => sum + parseFloat(i.gross_salary || 0), 0).toFixed(2)}</td><td>${items.reduce((sum, i) => sum + parseFloat(i.epf_deduction || 0), 0).toFixed(2)}</td><td>${items.reduce((sum, i) => sum + parseFloat(i.esi_deduction || 0), 0).toFixed(2)}</td><td>${items.reduce((sum, i) => sum + parseFloat(i.pt_deduction || 0), 0).toFixed(2)}</td><td>${items.reduce((sum, i) => sum + parseFloat(i.other_deductions || 0), 0).toFixed(2)}</td><td>${items.reduce((sum, i) => { const d = typeof i.deductions_breakdown === 'string' ? JSON.parse(i.deductions_breakdown) : (i.deductions_breakdown || {}); return sum + parseFloat(d['IT'] || d['Income Tax'] || 0); }, 0).toFixed(2)}</td><td>${items.reduce((sum, i) => sum + parseFloat(i.net_salary || 0), 0).toFixed(2)}</td>` : ''}
                                    ${(!['bank-advice', 'tax-summary'].includes(reportType)) ? `<td colspan="${columns.length - 3}">Totals calculations summarized in Excel</td>` : ''}
                                </tr>
                            </tbody>
                        </table>
                        <div class="footer">
                            Powered by HRM Portal Management System | Page 1 of 1
                        </div>
                    </body>
                    </html>
                `;

                const browser = await puppeteer.launch({
                    headless: 'new',
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
                const page = await browser.newPage();
                await page.setContent(htmlContent);
                const pdfBuffer = await page.pdf({
                    format: 'A4',
                    landscape: true,
                    printBackground: true
                });
                await browser.close();

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=Payroll_Report_${reportType}_${new Date().getTime()}.pdf`);
                res.send(pdfBuffer);
            } else {
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=Payroll_Report_${reportType}_${new Date().getTime()}.xlsx`);
                await workbook.xlsx.write(res);
                res.end();
            }

        } catch (error) {
            console.error('Error generating payroll report:', error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = payrollRunController;
