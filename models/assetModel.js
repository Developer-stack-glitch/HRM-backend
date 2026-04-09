const { pool } = require('../Config/dbConfig');

const Asset = {
    getAllCategories: async () => {
        const [rows] = await pool.execute('SELECT * FROM asset_categories ORDER BY name ASC');
        return rows;
    },

    addCategory: async (name) => {
        const [result] = await pool.execute('INSERT INTO asset_categories (name) VALUES (?)', [name]);
        return result.insertId;
    },

    deleteCategory: async (id) => {
        const [result] = await pool.execute('DELETE FROM asset_categories WHERE id = ?', [id]);
        return result.affectedRows;
    },

    getAllAssets: async (filters = {}) => {
        const { limit = 10, page = 1, search = '', category = 'All', status = 'All', startDate = '', endDate = '', departments } = filters;
        const offset = (page - 1) * limit;

        let filterWhere = [];
        const filterParams = [];

        if (search) {
            filterWhere.push(`(a.name LIKE ? OR a.asset_ref LIKE ? OR a.serial LIKE ? OR a.vendor LIKE ? OR a.branch LIKE ?)`);
            const searchPattern = `%${search}%`;
            filterParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        if (category && category !== 'All') {
            const catArray = Array.isArray(category) ? category : category.split(',');
            filterWhere.push(`c.name IN (${catArray.map(() => '?').join(',')})`);
            filterParams.push(...catArray);
        }

        if (status && status !== 'All') {
            const statusArray = Array.isArray(status) ? status : status.split(',');
            filterWhere.push(`a.status IN (${statusArray.map(() => '?').join(',')})`);
            filterParams.push(...statusArray);
        }

        if (startDate) {
            filterWhere.push(`DATE(COALESCE(a.purchase_date, a.created_at)) >= ?`);
            filterParams.push(startDate);
        }
        if (endDate) {
            filterWhere.push(`DATE(COALESCE(a.purchase_date, a.created_at)) <= ?`);
            filterParams.push(endDate);
        }

        if (departments) {
            const deptArray = Array.isArray(departments) ? departments : departments.split(',');
            const branchIds = deptArray.filter(id => typeof id === 'string' && id.startsWith('branch-')).map(id => id.replace('branch-', ''));
            const actualDeptIds = deptArray.filter(id => typeof id !== 'string' || !id.startsWith('branch-'));

            const orgConditions = [];
            if (branchIds.length > 0) {
                orgConditions.push(`u.branch IN (${branchIds.map(() => '?').join(',')})`);
                filterParams.push(...branchIds);
            }
            if (actualDeptIds.length > 0) {
                orgConditions.push(`u.department IN (${actualDeptIds.map(() => '?').join(',')})`);
                filterParams.push(...actualDeptIds);
            }
            if (orgConditions.length > 0) {
                filterWhere.push(`(${orgConditions.join(' OR ')})`);
            }
        }

        const filterClause = filterWhere.length > 0 ? `WHERE ` + filterWhere.join(' AND ') : '';

        // Stats queries
        const [statsResult] = await pool.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available,
                SUM(CASE WHEN status = 'Assigned' THEN 1 ELSE 0 END) as assigned,
                SUM(CASE WHEN status IN ('Maintenance', 'Broken') THEN 1 ELSE 0 END) as issues
            FROM assets
        `);

        const stats = {
            total: parseInt(statsResult[0].total) || 0,
            available: parseInt(statsResult[0].available) || 0,
            assigned: parseInt(statsResult[0].assigned) || 0,
            issues: parseInt(statsResult[0].issues) || 0
        };

        // Total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM assets a
            LEFT JOIN asset_categories c ON a.category_id = c.id
            ${filterClause}
        `;
        const [countResult] = await pool.query(countQuery, filterParams);
        const total = parseInt(countResult[0].total) || 0;

        // Fetch paginated data
        const dataQuery = `
            SELECT 
                a.*, 
                c.name as category_name,
                u.name as assigned_user_name,
                u.emp_id as assigned_user_emp_id,
                d.name as assigned_user_department
            FROM assets a
            LEFT JOIN asset_categories c ON a.category_id = c.id
            LEFT JOIN users u ON a.assigned_to = u.id
            LEFT JOIN departments d ON u.department = d.id
            ${filterClause}
            ORDER BY a.id DESC
            LIMIT ? OFFSET ?
        `;
        const finalLimit = Number.isFinite(parseInt(limit)) ? parseInt(limit) : 10;
        const finalOffset = Number.isFinite(parseInt(offset)) ? parseInt(offset) : 0;
        const dataParams = [...filterParams, finalLimit, finalOffset];
        const [rows] = await pool.query(dataQuery, dataParams);

        return { data: rows, total, stats };
    },

    getAssetById: async (id) => {
        const query = `
            SELECT 
                a.*, 
                c.name as category_name,
                u.name as assigned_user_name,
                u.emp_id as assigned_user_emp_id,
                d.name as assigned_user_department
            FROM assets a
            LEFT JOIN asset_categories c ON a.category_id = c.id
            LEFT JOIN users u ON a.assigned_to = u.id
            LEFT JOIN departments d ON u.department = d.id
            WHERE a.id = ?
        `;
        const [rows] = await pool.execute(query, [id]);
        return rows[0];
    },

    createAsset: async (assetData) => {
        const {
            asset_ref, name, category_id, serial, purchase_date, cost, status,
            branch, asset_image, specification, rental_type, vendor,
            warranty_in_month, invoice, remarks, assigned_to
        } = assetData;

        const [result] = await pool.execute(
            `INSERT INTO assets (
                asset_ref, name, category_id, serial, purchase_date, cost, status,
                branch, asset_image, specification, rental_type, vendor,
                warranty_in_month, invoice, remarks, assigned_to
             ) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                asset_ref, name, category_id || null, serial, purchase_date || null, cost || null, status || 'Available',
                branch || null, asset_image || null, specification || null, rental_type || null, vendor || null,
                warranty_in_month || null, invoice || null, remarks || null, assigned_to || null
            ]
        );
        const newAssetId = result.insertId;

        // Automatically record history if not Available or if assigned
        if (status && status !== 'Available') {
            let historyType = 'Assignment';
            if (status === 'Maintenance') historyType = 'Repair';
            else if (status === 'Broken') historyType = 'Damaged';

            await Asset.recordAssetHistory(newAssetId, {
                user_id: assigned_to || null,
                history_type: historyType,
                remarks: `Initial registration with status: ${status}`
            });
        }

        return newAssetId;
    },

    recordAssetHistory: async (assetId, data) => {
        const { user_id, history_type, remarks } = data;
        await pool.execute(
            'INSERT INTO asset_histories (asset_id, user_id, history_type, remarks) VALUES (?, ?, ?, ?)',
            [assetId, user_id || null, history_type, remarks || null]
        );
    },

    updateAsset: async (id, assetData) => {
        const fields = [];
        const values = [];

        [
            'name', 'category_id', 'serial', 'purchase_date', 'cost', 'status', 'assigned_to',
            'branch', 'asset_image', 'specification', 'rental_type', 'vendor',
            'warranty_in_month', 'invoice', 'remarks'
        ].forEach(key => {
            if (assetData[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(assetData[key]);
            }
        });

        if (fields.length === 0) return 0;

        values.push(id);

        // Fetch current state to detect changes
        const [currentAsset] = await pool.execute('SELECT status, assigned_to FROM assets WHERE id = ?', [id]);

        const [result] = await pool.execute(`UPDATE assets SET ${fields.join(', ')} WHERE id = ?`, values);

        if (result.affectedRows > 0 && currentAsset.length > 0) {
            const oldStatus = currentAsset[0].status;
            const oldAssigned = currentAsset[0].assigned_to;
            const newStatus = assetData.status;
            const newAssigned = assetData.assigned_to;

            // Log history if status changed or assignment changed
            if (newStatus && newStatus !== oldStatus) {
                let hType = null;
                if (newStatus === 'Maintenance') hType = 'Repair';
                else if (newStatus === 'Broken') hType = 'Damaged';
                else if (newStatus === 'Assigned') hType = 'Assignment';

                if (hType) {
                    await Asset.recordAssetHistory(id, {
                        user_id: newAssigned !== undefined ? newAssigned : oldAssigned,
                        history_type: hType,
                        remarks: `Status changed from ${oldStatus} to ${newStatus}`
                    });
                }
            } else if (newAssigned !== undefined && newAssigned !== oldAssigned && newAssigned !== null) {
                await Asset.recordAssetHistory(id, {
                    user_id: newAssigned,
                    history_type: 'Assignment',
                    remarks: `Asset reassigned`
                });
            }
        }

        return result.affectedRows;
    },

    deleteAsset: async (id) => {
        const [result] = await pool.execute('DELETE FROM assets WHERE id = ?', [id]);
        return result.affectedRows;
    },

    getMyAssets: async (userId) => {
        const query = `
            SELECT 
                a.*, 
                c.name as category_name,
                u.name as assigned_user_name,
                u.emp_id as assigned_user_emp_id,
                d.name as assigned_user_department
            FROM assets a
            LEFT JOIN asset_categories c ON a.category_id = c.id
            LEFT JOIN users u ON a.assigned_to = u.id
            LEFT JOIN departments d ON u.department = d.id
            WHERE a.assigned_to = ?
            ORDER BY a.id DESC
        `;
        const [rows] = await pool.execute(query, [userId]);
        return rows;
    },

    getAssetAnalytics: async (filters = {}) => {
        const { startDate, endDate } = filters;

        // 1. Lost/Damaged events
        const [lostDamaged] = await pool.execute(`
            SELECT h.*, a.name as asset_name, c.name as category_name
            FROM asset_histories h
            JOIN assets a ON h.asset_id = a.id
            LEFT JOIN asset_categories c ON a.category_id = c.id
            WHERE h.history_type IN ('Lost', 'Damaged')
            AND DATE(h.assigned_from) BETWEEN ? AND ?
            ORDER BY h.assigned_from DESC
        `, [startDate, endDate]);

        // 2. Asset Requests by User
        const [requests] = await pool.execute(`
            SELECT q.*, u.name as user_name, c.name as category_name
            FROM asset_query q
            JOIN users u ON q.user_id = u.id
            LEFT JOIN asset_categories c ON q.asset_category_id = c.id
            WHERE DATE(q.created_at) BETWEEN ? AND ?
            ORDER BY q.created_at DESC
        `, [startDate, endDate]);

        // 3. Assignments vs Repairs (Chart Data)
        const [chartData] = await pool.execute(`
            SELECT 
                DATE(h.assigned_from) as date,
                SUM(CASE WHEN h.history_type = 'Assignment' THEN 1 ELSE 0 END) as assignments,
                SUM(CASE WHEN h.history_type = 'Repair' THEN 1 ELSE 0 END) as repairs
            FROM asset_histories h
            WHERE DATE(h.assigned_from) BETWEEN ? AND ?
            GROUP BY DATE(h.assigned_from)
            ORDER BY DATE(h.assigned_from) ASC
        `, [startDate, endDate]);

        // 4. Request Stats (Approved vs Requested)
        const [requestChartData] = await pool.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as requested,
                SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as approved
            FROM asset_query
            WHERE DATE(created_at) BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        `, [startDate, endDate]);

        return {
            lostDamaged,
            requests,
            chartData,
            requestChartData
        };
    },

    createAssetRequest: async (data) => {
        const { user_id, asset_category_id, asset_name, reason } = data;
        const [result] = await pool.execute(
            'INSERT INTO asset_query (user_id, asset_category_id, asset_name, reason, status) VALUES (?, ?, ?, ?, ?)',
            [user_id, asset_category_id || null, asset_name, reason, 'Requested']
        );
        return result.insertId;
    },

    getAssetRequests: async (filters = {}) => {
        const { status = 'All', search = '', departments, startDate, endDate } = filters;
        let whereClauses = [];
        let params = [];

        if (status && status !== 'All') {
            whereClauses.push('q.status = ?');
            params.push(status);
        }

        if (search) {
            whereClauses.push('(u.name LIKE ? OR u.emp_id LIKE ? OR q.asset_name LIKE ?)');
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        if (startDate) {
            whereClauses.push('DATE(q.created_at) >= ?');
            params.push(startDate);
        }

        if (endDate) {
            whereClauses.push('DATE(q.created_at) <= ?');
            params.push(endDate);
        }

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
                whereClauses.push(`(${orgConditions.join(' OR ')})`);
            }
        }

        let query = `
            SELECT q.*, u.name as user_name, u.emp_id, c.name as category_name
            FROM asset_query q
            JOIN users u ON q.user_id = u.id
            LEFT JOIN asset_categories c ON q.asset_category_id = c.id
        `;

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        query += ' ORDER BY q.created_at DESC';
        const [rows] = await pool.query(query, params);
        return rows;
    },

    getUserAssetRequests: async (userId) => {
        const [rows] = await pool.execute(`
            SELECT q.*, c.name as category_name
            FROM asset_query q
            LEFT JOIN asset_categories c ON q.asset_category_id = c.id
            WHERE q.user_id = ?
            ORDER BY q.created_at DESC
        `, [userId]);
        return rows;
    },

    getAssetRequestById: async (id) => {
        const query = `
            SELECT q.*, u.name as user_name, u.emp_id, c.name as category_name
            FROM asset_query q
            JOIN users u ON q.user_id = u.id
            LEFT JOIN asset_categories c ON q.asset_category_id = c.id
            WHERE q.id = ?
        `;
        const [rows] = await pool.execute(query, [id]);
        return rows[0];
    },

    updateAssetRequestStatus: async (id, status, rejection_reason = null) => {
        const [result] = await pool.execute(
            'UPDATE asset_query SET status = ?, rejection_reason = ? WHERE id = ?',
            [status, rejection_reason, id]
        );
        return result.affectedRows;
    }
};

module.exports = Asset;
