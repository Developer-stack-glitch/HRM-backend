const { User, USER_COLUMNS } = require('../models/userModel');
const SalaryStructure = require('../models/salaryStructureModel');
const Organization = require('../models/organizationModel');
const { pool } = require('../Config/dbConfig');
const ExcelJS = require('exceljs');
const fs = require('fs');

const createUser = async (req, res) => {
    try {
        const userData = { ...req.body };

        // Normalize booleans from FormData (strings like "true"/"false" to 1/0)
        Object.keys(userData).forEach(key => {
            if (key === 'team_lead') {
                userData[key] = (userData[key] === 'true' || userData[key] === 1 || userData[key] === true) ? 'yes' : 'no';
            } else {
                if (userData[key] === 'true') userData[key] = 1;
                if (userData[key] === 'false') userData[key] = 0;
            }
        });

        // Automatically set company from logged in user (not chooseable)
        if (req.user && req.user.company) {
            userData.company = req.user.company;
        }

        // Handle file uploads if present
        if (req.files) {
            Object.keys(req.files).forEach(key => {
                const files = req.files[key];
                // Map frontend names like 'aadhar_file' to DB 'document_aadhar'
                const baseName = key.replace('_file', '');
                const dbKey = `document_${baseName}`;

                if (files.length > 1 || key === 'payslips') {
                    userData[dbKey] = JSON.stringify(files.map(f => f.path));
                } else {
                    userData[dbKey] = files[0].path;
                }
            });
        }

        // Resolve numeric role ID to string name if needed
        if (userData.role && !isNaN(userData.role)) {
            const [roleRows] = await pool.execute('SELECT role FROM role_permissions WHERE id = ?', [userData.role]);
            if (roleRows.length > 0) {
                userData.role = roleRows[0].role;
            }
        }

        // 3. Validate mandatory fields
        const mandatoryFields = ['department', 'designation', 'branch', 'shift'];
        for (const field of mandatoryFields) {
            if (!userData[field]) {
                const label = field.charAt(0).toUpperCase() + field.slice(1);
                return res.status(400).json({ message: `${label} is mandatory.` });
            }
        }

        // 4. Prevent duplicate Employee ID or Biometric ID
        if (userData.emp_id) {
            const [existingEmpId] = await pool.execute('SELECT id FROM users WHERE emp_id = ?', [userData.emp_id]);
            if (existingEmpId.length > 0) {
                return res.status(400).json({ message: `Employee ID "${userData.emp_id}" is already assigned to another staff.` });
            }
        }

        if (userData.biometric_id) {
            const [existingBioId] = await pool.execute('SELECT id FROM users WHERE biometric_id = ?', [userData.biometric_id]);
            if (existingBioId.length > 0) {
                return res.status(400).json({ message: `Biometric ID "${userData.biometric_id}" is already assigned to another staff.` });
            }
        }

        // Restriction: Only one Team Lead per department
        if (userData.team_lead === 'yes' && userData.department) {
            const [existingLead] = await pool.execute(
                'SELECT employee_name FROM users WHERE department = ? AND team_lead = "yes"',
                [userData.department]
            );
            if (existingLead.length > 0) {
                return res.status(400).json({
                    message: `Department already has a Team Lead: ${existingLead[0].employee_name}. Only one Team Lead is allowed per department.`
                });
            }
        }

        const userId = await User.create(userData);
        res.status(201).json({ message: 'User created successfully', userId });
    } catch (error) {
        console.error('Error creating user:', error);
        let message = 'Error creating user';
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('email')) message = 'This email address is already registered please change the email address.';
            else if (error.message.includes('emp_id')) message = 'This Employee ID is already in use.';
            else if (error.message.includes('biometric_id')) message = 'This Biometric ID is already in use.';
            else message = 'The record already exists.';
            return res.status(400).json({ message, error: error.message });
        }
        res.status(500).json({ message, error: error.message });
    }
};

