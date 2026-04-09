const Organization = require('../models/organizationModel');
const { User } = require('../models/userModel');
const { setupTenantDatabase } = require('../utils/tenantDbSetup');
const { getTenantPool } = require('../Config/dbConfig');

// Company Controllers
const createCompany = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Company name is required' });
        }

        const data = { ...req.body };
        if (req.files && req.files.logo) {
            data.logo = req.files.logo[0].path.replace(/\\/g, '/');
        }

        // 1. Create company in main database
        const companyId = await Organization.createCompany(data);

        // 2. Automatically setup database and dedicated database user
        const dbName = `hrm_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${companyId}`;
        const dbUser = `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${companyId}`.substring(0, 32);
        const dbPass = 'admin@123';

        console.log(`Automatically setting up database ${dbName} for company ${name}`);
        await setupTenantDatabase(dbName, dbUser, dbPass, { name, email: req.body.email });

        // 3. Update company record with dbName and dbUser
        await Organization.updateCompanyDbName(companyId, dbName);
        await Organization.updateCompanyDbUser(companyId, dbUser);

        res.status(201).json({
            message: 'Company created and database initialized successfully.',
            id: companyId,
            database: dbName,
            dbUser: dbUser
        });
    } catch (error) {
        console.error('Error in createCompany:', error);
        res.status(500).json({ message: 'Error creating company', error: error.message });
    }
};

const setupCompanyDatabase = async (req, res) => {
    try {
        const { company_id } = req.body;
        if (!company_id) {
            return res.status(400).json({ message: 'Company ID is required' });
        }

        const company = await Organization.getCompanyById(company_id);
        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        if (company.db_name) {
            return res.status(400).json({ message: 'Database already setup for this company' });
        }

        // 1. Create separate database and user for the company
        const dbName = `hrm_${company.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${company.id}`;
        const dbUser = `${company.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${company.id}`.substring(0, 32);
        const dbPass = 'admin@123';

        await setupTenantDatabase(dbName, dbUser, dbPass, { name: company.name, email: company.email });

        // 2. Update company record with dbName and dbUser
        await Organization.updateCompanyDbName(company.id, dbName);
        await Organization.updateCompanyDbUser(company.id, dbUser);

        res.status(200).json({
            message: 'Database and user initialized successfully',
            database: dbName,
            dbUser: dbUser
        });
    } catch (error) {
        console.error('Error in setupCompanyDatabase:', error);
        res.status(500).json({ message: 'Error initializing database', error: error.message });
    }
};

const updateCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Company name is required' });
        }

        const data = { ...req.body };
        if (req.files && req.files.logo) {
            data.logo = req.files.logo[0].path.replace(/\\/g, '/');
        }

        await Organization.updateCompany(id, data);
        res.status(200).json({ message: 'Company updated successfully' });
    } catch (error) {
        console.error('Error in updateCompany:', error);
        res.status(500).json({ message: 'Error updating company', error: error.message });
    }
};

const getCompanies = async (req, res) => {
    try {
        const companies = await Organization.getAllCompanies();
        res.status(200).json(companies);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching companies', error: error.message });
    }
};

const getCompanyById = async (req, res) => {
    try {
        const { id } = req.params;
        const company = await Organization.getCompanyById(id);
        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }
        res.status(200).json(company);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching company', error: error.message });
    }
};

const deleteCompany = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if company is deletable
        const company = await Organization.getCompanyById(id);
        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        if (company.is_deletable === 0) {
            return res.status(403).json({ message: 'This company is protected and cannot be deleted' });
        }

        await Organization.deleteCompany(id);
        res.status(200).json({ message: 'Company and its database deleted successfully' });
    } catch (error) {
        console.error('Error in deleteCompany:', error);
        res.status(500).json({ message: 'Error deleting company', error: error.message });
    }
};

