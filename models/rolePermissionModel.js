const { pool } = require('../Config/dbConfig');

const RolePermission = {
    createTable: async () => {
        const query = `
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role VARCHAR(50) NOT NULL UNIQUE,
                permissions JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `;
        await pool.execute(query);
    },

    getPermissionsByRole: async (role) => {
        const [rows] = await pool.execute('SELECT permissions FROM role_permissions WHERE role = ?', [role]);
        const permissions = rows[0] ? rows[0].permissions : null;
        if (typeof permissions === 'string') {
            try {
                return JSON.parse(permissions);
            } catch (e) {
                console.error('Error parsing permissions JSON:', e);
                return [];
            }
        }
        return permissions;
    },

    getAllPermissions: async () => {
        const [rows] = await pool.execute("SELECT * FROM role_permissions WHERE role != 'superadmin'");
        return rows.map(row => ({
            ...row,
            permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) || [] : row.permissions
        }));
    },

    upsertPermissions: async (role, permissions) => {
        const [rows] = await pool.execute('SELECT id FROM role_permissions WHERE role = ?', [role]);
        if (rows.length > 0) {
            await pool.execute('UPDATE role_permissions SET permissions = ? WHERE role = ?', [JSON.stringify(permissions), role]);
        } else {
            await pool.execute('INSERT INTO role_permissions (role, permissions) VALUES (?, ?)', [role, JSON.stringify(permissions)]);
        }
    },
    
    deleteRole: async (role) => {
        await pool.execute('DELETE FROM role_permissions WHERE role = ?', [role]);
    }
};

module.exports = RolePermission;