const getMilestones = async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                u.id, 
                u.employee_name, 
                u.dob, 
                u.doj, 
                d.name as department_name
            FROM users u
            LEFT JOIN departments d ON u.department = d.id
            WHERE u.role != 'superadmin'
        `);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching milestones:', error);
        res.status(500).json({ message: 'Error fetching milestones', error: error.message });
    }
};

const getUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', ...queryFilters } = req.query;
        const userRole = req.user.role;
        const userId = req.user.id;

        // Normalize keys (remove [] if present) and remove pagination/search params
        const filters = {};
        Object.keys(queryFilters).forEach(key => {
            const cleanKey = key.replace('[]', '');
            if (!['page', 'limit', 'search'].includes(cleanKey)) {
                filters[cleanKey] = queryFilters[key];
            }
        });

        // Security: If employee, they can only "get" themselves
        if (userRole === 'employee') {
            const result = await User.findById(userId);
            return res.status(200).json({
                users: result ? [result] : [],
                total: result ? 1 : 0
            });
        }

        const result = await User.getPaginated(parseInt(page), parseInt(limit), search, filters);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
};

const getUserAttendance = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', ...queryFilters } = req.query;
        const userRole = req.user.role;
        const userId = req.user.id;

        const filters = {};
        Object.keys(queryFilters).forEach(key => {
            const cleanKey = key.replace('[]', '');
            if (!['page', 'limit', 'search'].includes(cleanKey)) {
                filters[cleanKey] = queryFilters[key];
            }
        });

        if (userRole === 'employee') {
            const user = await User.findById(userId);
            return res.status(200).json({
                users: user ? [user] : [],
                total: user ? 1 : 0
            });
        }

        const result = await User.getUserAttendance(parseInt(page), parseInt(limit), search, filters);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching user attendance:', error);
        res.status(500).json({ message: 'Error fetching user attendance', error: error.message });
    }
};

const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
};

const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(user);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
};

const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const userData = { ...req.body };

        // Normalize booleans from FormData (strings like "true"/"false" to 1/0)
        Object.keys(userData).forEach(key => {
            if (key === 'team_lead') {
                userData[key] = (userData[key] === 'true' || userData[key] === 1 || userData[key] === true) ? 'yes' : 'no';
            } else {
                if (userData[key] === 'true') userData[key] = 1;
                if (userData[key] === 'false') userData[key] = 0;
            }
        });

        // Handle existing files and new uploads
        // First, check for any existing files sent back
        Object.keys(userData).forEach(key => {
            if (key.endsWith('_existing')) {
                const realKey = key.replace('_existing', '');
                const baseName = realKey.replace('_file', '');
                const dbKey = `document_${baseName}`;
                userData[dbKey] = userData[key];
                delete userData[key];
            } else if (key.endsWith('_existing[]')) {
                const realKey = key.replace('_existing[]', '');
                const baseName = realKey.replace('_file', '');
                const dbKey = `document_${baseName}`;
                // For arrays, ensure it's normalized
                let existing = userData[key];
                if (!Array.isArray(existing)) existing = [existing];
                userData[dbKey] = existing;
                delete userData[key];
            }
        });

        if (req.files) {
            Object.keys(req.files).forEach(key => {
                const files = req.files[key];
                const baseName = key.replace('_file', '');
                const dbKey = `document_${baseName}`;
                const newPaths = files.map(f => f.path);

                if (key === 'payslips') {
                    // Merge new payslips with existing ones
                    const existing = Array.isArray(userData[dbKey]) ? userData[dbKey] :
                        (typeof userData[dbKey] === 'string' && userData[dbKey].startsWith('[') ? JSON.parse(userData[dbKey]) : []);
                    userData[dbKey] = JSON.stringify([...existing, ...newPaths]);
                } else {
                    userData[dbKey] = newPaths[0];
                }
            });
        }

        // Resolve numeric role ID to string name if needed
        if (userData.role && !isNaN(userData.role)) {
            const [roleRows] = await pool.execute('SELECT role FROM role_permissions WHERE id = ?', [userData.role]);
            if (roleRows.length > 0) {
                userData.role = roleRows[0].role;
            }
        }

        // 3. Validate mandatory fields (only if present in request, to allow partial updates like password/photo)
        const mandatoryFields = ['department', 'designation', 'branch', 'shift'];
        for (const field of mandatoryFields) {
            if (Object.keys(userData).includes(field) && !userData[field]) {
                const label = field.charAt(0).toUpperCase() + field.slice(1);
                return res.status(400).json({ message: `${label} is mandatory.` });
            }
        }

        // 4. Prevent duplicate Employee ID or Biometric ID (excluding current user)
        if (userData.emp_id) {
            const [existingEmpId] = await pool.execute('SELECT id FROM users WHERE emp_id = ? AND id != ?', [userData.emp_id, id]);
            if (existingEmpId.length > 0) {
                return res.status(400).json({ message: `Employee ID "${userData.emp_id}" is already assigned to another staff.` });
            }
        }

        if (userData.biometric_id) {
            const [existingBioId] = await pool.execute('SELECT id FROM users WHERE biometric_id = ? AND id != ?', [userData.biometric_id, id]);
            if (existingBioId.length > 0) {
                return res.status(400).json({ message: `Biometric ID "${userData.biometric_id}" is already assigned to another staff.` });
            }
        }

        // Restriction: Only one Team Lead per department
        if (userData.team_lead === 'yes' && userData.department) {
            const [existingLead] = await pool.execute(
                'SELECT employee_name FROM users WHERE department = ? AND team_lead = "yes" AND id != ?',
                [userData.department, id]
            );
            if (existingLead.length > 0) {
                return res.status(400).json({
                    message: `Department already has a Team Lead: ${existingLead[0].employee_name}. Only one Team Lead is allowed per department.`
                });
            }
        }

        const affectedRows = await User.update(id, userData);
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'User not found or no changes made' });
        }
        res.status(200).json({ message: 'User updated successfully' });
    } catch (error) {
        console.error('Error updating user:', error);
        let message = 'Error updating user';
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('email')) message = 'This email address is already registered.';
            else if (error.message.includes('emp_id')) message = 'This Employee ID is already in use.';
            else if (error.message.includes('biometric_id')) message = 'This Biometric ID is already in use.';
            else message = 'The record already exists.';
            return res.status(400).json({ message, error: error.message });
        }
        res.status(500).json({ message, error: error.message });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const affectedRows = await User.delete(id);
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
};

const downloadBulkTemplate = async (req, res) => {
    try {
        const { salary_structure_id } = req.query;
        if (!salary_structure_id) return res.status(400).json({ message: 'Salary structure ID is required' });

        const structure = await SalaryStructure.getById(salary_structure_id);
        const components = await SalaryStructure.getComponents(salary_structure_id);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Employee Template');

        const baseColumns = [
            'Employee Name', 'Off Mail ID', 'Emp ID', 'Biometric ID', 'Role ID', 
            'Department ID', 'Designation ID', 'Branch ID', 'Shift ID', 
            'Employment Type ID', 'Work Location ID', 'DOJ (DD-MM-YYYY)', 'DOR (DD-MM-YYYY)',
            'DOB (DD-MM-YYYY)', 'Gender', 'Per Mail ID', 'Off Contact No', 'Per Contact No',
            'ESI No', 'PF No', 'Aadhar No', 'PAN No', 'Bank A/C No', 'IFSC Code', 'UAN',
            'Blood Group', 'Mother Tongue', 'Father/Spouse Name', 'Father/Spouse Contact',
            'Mother Name', 'Mother Contact', 'Temp Address', 'Perm Address',
            'Year Gross Salary', 'Has Work Experience? (Yes/No)', 'Allow Web Clock-In (Yes/No)', 'Team Lead (Yes/No)'
        ];

        const componentColumns = components.map(c => c.name);
        const allColumns = [...baseColumns, ...componentColumns];

        worksheet.columns = allColumns.map(col => ({ header: col, key: col, width: 25 }));

        // Style the header row
        const headerRow = worksheet.getRow(1);
        headerRow.height = 30;
        headerRow.eachCell((cell) => {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF2F75B5' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFDBE5F1' } },
                left: { style: 'thin', color: { argb: 'FFDBE5F1' } },
                bottom: { style: 'thin', color: { argb: 'FFDBE5F1' } },
                right: { style: 'thin', color: { argb: 'FFDBE5F1' } }
            };
        });

        // Add dummy data for first row
        const dummyRow = {};
        allColumns.forEach(col => {
            if (col === 'Employee Name') dummyRow[col] = 'John Doe';
            else if (col === 'Off Mail ID') dummyRow[col] = 'john@company.com';
            else if (col === 'Emp ID') dummyRow[col] = 'EMP001';
            else if (col.includes('Date') || col.includes('DOJ') || col.includes('DOR') || col.includes('DOB')) dummyRow[col] = '01-01-1995';
            else if (['Role ID', 'Department ID', 'Designation ID', 'Branch ID', 'Shift ID'].includes(col)) dummyRow[col] = '1';
            else if (col === 'Year Gross Salary') dummyRow[col] = '500000';
            else if (['Has Work Experience? (Yes/No)', 'Allow Web Clock-In (Yes/No)', 'Team Lead (Yes/No)'].includes(col)) dummyRow[col] = 'No';
            else dummyRow[col] = '';
        });
        const dummyRowInstance = worksheet.addRow(dummyRow);

        // Add data validation (dropdowns) for Yes/No columns
        const yesNoColumns = [
            allColumns.indexOf('Has Work Experience? (Yes/No)') + 1,
            allColumns.indexOf('Allow Web Clock-In (Yes/No)') + 1,
            allColumns.indexOf('Team Lead (Yes/No)') + 1
        ];

        yesNoColumns.forEach(colIndex => {
            if (colIndex > 0) {
                const colLetter = worksheet.getColumn(colIndex).letter;
                // Apply validation to 100 rows
                for (let i = 2; i <= 100; i++) {
                    worksheet.getCell(`${colLetter}${i}`).dataValidation = {
                        type: 'list',
                        allowBlank: true,
                        formulae: ['"Yes,No"']
                    };
                }
            }
        });
        dummyRowInstance.height = 20;
        dummyRowInstance.eachCell((cell) => {
            cell.font = { name: 'Segoe UI', size: 10 };
            cell.alignment = { vertical: 'middle' };
            cell.border = {
                around: { style: 'thin', color: { argb: 'FFD9D9D9' } }
            };
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Template_${structure.name.replace(/\s+/g, '_')}.xlsx"`);

        await workbook.xlsx.write(res);
    } catch (error) {
        res.status(500).json({ message: 'Error generating template', error: error.message });
    }
};

