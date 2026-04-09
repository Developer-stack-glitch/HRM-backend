const { pool } = require('../Config/dbConfig');

const PayrollRun = {
    create: async (data) => {
        const {
            company_id, batch_allocation_id, batch_name,
            pay_type, period_start, period_end,
            total_employees, total_amount, status
        } = data;
        const [result] = await pool.execute(
            `INSERT INTO payroll_runs (
                company_id, batch_allocation_id, batch_name, 
                pay_type, period_start, period_end, 
                total_employees, total_amount, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                company_id || null, batch_allocation_id || null, batch_name || null,
                pay_type || 'MONTHLY', period_start || null, period_end || null,
                total_employees || 0, total_amount || 0, status || 'Pending'
            ]
        );
        return result.insertId;
    },

    getAll: async (company_id, page = 1, limit = 10, status, filters = {}) => {
        const offset = (page - 1) * limit;
        let whereConditions = [];
        let params = [];

        if (company_id !== undefined && company_id !== null) {
            whereConditions.push('company_id = ?');
            params.push(company_id);
        }

        if (status && status !== 'All') {
            whereConditions.push('status = ?');
            params.push(status);
        }

        // Add date range filtering
        if (filters.startDate) {
            whereConditions.push('period_start >= ?');
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            whereConditions.push('period_end <= ?');
            params.push(filters.endDate);
        }

        // Add organization filters
        if (filters.branch) {
            whereConditions.push('branch_id = ?');
            params.push(filters.branch);
        }
        if (filters.department) {
            whereConditions.push('department_id = ?');
            params.push(filters.department);
        }
        if (filters.shift) {
            whereConditions.push('shift_id = ?');
            params.push(filters.shift);
        }

        const whereClause = whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count and total amount sum
        const statsQuery = `SELECT COUNT(*) as total, SUM(total_amount) as total_sum FROM payroll_runs${whereClause}`;
        const [statsResult] = await pool.query(statsQuery, params);
        const total = statsResult[0].total;
        const totalSum = statsResult[0].total_sum || 0;

        // Get paginated rows
        let query = `SELECT * FROM payroll_runs${whereClause}`;
        query += ' ORDER BY created_at DESC';
        query += ' LIMIT ? OFFSET ?';

        // Add limit and offset to params. Note that LIMIT and OFFSET must be numbers.
        const [rows] = await pool.query(query, [...params, Number(limit), Number(offset)]);

        return { rows, total, totalSum };
    },

    updateStatus: async (id, status) => {
        const [result] = await pool.execute(
            'UPDATE payroll_runs SET status = ? WHERE id = ?',
            [status || null, id || null]
        );
        return result.affectedRows;
    },

    update: async (id, data) => {
        const { batch_name, period_start, period_end, pay_type } = data;
        const [result] = await pool.execute(
            `UPDATE payroll_runs SET 
                batch_name = ?, 
                period_start = ?, 
                period_end = ?, 
                pay_type = ? 
            WHERE id = ?`,
            [
                batch_name || null,
                period_start || null,
                period_end || null,
                pay_type || 'MONTHLY',
                id || null
            ]
        );
        return result.affectedRows;
    },

    delete: async (id) => {
        const [result] = await pool.execute('DELETE FROM payroll_runs WHERE id = ?', [id || null]);
        return result.affectedRows;
    }
};

module.exports = PayrollRun;
