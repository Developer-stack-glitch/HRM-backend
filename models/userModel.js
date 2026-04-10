const { pool } = require('../Config/dbConfig');
const bcrypt = require('bcryptjs');

const USER_COLUMNS = [
    'name', 'email', 'password', 'role',
    'employee_name', 'emp_id', 'biometric_id', 'company', 'department', 'designation',
    'branch', 'shift', 'employment_type',
    'work_location', 'is_experienced', 'team_lead',
    'doj', 'dor', 'duration',
    'year_gross_salary', 'salary_structure_id',
    'variable', 'travel_allowance', 'employer_epfo', 'epf', 'pt',
    'last_increment', 'increment_type', 'upcoming_increment', 'off_contact_no',
    'off_mail_id', 'esi', 'pf', 'aadhar', 'pan', 'bank_ac_no', 'ifsc', 'uan',
    'per_contact_no', 'per_mail_id', 'dob', 'blood_group', 'mother_tongue', 'gender',
    'father_spouse_name', 'father_spouse_contact', 'mother_name', 'mother_contact',
    'temp_address', 'perm_address',
    'document_resume', 'document_test_paper', 'document_10th', 'document_12th',
    'document_ug', 'document_pg', 'document_aadhar', 'document_pan',
    'document_passbook', 'document_photo', 'document_relieving_letter',
    'document_exp_letter', 'document_payslips', 'document_emp_details_form'
];