const downloadReferenceIds = async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reference IDs');

        worksheet.columns = [
            { header: 'Type', key: 'type', width: 25 },
            { header: 'ID', key: 'id', width: 12 },
            { header: 'Name', key: 'name', width: 50 }
        ];

        // Style the header row
        const headerRow = worksheet.getRow(1);
        headerRow.height = 30;
        headerRow.eachCell((cell) => {
            cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF44546A' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        const [departments, designations, branches, shifts, structures, roles, employmentTypes, workLocations] = await Promise.all([
            Organization.getAllDepartments(),
            Organization.getAllDesignations(),
            Organization.getAllBranches(),
            Organization.getAllShifts(),
            SalaryStructure.getAll(req.user.company),
            pool.execute('SELECT id, role FROM role_permissions').then(([rows]) => rows),
            Organization.getAllEmploymentTypes(),
            Organization.getAllWorkLocations()
        ]);

        const addRows = (type, data, nameKey = 'name') => {
            if (!data || data.length === 0) return;
            
            // Add a sub-header row for each section
            const subHeader = worksheet.addRow({ type: type.toUpperCase(), id: '', name: '' });
            subHeader.height = 25;
            subHeader.getCell(1).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
            subHeader.getCell(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFDEEAF6' }
            };
            worksheet.mergeCells(`A${subHeader.number}:C${subHeader.number}`);

            data.forEach(item => {
                const row = worksheet.addRow({ 
                    type, 
                    id: item.id || item.role || item.name || 'N/A', 
                    name: item[nameKey] || item.role || item.name || 'N/A'
                });
                row.height = 20;
                row.eachCell((cell) => {
                    cell.font = { name: 'Segoe UI', size: 10 };
                    cell.alignment = { vertical: 'middle' };
                    cell.border = {
                        around: { style: 'thin', color: { argb: 'FFD9D9D9' } }
                    };
                });
            });
            worksheet.addRow({}); // Empty row
        };

        addRows('Shift', shifts);
        addRows('Department', departments, 'department_name');
        addRows('Designation', designations);
        addRows('Branch', branches);
        addRows('Salary Structure', structures);
        addRows('Role ID', roles);
        addRows('Employment Type', employmentTypes);
        addRows('Work Location', workLocations);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="User_Assignment_Reference_IDs.xlsx"');

        await workbook.xlsx.write(res);
    } catch (error) {
        res.status(500).json({ message: 'Error generating reference IDs', error: error.message });
    }
};

