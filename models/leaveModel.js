const { pool } = require('../Config/dbConfig');

class Leave {
    static async create(data) {
        const {
            employee_id,
            leave_type,
            start_date,
            end_date,
            reason,
            status = 'Pending',
            is_half_day = false,
            half_day_period = null,
            contact_number = null,
            applied_by = null,
            start_time = null,
            end_time = null,
            document_url = null
        } = data;

        // Find the team lead for the employee's department
        const [empRows] = await pool.execute('SELECT department FROM users WHERE id = ?', [employee_id]);
        let team_lead_id = null;

        if (empRows.length > 0 && empRows[0].department) {
            const [leadRows] = await pool.execute(
                "SELECT id FROM users WHERE department = ? AND team_lead = 'yes' LIMIT 1",
                [empRows[0].department]
            );
            if (leadRows.length > 0) {
                team_lead_id = leadRows[0].id;
            }
        }

        const [result] = await pool.execute(
            'INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason, status, is_half_day, half_day_period, contact_number, applied_by, team_lead_id, start_time, end_time, document_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                employee_id,
                leave_type,
                start_date,
                end_date,
                reason,
                status,
                is_half_day,
                half_day_period || null,
                contact_number || null,
                applied_by || null,
                team_lead_id,
                start_time || null,
                end_time || null,
                document_url || null
            ]
        );
        return result.insertId;
    }

    static async getAll(filters = {}) {
        const {
            page = 1,
            limit = 10,
            search = '',
            status,
            employee_id,
            team_lead_id,
            startDate,
            endDate,
            departments,
            leave_types,
            reporting_manager,
            personal_user_id
        } = filters;
        const offset = (page - 1) * limit;

        let query = `
            SELECT l.*, u.employee_name, u.emp_id, u.designation, u.team_lead, u.role as employee_role, u.reporting_manager,
                   d.name as department_name, b.name as branch_name,
                   a.employee_name as approved_by_name
            FROM leaves l 
            JOIN users u ON l.employee_id = u.id 
            LEFT JOIN departments d ON u.department = d.id
            LEFT JOIN branches b ON u.branch = b.id
            LEFT JOIN users a ON l.approved_by = a.id
        `;
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM leaves l 
            JOIN users u ON l.employee_id = u.id 
        `;

        const params = [];
        const conditions = ["u.role != 'superadmin'"];

        if (status && status !== 'All') {
            const statusArray = Array.isArray(status) ? status : status.split(',');
            if (statusArray.length > 0) {
                conditions.push(`l.status IN (${statusArray.map(() => '?').join(',')})`);
                params.push(...statusArray);
            }
        }
        const managerConditions = [];
        const managerParams = [];
        if (reporting_manager && personal_user_id) {
            managerConditions.push('(u.reporting_manager = ? OR FIND_IN_SET(?, u.reporting_manager) > 0 OR l.employee_id = ?)');
            managerParams.push(reporting_manager, reporting_manager, personal_user_id);
        }
        if (team_lead_id) {
            managerConditions.push('l.team_lead_id = ?');
            managerParams.push(team_lead_id);
        }

        if (managerConditions.length > 0) {
            conditions.push(`(${managerConditions.join(' OR ')})`);
            params.push(...managerParams);
        } else if (employee_id) {
            conditions.push('l.employee_id = ?');
            params.push(employee_id);
        }
        if (search) {
            const searchPattern = `%${search}%`;
            conditions.push('(u.employee_name LIKE ? OR l.leave_type LIKE ? OR u.emp_id LIKE ?)');
            params.push(searchPattern, searchPattern, searchPattern);
        }
        if (startDate && endDate) {
            conditions.push('((l.start_date <= ? AND l.end_date >= ?) OR (DATE(l.created_at) BETWEEN ? AND ?))');
            params.push(endDate, startDate, startDate, endDate);
        } else if (startDate) {
            conditions.push('(l.end_date >= ? OR DATE(l.created_at) >= ?)');
            params.push(startDate, startDate);
        } else if (endDate) {
            conditions.push('(l.start_date <= ? OR DATE(l.created_at) <= ?)');
            params.push(endDate, endDate);
        }

        // New Organization Filters
        if (departments) {
            const deptArray = Array.isArray(departments) ? departments : departments.split(',');
            const branchIds = deptArray.filter(id => typeof id === 'string' && id.startsWith('branch-')).map(id => id.replace('branch-', ''));
            const actualDeptIds = deptArray.filter(id => typeof id !== 'string' || !id.startsWith('branch-'));

            const orgConditions = [];
            if (branchIds.length > 0) {
                orgConditions.push(`u.branch IN (${branchIds.map(() => '?').join(',')})`);
                params.push(...branchIds);
            }
            if (actualDeptIds.length > 0) {
                orgConditions.push(`u.department IN (${actualDeptIds.map(() => '?').join(',')})`);
                params.push(...actualDeptIds);
            }
            if (orgConditions.length > 0) {
                conditions.push(`(${orgConditions.join(' OR ')})`);
            }
        }

        if (leave_types) {
            const typeArray = Array.isArray(leave_types) ? leave_types : leave_types.split(',');
            if (typeArray.length > 0) {
                conditions.push(`l.leave_type IN (${typeArray.map(() => '?').join(',')})`);
                params.push(...typeArray);
            }
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        const countParams = [...params];

        query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
        const finalLimit = Number.isFinite(parseInt(limit)) ? parseInt(limit) : 10;
        const finalOffset = Number.isFinite(parseInt(offset)) ? parseInt(offset) : 0;
        params.push(finalLimit, finalOffset);

        const [rows] = await pool.query(query, params);
        const [countResult] = await pool.query(countQuery, countParams);

        // Fetch counts for each status
        const countConditions = ["u.role != 'superadmin'"];
        const countQueryParams = [];

        const managerCountConditions = [];
        const managerCountParams = [];
        if (reporting_manager && personal_user_id) {
            managerCountConditions.push('(u.reporting_manager = ? OR FIND_IN_SET(?, u.reporting_manager) > 0 OR l.employee_id = ?)');
            managerCountParams.push(reporting_manager, reporting_manager, personal_user_id);
        }
        if (team_lead_id) {
            managerCountConditions.push('l.team_lead_id = ?');
            managerCountParams.push(team_lead_id);
        }

        if (managerCountConditions.length > 0) {
            countConditions.push(`(${managerCountConditions.join(' OR ')})`);
            countQueryParams.push(...managerCountParams);
        } else if (employee_id) {
            countConditions.push('l.employee_id = ?');
            countQueryParams.push(employee_id);
        }
        if (search) {
            const searchPattern = `%${search}%`;
            countConditions.push('(u.employee_name LIKE ? OR l.leave_type LIKE ? OR u.emp_id LIKE ?)');
            countQueryParams.push(searchPattern, searchPattern, searchPattern);
        }
        if (startDate) {
            countConditions.push('(l.start_date >= ? OR DATE(l.created_at) >= ?)');
            countQueryParams.push(startDate, startDate);
        }
        if (endDate) {
            countConditions.push('(l.end_date <= ? OR DATE(l.created_at) <= ?)');
            countQueryParams.push(endDate, endDate);
        }

        const countWhere = ' WHERE ' + countConditions.join(' AND ');

        const [allCounts] = await pool.query(`
            SELECT 
                COUNT(*) as all_count,
                SUM(CASE WHEN l.status = 'Approved' THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN l.status = 'Rejected' THEN 1 ELSE 0 END) as rejected_count,
                SUM(CASE WHEN l.status = 'Pending' THEN 1 ELSE 0 END) as pending_count
            FROM leaves l
            JOIN users u ON l.employee_id = u.id
            ${countWhere}
        `, countQueryParams);

        return {
            leaves: rows,
            total: countResult[0].total,
            counts: {
                all: allCounts[0].all_count,
                approved: allCounts[0].approved_count,
                rejected: allCounts[0].rejected_count,
                pending: allCounts[0].pending_count
            }
        };
    }

    static async findById(id) {
        const [rows] = await pool.execute(`
            SELECT l.*, u.employee_name, u.emp_id, u.designation, u.department, u.team_lead, u.role as employee_role,
                   a.employee_name as approved_by_name
            FROM leaves l 
            JOIN users u ON l.employee_id = u.id 
            LEFT JOIN users a ON l.approved_by = a.id
            WHERE l.id = ?
        `, [id]);
        return rows[0];
    }

    static async update(id, data) {
        const { leave_type, start_date, end_date, reason, status, is_half_day, half_day_period, contact_number, rejection_reason, start_time, end_time, approved_by } = data;
        const [result] = await pool.execute(
            'UPDATE leaves SET leave_type = ?, start_date = ?, end_date = ?, reason = ?, status = ?, is_half_day = ?, half_day_period = ?, contact_number = ?, rejection_reason = ?, start_time = ?, end_time = ?, approved_by = ? WHERE id = ?',
            [
                leave_type,
                start_date,
                end_date,
                reason,
                status,
                is_half_day || false,
                half_day_period || null,
                contact_number || null,
                rejection_reason || null,
                start_time || null,
                end_time || null,
                approved_by || null,
                id
            ]
        );
        return result.affectedRows > 0;
    }

    static async delete(id) {
        const [result] = await pool.execute('DELETE FROM leaves WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    static async getLeaveBalance(employeeId, year = null) {
        const currentYear = year || new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        // Fetch company policy for limits
        const [empRows] = await pool.execute('SELECT company FROM users WHERE id = ?', [employeeId]);
        const companyId = empRows[0]?.company;

        let monthlyClLimit = 1.0;
        let permissionLimit = 2;
        if (companyId) {
            const [policyRows] = await pool.execute('SELECT cl_limit, permission_limit FROM company_policies WHERE company_id = ?', [companyId]);
            if (policyRows.length > 0) {
                monthlyClLimit = parseFloat(policyRows[0].cl_limit) || 1.0;
                permissionLimit = parseFloat(policyRows[0].permission_limit) || 2;
            }
        }

        const annualClLimit = monthlyClLimit * 12;

        // Calculate taken leaves in current year
        const [yearLeaves] = await pool.execute(`
            SELECT leave_type, status,
                   SUM(CASE 
                       WHEN is_half_day = 1 THEN 0.5 
                       WHEN leave_type = 'Permission' THEN 0 
                       ELSE (DATEDIFF(end_date, start_date) + 1) 
                   END) as total_days,
                   COUNT(*) as count
            FROM leaves
            WHERE employee_id = ? AND YEAR(start_date) = ? AND status != 'Rejected'
            GROUP BY leave_type, status
        `, [employeeId, currentYear]);

        // Calculate taken leaves in current month
        const [monthLeaves] = await pool.execute(`
            SELECT leave_type, status,
                   SUM(CASE 
                       WHEN is_half_day = 1 THEN 0.5 
                       WHEN leave_type = 'Permission' THEN 0 
                       ELSE (DATEDIFF(end_date, start_date) + 1) 
                   END) as total_days,
                   COUNT(*) as count
            FROM leaves
            WHERE employee_id = ? AND YEAR(start_date) = ? AND MONTH(start_date) = ? AND status != 'Rejected'
            GROUP BY leave_type, status
        `, [employeeId, currentYear, currentMonth]);

        const summary = {
            employee_id: employeeId,
            year: currentYear,
            month: currentMonth,
            limits: {
                monthly_casual_leave: monthlyClLimit,
                annual_casual_leave: annualClLimit,
                permission_limit: permissionLimit
            },
            year_to_date: {
                casual_leave_taken: 0,
                sick_leave_taken: 0,
                earned_leave_taken: 0,
                lop_taken: 0,
                permissions_count: 0
            },
            current_month: {
                casual_leave_taken: 0,
                sick_leave_taken: 0,
                earned_leave_taken: 0,
                lop_taken: 0,
                permissions_count: 0
            },
            remaining: {
                annual_casual_leave: annualClLimit,
                monthly_casual_leave: monthlyClLimit
            }
        };

        yearLeaves.forEach(row => {
            const days = parseFloat(row.total_days) || 0;
            if (row.leave_type === 'Casual Leave') summary.year_to_date.casual_leave_taken += days;
            else if (row.leave_type === 'Sick Leave') summary.year_to_date.sick_leave_taken += days;
            else if (row.leave_type === 'Earned Leave') summary.year_to_date.earned_leave_taken += days;
            else if (row.leave_type === 'Loss of Pay(LOP)') summary.year_to_date.lop_taken += days;
            else if (row.leave_type === 'Permission') summary.year_to_date.permissions_count += parseInt(row.count) || 0;
        });

        monthLeaves.forEach(row => {
            const days = parseFloat(row.total_days) || 0;
            if (row.leave_type === 'Casual Leave') summary.current_month.casual_leave_taken += days;
            else if (row.leave_type === 'Sick Leave') summary.current_month.sick_leave_taken += days;
            else if (row.leave_type === 'Earned Leave') summary.current_month.earned_leave_taken += days;
            else if (row.leave_type === 'Loss of Pay(LOP)') summary.current_month.lop_taken += days;
            else if (row.leave_type === 'Permission') summary.current_month.permissions_count += parseInt(row.count) || 0;
        });

        summary.remaining.annual_casual_leave = Math.max(0, parseFloat((annualClLimit - summary.year_to_date.casual_leave_taken).toFixed(2)));
        summary.remaining.monthly_casual_leave = Math.max(0, parseFloat((monthlyClLimit - summary.current_month.casual_leave_taken).toFixed(2)));

        return summary;
    }
}

module.exports = Leave;