const User = {
    findByEmail: async (email) => {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email || null]);
        return rows[0];
    },

    findById: async (id) => {
        const [rows] = await pool.execute(`
            SELECT 
                u.id, u.name, u.email, u.role, u.employee_name, u.emp_id, u.biometric_id, 
                u.company, u.department, u.designation, u.branch, u.shift, u.employment_type, 
                u.work_location, u.is_experienced, u.team_lead, u.doj, u.dor, u.duration, 
                u.year_gross_salary, u.salary_structure_id, u.variable, u.travel_allowance, 
                u.employer_epfo, u.epf, u.pt, u.last_increment, u.increment_type, 
                u.upcoming_increment, u.off_contact_no, u.off_mail_id, u.esi, u.pf, 
                u.aadhar, u.pan, u.bank_ac_no, u.ifsc, u.uan, u.per_contact_no, 
                u.per_mail_id, u.dob, u.blood_group, u.mother_tongue, u.gender, u.father_spouse_name, 
                u.father_spouse_contact, u.mother_name, u.mother_contact, u.temp_address, 
                u.perm_address, u.document_resume, u.document_test_paper, u.document_10th, 
                u.document_12th, u.document_ug, u.document_pg, u.document_aadhar, 
                u.document_pan, u.document_passbook, u.document_photo, 
                u.document_relieving_letter, u.document_exp_letter, u.document_payslips, 
                u.document_emp_details_form, u.web_clock_in_allowed,
                d.name as department_name,
                des.name as designation_name,
                b.name as branch_name,
                s.name as shift_name,
                s.start_time as shift_start,
                s.end_time as shift_end,
                c.name as company_name,
                et.name as employment_type_name,
                wl.name as work_location_name
            FROM users u
            LEFT JOIN departments d ON u.department = d.id
            LEFT JOIN designations des ON u.designation = des.id
            LEFT JOIN branches b ON u.branch = b.id
            LEFT JOIN shifts s ON u.shift = s.id
            LEFT JOIN companies c ON u.company = c.id
            LEFT JOIN employment_types et ON u.employment_type = et.id
            LEFT JOIN work_locations wl ON u.work_location = wl.id
            WHERE u.id = ?
        `, [id || null]);

        if (!rows[0]) return null;

        const calculateShiftHours = (start, end) => {
            if (!start || !end) return "0.0";
            const [h1, m1] = start.split(':').map(Number);
            const [h2, m2] = end.split(':').map(Number);
            let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (diff < 0) diff += 24 * 60;
            return (diff / 60).toFixed(1);
        };

        return {
            ...rows[0],
            department_name: rows[0].department_name || rows[0].department,
            designation_name: rows[0].designation_name || rows[0].designation,
            branch_name: rows[0].branch_name || rows[0].branch,
            shift_name: rows[0].shift_name ? `${rows[0].shift_name} (${rows[0].shift_start} - ${rows[0].shift_end})` : rows[0].shift,
            shift_hours: calculateShiftHours(rows[0].shift_start, rows[0].shift_end),
            employment_type_name: rows[0].employment_type_name || rows[0].employment_type,
            work_location_name: rows[0].work_location_name || rows[0].work_location
        };
    },

    getAll: async () => {
        const [rows] = await pool.execute(`
            SELECT 
                u.id, u.name, u.email, u.role, u.employee_name, u.emp_id, u.biometric_id, 
                u.company, u.department, u.designation, u.branch, u.shift, u.employment_type, 
                u.work_location, u.is_experienced, u.team_lead, u.doj, u.dor, u.duration, 
                u.year_gross_salary, u.salary_structure_id, u.variable, u.travel_allowance, 
                u.employer_epfo, u.epf, u.pt, u.last_increment, u.increment_type, 
                u.upcoming_increment, u.off_contact_no, u.off_mail_id, u.esi, u.pf, 
                u.aadhar, u.pan, u.bank_ac_no, u.ifsc, u.uan, u.per_contact_no, 
                u.per_mail_id, u.dob, u.blood_group, u.mother_tongue, u.gender, u.father_spouse_name, 
                u.father_spouse_contact, u.mother_name, u.mother_contact, u.temp_address, 
                u.perm_address, u.document_resume, u.document_test_paper, u.document_10th, 
                u.document_12th, u.document_ug, u.document_pg, u.document_aadhar, 
                u.document_pan, u.document_passbook, u.document_photo, 
                u.document_relieving_letter, u.document_exp_letter, u.document_payslips, 
                u.document_emp_details_form, u.web_clock_in_allowed,
                d.name as department_name,
                des.name as designation_name,
                b.name as branch_name,
                s.name as shift_name,
                s.start_time as shift_start,
                s.end_time as shift_end,
                c.name as company_name,
                et.name as employment_type_name,
                wl.name as work_location_name
            FROM users u
            LEFT JOIN departments d ON u.department = d.id
            LEFT JOIN designations des ON u.designation = des.id
            LEFT JOIN branches b ON u.branch = b.id
            LEFT JOIN shifts s ON u.shift = s.id
            LEFT JOIN companies c ON u.company = c.id
            LEFT JOIN employment_types et ON u.employment_type = et.id
            LEFT JOIN work_locations wl ON u.work_location = wl.id
            WHERE u.role != 'superadmin' 
            ORDER BY u.id DESC
        `);

        const calculateShiftHours = (start, end) => {
            if (!start || !end) return "0.0";
            const [h1, m1] = start.split(':').map(Number);
            const [h2, m2] = end.split(':').map(Number);
            let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (diff < 0) diff += 24 * 60;
            return (diff / 60).toFixed(1);
        };

        return rows.map(row => ({
            ...row,
            department_name: row.department_name || row.department,
            designation_name: row.designation_name || row.designation,
            branch_name: row.branch_name || row.branch,
            shift_name: row.shift_name ? `${row.shift_name} (${row.shift_start} - ${row.shift_end})` : row.shift,
            shift_hours: calculateShiftHours(row.shift_start, row.shift_end),
            employment_type_name: row.employment_type_name || row.employment_type,
            work_location_name: row.work_location_name || row.work_location
        }));
    },

    getPaginated: async (page = 1, limit = 10, searchTerm = '', filters = {}) => {
        const offset = (page - 1) * limit;
        let query = `
            SELECT 
                u.id, u.name, u.email, u.role, u.employee_name, u.emp_id, u.biometric_id, 
                u.company, u.department, u.designation, u.branch, u.shift, u.employment_type, 
                u.work_location, u.is_experienced, u.team_lead, u.doj, u.dor, u.duration, 
                u.year_gross_salary, u.salary_structure_id, u.variable, u.travel_allowance, 
                u.employer_epfo, u.epf, u.pt, u.last_increment, u.increment_type, 
                u.upcoming_increment, u.off_contact_no, u.off_mail_id, u.esi, u.pf, 
                u.aadhar, u.pan, u.bank_ac_no, u.ifsc, u.uan, u.per_contact_no, 
                u.per_mail_id, u.dob, u.blood_group, u.mother_tongue, u.gender, u.father_spouse_name, 
                u.father_spouse_contact, u.mother_name, u.mother_contact, u.temp_address, 
                u.perm_address, u.document_resume, u.document_test_paper, u.document_10th, 
                u.document_12th, u.document_ug, u.document_pg, u.document_aadhar, 
                u.document_pan, u.document_passbook, u.document_photo, 
                u.document_relieving_letter, u.document_exp_letter, u.document_payslips, 
                u.document_emp_details_form, u.web_clock_in_allowed,
                d.name as department_name,
                des.name as designation_name,
                b.name as branch_name,
                s.name as shift_name,
                s.start_time as shift_start,
                s.end_time as shift_end,
                c.name as company_name,
                et.name as employment_type_name,
                wl.name as work_location_name
            FROM users u
            LEFT JOIN departments d ON u.department = d.id
            LEFT JOIN designations des ON u.designation = des.id
            LEFT JOIN branches b ON u.branch = b.id
            LEFT JOIN shifts s ON u.shift = s.id
            LEFT JOIN companies c ON u.company = c.id
            LEFT JOIN employment_types et ON u.employment_type = et.id
            LEFT JOIN work_locations wl ON u.work_location = wl.id
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM users u';
        let conditions = ["u.role != 'superadmin'"];
        let params = [];

        if (searchTerm) {
            const searchPattern = `%${searchTerm}%`;
            conditions.push('(u.employee_name LIKE ? OR u.email LIKE ? OR u.name LIKE ?)');
            params.push(searchPattern, searchPattern, searchPattern);
        }

        // Apply filters
        const filterFields = ['department', 'designation', 'employment_type', 'shift', 'branch', 'gender'];
        filterFields.forEach(field => {
            if (filters[field]) {
                const values = Array.isArray(filters[field]) ? filters[field] : [filters[field]];
                if (values.length > 0) {
                    const placeholders = values.map(() => '?').join(', ');
                    conditions.push(`u.\`${field}\` IN (${placeholders})`);
                    params.push(...values.map(v => (v || '').toString().trim()));
                }
            }
        });

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        let countParams = [...params];

        query += ' ORDER BY u.id DESC LIMIT ? OFFSET ?';
        const finalLimit = Number.isFinite(parseInt(limit)) ? parseInt(limit) : 10;
        const finalOffset = Number.isFinite(parseInt(offset)) ? parseInt(offset) : 0;
        params.push(finalLimit, finalOffset);

        const [rows] = await pool.query(query, params);
        const [countResult] = await pool.query(countQuery, countParams);

        const calculateShiftHours = (start, end) => {
            if (!start || !end) return "0.0";
            const [h1, m1] = start.split(':').map(Number);
            const [h2, m2] = end.split(':').map(Number);
            let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (diff < 0) diff += 24 * 60;
            return (diff / 60).toFixed(1);
        };

        const mappedRows = rows.map(row => ({
            ...row,
            department_name: row.department_name || row.department,
            designation_name: row.designation_name || row.designation,
            branch_name: row.branch_name || row.branch,
            shift_name: row.shift_name ? `${row.shift_name} (${row.shift_start} - ${row.shift_end})` : row.shift,
            shift_hours: calculateShiftHours(row.shift_start, row.shift_end),
            employment_type_name: row.employment_type_name || row.employment_type,
            work_location_name: row.work_location_name || row.work_location
        }));

        return {
            users: mappedRows,
            total: countResult[0].total
        };
    },

    getUserAttendance: async (page = 1, limit = 10, searchTerm = '', filters = {}) => {
        const offset = (page - 1) * limit;
        let query = `
            SELECT 
                u.id,
                u.employee_name,
                u.emp_id,
                u.biometric_id,
                u.company,
                d.name as department_name,
                des.name as designation_name,
                b.name as branch_name,
                s.start_time as shift_start,
                s.end_time as shift_end
            FROM users u
            LEFT JOIN departments d ON u.department = d.id
            LEFT JOIN designations des ON u.designation = des.id
            LEFT JOIN branches b ON u.branch = b.id
            LEFT JOIN shifts s ON u.shift = s.id
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM users u';
        let conditions = ["u.role != 'superadmin'"];
        let params = [];

        if (searchTerm) {
            const searchPattern = `%${searchTerm}%`;
            conditions.push('(u.employee_name LIKE ? OR u.emp_id LIKE ?)');
            params.push(searchPattern, searchPattern);
        }

        const filterFields = ['department', 'designation', 'employment_type', 'shift', 'branch'];
        filterFields.forEach(field => {
            if (filters[field]) {
                const values = Array.isArray(filters[field]) ? filters[field] : [filters[field]];
                if (values.length > 0) {
                    const placeholders = values.map(() => '?').join(', ');
                    conditions.push(`u.\`${field}\` IN (${placeholders})`);
                    params.push(...values.map(v => (v || '').toString().trim()));
                }
            }
        });

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        let countParams = [...params];

        query += ' ORDER BY u.id DESC LIMIT ? OFFSET ?';
        const finalLimit = Number.isFinite(parseInt(limit)) ? parseInt(limit) : 10;
        const finalOffset = Number.isFinite(parseInt(offset)) ? parseInt(offset) : 0;
        params.push(finalLimit, finalOffset);

        const [rows] = await pool.query(query, params);
        const [countResult] = await pool.query(countQuery, countParams);

        const calculateShiftHours = (start, end) => {
            if (!start || !end) return "0.0";
            const [h1, m1] = start.split(':').map(Number);
            const [h2, m2] = end.split(':').map(Number);
            let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (diff < 0) diff += 24 * 60;
            return (diff / 60).toFixed(1);
        };

        const mappedRows = rows.map(row => ({
            id: row.id,
            employee_name: row.employee_name,
            emp_id: row.emp_id,
            biometric_id: row.biometric_id,
            company: row.company,
            department_name: row.department_name,
            designation_name: row.designation_name,
            branch_name: row.branch_name,
            shift_hours: calculateShiftHours(row.shift_start, row.shift_end)
        }));

        return {
            users: mappedRows,
            total: countResult[0].total
        };
    },

    create: async (userData) => {
        const fields = [];
        const placeholders = [];
        const values = [];

        // Add mandatory fields if not present
        if (!userData.password) {
            userData.password = 'acte@123';
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        userData.password = await bcrypt.hash(userData.password, salt);

        USER_COLUMNS.forEach(col => {
            if (userData[col] !== undefined) {
                fields.push(col);
                placeholders.push('?');
                values.push(userData[col]);
            } else if (col.startsWith('document_')) {
                fields.push(col);
                placeholders.push('?');
                values.push(null);
            }
        });
        if (!userData.role) {
            fields.push('role');
            placeholders.push('?');
            values.push('employee');
        }

        const query = `INSERT INTO users (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;
        const [result] = await pool.query(query, values);
        return result.insertId;
    },

    update: async (id, userData) => {
        const fields = [];
        const values = [];

        // Hash password only if it's explicitly provided and not empty
        if (userData.password && userData.password.trim() !== "") {
            // Check if it's already a bcrypt hash (starts with $2a$ or $2b$) to avoid re-hashing
            if (!userData.password.startsWith('$2a$') && !userData.password.startsWith('$2b$')) {
                const salt = await bcrypt.genSalt(10);
                userData.password = await bcrypt.hash(userData.password, salt);
            }
        } else {
            // If password is blank or null, don't update it
            delete userData.password;
        }

        Object.keys(userData).forEach(key => {
            if (USER_COLUMNS.includes(key)) {
                if (userData[key] !== undefined) {
                    fields.push(`${key} = ?`);
                    values.push(userData[key]);
                }
            }
        });

        if (fields.length === 0) return 0;

        const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
        values.push(id);
        const [result] = await pool.query(query, values);
        return result.affectedRows;
    },

    delete: async (id) => {
        const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id || null]);
        return result.affectedRows;
    },

    getFilterOptions: async () => {
        const [empTypes] = await pool.execute('SELECT DISTINCT employment_type as label FROM users WHERE employment_type IS NOT NULL AND employment_type != ""');
        const [workModes] = await pool.execute('SELECT DISTINCT work_location as label FROM users WHERE work_location IS NOT NULL AND work_location != ""');

        return {
            employmentTypes: empTypes.map(row => ({ id: row.label.toLowerCase(), label: row.label })),
            workModes: workModes.map(row => ({ id: row.label.toLowerCase(), label: row.label }))
        };
    },

    countByRole: async (role) => {
        const [rows] = await pool.execute('SELECT COUNT(*) as total FROM users WHERE role = ?', [role]);
        return rows[0].total;
    }
};

module.exports = { User, USER_COLUMNS };
