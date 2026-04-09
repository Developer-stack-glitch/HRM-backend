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
            end_time = null
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
            'INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason, status, is_half_day, half_day_period, contact_number, applied_by, team_lead_id, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
                end_time || null
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
            leave_types
        } = filters;
        const offset = (page - 1) * limit;

        let query = `
            SELECT l.*, u.employee_name, u.emp_id, u.designation, u.team_lead, u.role as employee_role,
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
        if (employee_id) {
            conditions.push('l.employee_id = ?');
            params.push(employee_id);
        }
        if (team_lead_id) {
            conditions.push('l.team_lead_id = ?');
            params.push(team_lead_id);
        }
        if (search) {
            const searchPattern = `%${search}%`;
            conditions.push('(u.employee_name LIKE ? OR l.leave_type LIKE ? OR u.emp_id LIKE ?)');
            params.push(searchPattern, searchPattern, searchPattern);
        }
        if (startDate) {
            conditions.push('l.start_date >= ?');
            params.push(startDate);
        }
        if (endDate) {
            conditions.push('l.end_date <= ?');
            params.push(endDate);
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

        if (employee_id) {
            countConditions.push('l.employee_id = ?');
            countQueryParams.push(employee_id);
        }
        if (team_lead_id) {
            countConditions.push('l.team_lead_id = ?');
            countQueryParams.push(team_lead_id);
        }
        if (search) {
            const searchPattern = `%${search}%`;
            countConditions.push('(u.employee_name LIKE ? OR l.leave_type LIKE ? OR u.emp_id LIKE ?)');
            countQueryParams.push(searchPattern, searchPattern, searchPattern);
        }
        if (startDate) {
            countConditions.push('l.start_date >= ?');
            countQueryParams.push(startDate);
        }
        if (endDate) {
            countConditions.push('l.end_date <= ?');
            countQueryParams.push(endDate);
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
}

module.exports = Leave;
