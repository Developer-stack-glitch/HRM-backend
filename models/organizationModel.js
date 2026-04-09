const { pool } = require('../Config/dbConfig');

class Organization {
    // Company methods
    static async createCompany(data) {
        const { name, registration_number, email, phone, address, website, logo } = data;
        const [result] = await pool.execute(
            'INSERT INTO companies (name, registration_number, email, phone, address, website, logo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name || null, registration_number || null, email || null, phone || null, address || null, website || null, logo || null]
        );
        return result.insertId;
    }

    static async updateCompany(id, data) {
        const { name, registration_number, email, phone, address, website, logo } = data;
        let query = 'UPDATE companies SET name = ?, registration_number = ?, email = ?, phone = ?, address = ?, website = ?';
        const params = [name || null, registration_number || null, email || null, phone || null, address || null, website || null];

        if (logo) {
            query += ', logo = ?';
            params.push(logo);
        }

        query += ' WHERE id = ?';
        params.push(id || null);

        console.log('Updating company:', { id, logo: logo || 'No change' });
        await pool.execute(query, params);
    }

    static async updateCompanyDbName(id, dbName) {
        await pool.execute('UPDATE companies SET db_name = ? WHERE id = ?', [dbName || null, id || null]);
    }

    static async updateCompanyDbUser(id, dbUser) {
        await pool.execute('UPDATE companies SET db_user = ? WHERE id = ?', [dbUser || null, id || null]);
    }

    static async getAllCompanies() {
        const [rows] = await pool.execute('SELECT * FROM companies ORDER BY created_at DESC');
        return rows;
    }

    static async getCompanyById(id) {
        const [rows] = await pool.execute('SELECT * FROM companies WHERE id = ?', [id || null]);
        return rows[0];
    }

    // Branch methods
    static async createBranch(data, poolOverride = null) {
        const { company_id, name, branch_code, address, phone } = data;
        const targetPool = poolOverride || pool;

        if (poolOverride || !company_id) {
            // Tenant database or no company_id provided: NO company_id column
            const [result] = await targetPool.execute(
                'INSERT INTO branches (name, branch_code, address, phone) VALUES (?, ?, ?, ?)',
                [name || null, branch_code || null, address || null, phone || null]
            );
            return result.insertId;
        } else {
            // Main database: HAS company_id column
            const [result] = await targetPool.execute(
                'INSERT INTO branches (company_id, name, branch_code, address, phone) VALUES (?, ?, ?, ?, ?)',
                [company_id || null, name || null, branch_code || null, address || null, phone || null]
            );
            return result.insertId;
        }
    }

    static async getAllBranches() {
        try {
            const [rows] = await pool.execute(`
                SELECT b.*, c.name as company_name 
                FROM branches b 
                LEFT JOIN companies c ON b.company_id = c.id 
                ORDER BY b.created_at DESC
            `);
            return rows;
        } catch (error) {
            const [rows] = await pool.execute('SELECT * FROM branches ORDER BY created_at DESC');
            return rows;
        }
    }

    // Designation methods
    static async createDesignation(data, poolOverride = null) {
        const { company_id, department_id, name, description } = data;
        const targetPool = poolOverride || pool;

        if (poolOverride || !company_id) {
            // Tenant database or no company_id: NO company_id column
            const [result] = await targetPool.execute(
                'INSERT INTO designations (department_id, name, description) VALUES (?, ?, ?)',
                [department_id || null, name, description || null]
            );
            return result.insertId;
        } else {
            // Main database: HAS company_id and department_id
            const [result] = await targetPool.execute(
                'INSERT INTO designations (company_id, department_id, name, description) VALUES (?, ?, ?, ?)',
                [company_id || null, department_id || null, name, description || null]
            );
            return result.insertId;
        }
    }

    static async getAllDesignations() {
        try {
            const [rows] = await pool.execute(`
                SELECT d.*, c.name as company_name, dep.name as department_name 
                FROM designations d 
                LEFT JOIN companies c ON d.company_id = c.id 
                LEFT JOIN departments dep ON d.department_id = dep.id 
                ORDER BY d.created_at DESC
            `);
            return rows;
        } catch (error) {
            const [rows] = await pool.execute(`
                SELECT d.*, dep.name as department_name 
                FROM designations d 
                LEFT JOIN departments dep ON d.department_id = dep.id 
                ORDER BY d.created_at DESC
            `);
            return rows;
        }
    }

    // Shift methods
    static async createShift(data) {
        const { name, start_time, end_time } = data;
        const [result] = await pool.execute(
            'INSERT INTO shifts (name, start_time, end_time) VALUES (?, ?, ?)',
            [name || null, start_time || null, end_time || null]
        );
        return result.insertId;
    }

    static async getAllShifts() {
        const [rows] = await pool.execute('SELECT * FROM shifts ORDER BY created_at DESC');
        return rows;
    }
    // Department methods
    static async createDepartment(data, poolOverride = null) {
        const { company_id, name, description } = data;
        const targetPool = poolOverride || pool;

        if (poolOverride || !company_id) {
            // Tenant database or no company_id: NO company_id column
            const [result] = await targetPool.execute(
                'INSERT INTO departments (name, description) VALUES (?, ?)',
                [name, description || null]
            );
            return result.insertId;
        } else {
            // Main database: HAS company_id
            const [result] = await targetPool.execute(
                'INSERT INTO departments (company_id, name, description) VALUES (?, ?, ?)',
                [company_id || null, name, description || null]
            );
            return result.insertId;
        }
    }

    static async getAllDepartments() {
        try {
            const [rows] = await pool.execute(`
                SELECT d.*, d.name AS department_name, c.name as company_name 
                FROM departments d 
                LEFT JOIN companies c ON d.company_id = c.id 
                ORDER BY d.created_at DESC
            `);
            return rows;
        } catch (error) {
            const [rows] = await pool.execute('SELECT *, name AS department_name FROM departments ORDER BY created_at DESC');
            return rows;
        }
    }

    static async deleteCompany(id) {
        // 1. Get company details to find db_name and db_user
        const [rows] = await pool.execute('SELECT db_name, db_user FROM companies WHERE id = ?', [id || null]);
        const company = rows[0];

        // 2. Delete company from main database
        await pool.execute('DELETE FROM companies WHERE id = ?', [id || null]);

        // 3. Drop the tenant database and user if they exist
        if (company) {
            if (company.db_name) {
                await pool.execute(`DROP DATABASE IF EXISTS \`${company.db_name}\``);
            }
            if (company.db_user) {
                try {
                    await pool.execute(`DROP USER IF EXISTS ?@'localhost'`, [company.db_user]);
                    await pool.execute(`DROP USER IF EXISTS ?@'%'`, [company.db_user]);
                } catch (dropError) {
                    console.error(`Error dropping database user ${company.db_user}:`, dropError.message);
                }
            }
        }
    }

    static async getAllEmploymentTypes() {
        const [rows] = await pool.execute('SELECT * FROM employment_types ORDER BY name ASC');
        return rows;
    }

    static async getAllWorkLocations() {
        const [rows] = await pool.execute('SELECT * FROM work_locations ORDER BY name ASC');
        return rows;
    }

    static async getMetadata() {
        const [branches] = await pool.execute('SELECT * FROM branches');
        const [departments] = await pool.execute('SELECT * FROM departments');
        const [shifts] = await pool.execute('SELECT * FROM shifts');
        const [employmentTypes] = await pool.execute('SELECT * FROM employment_types');
        const [workLocations] = await pool.execute('SELECT * FROM work_locations');
        return { branches, departments, shifts, employmentTypes, workLocations };
    }
}

module.exports = Organization;
