const { pool } = require('../Config/dbConfig');

const BatchAllocation = {
    create: async (data) => {
        const { company_id, name, allocation_date, allocation_day, batch } = data;
        const [result] = await pool.execute(
            `INSERT INTO batch_allocations (company_id, name, allocation_date, allocation_day, batch) VALUES (?, ?, ?, ?, ?)`,
            [company_id || null, name || null, allocation_date || null, allocation_day || null, batch || null]
        );
        return result.insertId;
    },

    getAll: async (company_id) => {
        let query = `
            SELECT ba.*, 
                   (SELECT COUNT(*) FROM batch_allocation_assignments baa WHERE baa.batch_allocation_id = ba.id) as assigned_users_count
            FROM batch_allocations ba
        `;
        let params = [];
        if (company_id !== undefined && company_id !== null) {
            query += ' WHERE ba.company_id = ?';
            params.push(company_id);
        }
        query += ' ORDER BY ba.created_at DESC';
        const [rows] = await pool.execute(query, params);
        return rows;
    },

    getById: async (id) => {
        const [rows] = await pool.execute('SELECT * FROM batch_allocations WHERE id = ?', [id || null]);
        return rows[0];
    },

    update: async (id, data) => {
        const fields = [];
        const values = [];
        const allowedFields = ['name', 'allocation_date', 'allocation_day', 'batch', 'is_active'];

        allowedFields.forEach(field => {
            if (data[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(data[field]);
            }
        });

        if (fields.length === 0) return 0;

        values.push(id || null);
        const query = `UPDATE batch_allocations SET ${fields.join(', ')} WHERE id = ?`;
        const [result] = await pool.execute(query, values);
        return result.affectedRows;
    },

    delete: async (id) => {
        const [result] = await pool.execute('DELETE FROM batch_allocations WHERE id = ?', [id || null]);
        return result.affectedRows;
    },

    // ---- Assignment methods ----

    // Assign multiple users to a batch allocation (bulk)
    assignUsers: async (batchId, userIds) => {
        if (!userIds || userIds.length === 0) return 0;
        const values = userIds.map(uid => [batchId || null, uid || null]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        const flatValues = values.flat();
        const [result] = await pool.execute(
            `INSERT IGNORE INTO batch_allocation_assignments (batch_allocation_id, user_id) VALUES ${placeholders}`,
            flatValues
        );
        return result.affectedRows;
    },

    // Remove a user from a batch allocation
    removeUser: async (batchId, userId) => {
        const [result] = await pool.execute(
            'DELETE FROM batch_allocation_assignments WHERE batch_allocation_id = ? AND user_id = ?',
            [batchId || null, userId || null]
        );
        return result.affectedRows;
    },

    // Remove all users from a batch allocation
    removeAllUsers: async (batchId) => {
        const [result] = await pool.execute(
            'DELETE FROM batch_allocation_assignments WHERE batch_allocation_id = ?',
            [batchId || null]
        );
        return result.affectedRows;
    },

    // Get all users assigned to a batch allocation (with user details)
    getAssignedUsers: async (batchId) => {
        const [rows] = await pool.execute(`
            SELECT u.*,
                   COALESCE(d.name, u.department) as department_name, 
                   COALESCE(des.name, u.designation) as designation_name,
                   b.name as branch_name
            FROM batch_allocation_assignments baa
            JOIN users u ON baa.user_id = u.id
            LEFT JOIN departments d ON u.department = d.id
            LEFT JOIN designations des ON u.designation = des.id
            LEFT JOIN branches b ON u.branch = b.id
            WHERE baa.batch_allocation_id = ?
            ORDER BY u.employee_name ASC
        `, [batchId || null]);
        return rows;
    },

    // Get just user IDs assigned to a batch allocation
    getAssignedUserIds: async (batchId) => {
        const [rows] = await pool.execute(
            'SELECT user_id FROM batch_allocation_assignments WHERE batch_allocation_id = ?',
            [batchId || null]
        );
        return rows.map(r => r.user_id);
    },

    // Get all user IDs assigned to ANY batch allocation for a company
    getAllAssignedUsersForCompany: async (companyId) => {
        const [rows] = await pool.execute(`
            SELECT DISTINCT baa.user_id 
            FROM batch_allocation_assignments baa
            JOIN batch_allocations ba ON baa.batch_allocation_id = ba.id
            WHERE ba.company_id = ?
        `, [companyId || null]);
        return rows.map(r => r.user_id);
    },

    // ---- Salary Component methods ----

    // Assign components to a batch allocation
    assignComponents: async (batchId, componentIds) => {
        if (!componentIds || componentIds.length === 0) return 0;
        const values = componentIds.map(cid => [batchId || null, cid || null]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        const flatValues = values.flat();
        const [result] = await pool.execute(
            `INSERT INTO salary_structure_components (batch_allocation_id, component_id) VALUES ${placeholders}`,
            flatValues
        );
        return result.affectedRows;
    },

    // Remove all components from a batch allocation
    removeAllComponents: async (batchId) => {
        const [result] = await pool.execute(
            'DELETE FROM salary_structure_components WHERE batch_allocation_id = ?',
            [batchId || null]
        );
        return result.affectedRows;
    },

    // Get components for a batch allocation
    getComponents: async (batchId) => {
        const [rows] = await pool.execute(`
            SELECT sc.* 
            FROM salary_structure_components ssc
            JOIN salary_components sc ON ssc.component_id = sc.id
            WHERE ssc.batch_allocation_id = ? AND sc.is_active = 1
            ORDER BY sc.sort_order ASC, sc.created_at ASC
        `, [batchId || null]);
        return rows;
    }
};

module.exports = BatchAllocation;
