const { pool } = require('../Config/dbConfig');

const Reimbursement = {
    create: async (data) => {
        const { user_id, category, title, description, amount, date, receipt_url } = data;
        const query = `
            INSERT INTO reimbursements (user_id, category, title, description, amount, date, receipt_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await pool.execute(query, [user_id, category, title, description, amount, date, receipt_url || null]);
        return result.insertId;
    },

    getAll: async (filters = {}) => {
        let query = `
            SELECT r.*, u.employee_name, u.emp_id, d.name AS department_name
            FROM reimbursements r
            JOIN users u ON r.user_id = u.id
            LEFT JOIN departments d ON u.department = d.id
        `;
        const params = [];
        const conditions = [];

        if (filters.user_id) {
            conditions.push('r.user_id = ?');
            params.push(filters.user_id);
        }

        if (filters.fromDate) {
            conditions.push('r.date >= ?');
            params.push(filters.fromDate);
        }

        if (filters.toDate) {
            conditions.push('r.date <= ?');
            params.push(filters.toDate);
        }

        if (filters.statuses && filters.statuses.length > 0) {
            conditions.push(`r.status IN (${filters.statuses.map(() => '?').join(',')})`);
            params.push(...filters.statuses);
        } else if (filters.status) {
            conditions.push('r.status = ?');
            params.push(filters.status);
        }

        if (filters.categories && filters.categories.length > 0) {
            conditions.push(`r.category IN (${filters.categories.map(() => '?').join(',')})`);
            params.push(...filters.categories);
        }

        if (filters.departments && filters.departments.length > 0) {
            const branchIds = filters.departments.filter(id => typeof id === 'string' && id.startsWith('branch-')).map(id => id.replace('branch-', ''));
            const deptIds = filters.departments.filter(id => typeof id !== 'string' || !id.startsWith('branch-'));

            const subConditions = [];

            // Handle Branches
            if (branchIds.length > 0) {
                const hasUnassignedBranch = branchIds.includes('none') || branchIds.includes('unassigned');
                const validBranchIds = branchIds.filter(id => id !== 'none' && id !== 'unassigned');

                if (validBranchIds.length > 0 && hasUnassignedBranch) {
                    subConditions.push(`(u.branch IN (${validBranchIds.map(() => '?').join(',')}) OR u.branch IS NULL OR u.branch = '')`);
                    params.push(...validBranchIds);
                } else if (validBranchIds.length > 0) {
                    subConditions.push(`u.branch IN (${validBranchIds.map(() => '?').join(',')})`);
                    params.push(...validBranchIds);
                } else if (hasUnassignedBranch) {
                    subConditions.push(`(u.branch IS NULL OR u.branch = '')`);
                }
            }

            // Handle Departments
            if (deptIds.length > 0) {
                const hasUnassignedDept = deptIds.includes('none') || deptIds.includes('unassigned');
                const validDeptIds = deptIds.filter(id => id !== 'none' && id !== 'unassigned');

                if (validDeptIds.length > 0 && hasUnassignedDept) {
                    subConditions.push(`(u.department IN (${validDeptIds.map(() => '?').join(',')}) OR u.department IS NULL OR u.department = '')`);
                    params.push(...validDeptIds);
                } else if (validDeptIds.length > 0) {
                    subConditions.push(`u.department IN (${validDeptIds.map(() => '?').join(',')})`);
                    params.push(...validDeptIds);
                } else if (hasUnassignedDept) {
                    subConditions.push(`(u.department IS NULL OR u.department = '')`);
                }
            }

            if (subConditions.length > 0) {
                conditions.push(`(${subConditions.join(' OR ')})`);
            }
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY r.created_at DESC';

        const [rows] = await pool.query(query, params);
        return rows;
    },

    getById: async (id) => {
        const query = `
            SELECT r.*, u.employee_name, u.emp_id 
            FROM reimbursements r
            JOIN users u ON r.user_id = u.id
            WHERE r.id = ?
        `;
        const [rows] = await pool.execute(query, [id]);
        return rows[0];
    },

    updateStatus: async (id, status, comment) => {
        const query = `
            UPDATE reimbursements 
            SET status = ?, comment = ? 
            WHERE id = ?
        `;
        const [result] = await pool.execute(query, [status, comment || null, id]);
        return result.affectedRows;
    },

    delete: async (id) => {
        const query = 'DELETE FROM reimbursements WHERE id = ?';
        const [result] = await pool.execute(query, [id]);
        return result.affectedRows;
    },

    getCategories: async () => {
        const query = 'SELECT DISTINCT category FROM reimbursements WHERE category IS NOT NULL AND category != ""';
        const [rows] = await pool.execute(query);
        return rows.map(row => row.category);
    }
};

module.exports = Reimbursement;