// Branch Controllers
const createBranch = async (req, res) => {
    try {
        const { company_id } = req.body;
        let targetPool = null;
        let tenantPool = null;

        if (company_id) {
            const company = await Organization.getCompanyById(company_id);
            if (!company) {
                return res.status(404).json({ message: 'Company not found' });
            }
            if (!company.db_name) {
                return res.status(400).json({ message: 'Company database not initialized. Please setup the database first.' });
            }
            tenantPool = getTenantPool(company.db_name);
            targetPool = tenantPool;
        }

        const id = await Organization.createBranch(req.body, targetPool);

        if (tenantPool) {
            await tenantPool.end();
        }

        res.status(201).json({ message: 'Branch created successfully in company database', id });
    } catch (error) {
        console.error('Error in createBranch:', error);
        res.status(500).json({ message: 'Error creating branch', error: error.message });
    }
};

const getBranches = async (req, res) => {
    try {
        const branches = await Organization.getAllBranches();
        res.status(200).json(branches);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching branches', error: error.message });
    }
};

// Designation Controllers
const createDesignation = async (req, res) => {
    try {
        const { company_id } = req.body;
        let targetPool = null;
        let tenantPool = null;

        if (company_id) {
            const company = await Organization.getCompanyById(company_id);
            if (!company) {
                return res.status(404).json({ message: 'Company not found' });
            }
            if (!company.db_name) {
                return res.status(400).json({ message: 'Company database not initialized. Please setup the database first.' });
            }
            tenantPool = getTenantPool(company.db_name);
            targetPool = tenantPool;
        }

        const id = await Organization.createDesignation(req.body, targetPool);

        if (tenantPool) {
            await tenantPool.end();
        }

        res.status(201).json({ message: 'Designation created successfully', id });
    } catch (error) {
        console.error('Error in createDesignation:', error);
        res.status(500).json({ message: 'Error creating designation', error: error.message });
    }
};

const getDesignations = async (req, res) => {
    try {
        const designations = await Organization.getAllDesignations();
        res.status(200).json(designations);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching designations', error: error.message });
    }
};

// Shift Controllers
const createShift = async (req, res) => {
    try {
        const id = await Organization.createShift(req.body);
        res.status(201).json({ message: 'Shift created successfully', id });
    } catch (error) {
        res.status(500).json({ message: 'Error creating shift', error: error.message });
    }
};

const getShifts = async (req, res) => {
    try {
        const shifts = await Organization.getAllShifts();
        res.status(200).json(shifts);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching shifts', error: error.message });
    }
};

// Department Controllers
const createDepartment = async (req, res) => {
    try {
        const { company_id } = req.body;
        let targetPool = null;
        let tenantPool = null;

        if (company_id) {
            const company = await Organization.getCompanyById(company_id);
            if (!company) {
                return res.status(404).json({ message: 'Company not found' });
            }
            if (!company.db_name) {
                return res.status(400).json({ message: 'Company database not initialized. Please setup the database first.' });
            }
            tenantPool = getTenantPool(company.db_name);
            targetPool = tenantPool;
        }

        const id = await Organization.createDepartment(req.body, targetPool);

        if (tenantPool) {
            await tenantPool.end();
        }

        res.status(201).json({ message: 'Department created successfully', id });
    } catch (error) {
        console.error('Error in createDepartment:', error);
        res.status(500).json({ message: 'Error creating department', error: error.message });
    }
};

const getDepartments = async (req, res) => {
    try {
        const departments = await Organization.getAllDepartments();
        res.status(200).json(departments);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching departments', error: error.message });
    }
};

const getEmploymentTypes = async (req, res) => {
    try {
        const types = await Organization.getAllEmploymentTypes();
        res.status(200).json(types);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching employment types', error: error.message });
    }
};

const getWorkLocations = async (req, res) => {
    try {
        const locations = await Organization.getAllWorkLocations();
        res.status(200).json(locations);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching work locations', error: error.message });
    }
};

const getMetadata = async (req, res) => {
    try {
        const metadata = await Organization.getMetadata();
        const userFilters = await User.getFilterOptions();
        res.status(200).json({ ...metadata, ...userFilters });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching metadata', error: error.message });
    }
};

module.exports = {
    createCompany,
    updateCompany,
    getCompanies,
    getCompanyById,
    deleteCompany,
    setupCompanyDatabase,
    createBranch,
    getBranches,
    createDesignation,
    getDesignations,
    createShift,
    getShifts,
    createDepartment,
    getDepartments,
    getMetadata,
    getEmploymentTypes,
    getWorkLocations
};