const bulkUploadUsers = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
        const { salary_structure_id } = req.body;

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        const worksheet = workbook.getWorksheet(1);

        const rows = [];
        const [rolesData, deptsData, desigsData, branchesData, shiftsData, empTypesData, workModesData] = await Promise.all([
            pool.execute('SELECT id, role FROM role_permissions').then(([rows]) => rows),
            pool.execute('SELECT id, name FROM departments').then(([rows]) => rows),
            pool.execute('SELECT id, name FROM designations').then(([rows]) => rows),
            pool.execute('SELECT id, name FROM branches').then(([rows]) => rows),
            pool.execute('SELECT id, name, start_time, end_time FROM shifts').then(([rows]) => rows),
            pool.execute('SELECT id, name FROM employment_types').then(([rows]) => rows),
            pool.execute('SELECT id, name FROM work_locations').then(([rows]) => rows)
        ]);

        const createLookup = (data, nameKey = 'name') => {
            const idMap = {};
            const nameToIdMap = {};
            data.forEach(item => {
                const id = item.id;
                const name = (item[nameKey] || item.role || '').toString().toLowerCase().trim();
                idMap[id] = item.role || item[nameKey] || name;
                if (name) nameToIdMap[name] = id;
            });
            return { idMap, nameToIdMap };
        };

        const roleLookup = createLookup(rolesData, 'role');
        const deptLookup = createLookup(deptsData, 'name');
        const desigLookup = createLookup(desigsData, 'name');
        const branchLookup = createLookup(branchesData, 'name');
        const shiftLookup = createLookup(shiftsData, 'name');
        const empTypeLookup = createLookup(empTypesData, 'name');
        const workModeLookup = createLookup(workModesData, 'name');
        // Helper to extract plain value from ExcelJS cell (handles hyperlinks, rich text, etc.)
        const getCellValue = (value) => {
            if (value === null || value === undefined) return null;
            if (typeof value === 'object') {
                // Hyperlink: { text: '...', hyperlink: '...' }
                if (value.text !== undefined) return value.text;
                // Rich text: { richText: [{ text: '...' }, ...] }
                if (value.richText) return value.richText.map(r => r.text).join('');
                // Date object
                if (value instanceof Date) {
                    return value.toISOString().split('T')[0]; // YYYY-MM-DD
                }
                // Formula result
                if (value.result !== undefined) return value.result;
                return String(value);
            }
            return value;
        };

        const headers = [];
        worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
            headers[colNumber] = getCellValue(cell.value);
        });

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const rowData = {};
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                rowData[headers[colNumber]] = getCellValue(cell.value);
            });
            rows.push(rowData);
        });

        const mapping = {
            'Employee Name': 'employee_name',
            'Off Mail ID': 'off_mail_id',
            'Emp ID': 'emp_id',
            'Biometric ID': 'biometric_id',
            'Role ID': 'role',
            'Department ID': 'department',
            'Designation ID': 'designation',
            'Branch ID': 'branch',
            'Shift ID': 'shift',
            'Employment Type ID': 'employment_type',
            'Work Location ID': 'work_location',
            'DOJ (DD-MM-YYYY)': 'doj',
            'DOR (DD-MM-YYYY)': 'dor',
            'DOB (DD-MM-YYYY)': 'dob',
            'Gender': 'gender',
            'Per Mail ID': 'per_mail_id',
            'Off Contact No': 'off_contact_no',
            'Per Contact No': 'per_contact_no',
            'ESI No': 'esi',
            'PF No': 'pf',
            'Aadhar No': 'aadhar',
            'PAN No': 'pan',
            'Bank A/C No': 'bank_ac_no',
            'IFSC Code': 'ifsc',
            'UAN': 'uan',
            'Blood Group': 'blood_group',
            'Mother Tongue': 'mother_tongue',
            'Father/Spouse Name': 'father_spouse_name',
            'Father/Spouse Contact': 'father_spouse_contact',
            'Mother Name': 'mother_name',
            'Mother Contact': 'mother_contact',
            'Temp Address': 'temp_address',
            'Perm Address': 'perm_address',
            'Year Gross Salary': 'year_gross_salary',
            'Has Work Experience? (Yes/No)': 'is_experienced',
            'Allow Web Clock-In (Yes/No)': 'web_clock_in_allowed',
            'Team Lead (Yes/No)': 'team_lead'
        };

        const summary = { success: 0, failed: 0, errors: [] };

        for (const rowData of rows) {
            try {
                const userData = {};
                // dynamic mapping (if any headers match USER_COLUMNS)
                Object.keys(rowData).forEach(header => {
                    let value = rowData[header];
                    // Sanitize numeric/ID fields if they have 'N/A'
                    if (value === 'N/A' || value === '') value = null;
                    
                    const normalizedHeader = header.toLowerCase().replace(/\s+/g, '_');
                    if (USER_COLUMNS.includes(normalizedHeader) && userData[normalizedHeader] === undefined) {
                        userData[normalizedHeader] = value;
                    }
                });

                // Set static mapping after dynamic to override if necessary, also sanitizing
                Object.keys(mapping).forEach(header => {
                    let value = rowData[header];
                    if (value === 'N/A' || value === '') value = null;
                    
                    // Specific parsing for date fields to ensure YYYY-MM-DD for DB
                    if (header.includes('DD-MM-YYYY') && value) {
                        const dateStr = String(value).trim();
                        if (dateStr.includes('-')) {
                            const parts = dateStr.split('-');
                            if (parts.length === 3 && parts[0].length <= 2) {
                                // Convert DD-MM-YYYY to YYYY-MM-DD
                                value = `${parts[2]}-${parts[1]}-${parts[0]}`;
                            }
                        } else if (dateStr.includes('/')) {
                            const parts = dateStr.split('/');
                            if (parts.length === 3 && parts[0].length <= 2) {
                                // Convert DD/MM/YYYY to YYYY-MM-DD
                                value = `${parts[2]}-${parts[1]}-${parts[0]}`;
                            }
                        }
                    }

                    if (value !== undefined) {
                        userData[mapping[header]] = value;
                    }
                });

                // Auto-set company
                userData.company = req.user.company;
                userData.password = 'acte@123';
                if (salary_structure_id) {
                    userData.salary_structure_id = salary_structure_id;
                }
                if (!userData.employee_name || !userData.off_mail_id) {
                    throw new Error(`Missing mandatory fields for row: ${JSON.stringify(rowData)}`);
                }

                // 1. Resolve role (ID or Name)
                if (userData.role) {
                    const roleVal = userData.role.toString().toLowerCase().trim();
                    if (roleLookup.idMap[userData.role]) {
                        userData.role = roleLookup.idMap[userData.role];
                    } else if (roleLookup.nameToIdMap[roleVal]) {
                        userData.role = roleLookup.idMap[roleLookup.nameToIdMap[roleVal]];
                    }
                }

                // 2. Resolve organizational units (Ensure they are IDs)
                const resolveToId = (field, lookup) => {
                    if (!userData[field]) return;
                    const val = userData[field].toString().toLowerCase().trim();
                    if (lookup.idMap[userData[field]]) {
                        // Already a valid ID
                        return;
                    } else if (lookup.nameToIdMap[val]) {
                        // It was a Name, convert to ID
                        userData[field] = lookup.nameToIdMap[val];
                    }
                };

                resolveToId('department', deptLookup);
                resolveToId('designation', desigLookup);
                resolveToId('branch', branchLookup);
                resolveToId('shift', shiftLookup);
                resolveToId('employment_type', empTypeLookup);
                resolveToId('work_location', workModeLookup);

                // Convert Yes/No to DB format
                userData.is_experienced = userData.is_experienced === 'Yes' ? 1 : 0;
                userData.web_clock_in_allowed = userData.web_clock_in_allowed === 'Yes' ? 1 : 0;
                userData.team_lead = userData.team_lead === 'Yes' ? 'yes' : 'no';

                userData.name = userData.employee_name;
                userData.email = userData.off_mail_id;

                await User.create(userData);
                summary.success++;
            } catch (err) {
                summary.failed++;
                summary.errors.push({ row: rowData, message: err.message });
            }
        }

        // Cleanup: remove standard file from disk
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(200).json({ 
            message: `Bulk upload completed. ${summary.success} successful, ${summary.failed} failed.`,
            summary 
        });

    } catch (error) {
        console.error('Bulk upload error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: 'Error processing bulk upload', error: error.message });
    }
};

module.exports = {
    createUser,
    getUsers,
    getUserById,
    getProfile,
    updateUser,
    deleteUser,
    getMilestones,
    getUserAttendance,
    downloadBulkTemplate,
    downloadReferenceIds,
    bulkUploadUsers
};
