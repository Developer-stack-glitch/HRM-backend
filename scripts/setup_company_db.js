const { pool } = require('../Config/dbConfig');
const { setupTenantDatabase } = require('../utils/tenantDbSetup');
const Organization = require('../models/organizationModel');

const setupDatabaseForCompany = async (companyId) => {
    try {
        if (!companyId) {
            console.error('Usage: node scripts/setup_company_db.js <company_id>');
            process.exit(1);
        }

        console.log(`Checking company with ID: ${companyId}...`);
        const company = await Organization.getCompanyById(companyId);

        if (!company) {
            console.error(`Error: Company with ID ${companyId} not found.`);
            process.exit(1);
        }

        if (company.db_name) {
            console.log(`Note: Company already has a database: ${company.db_name}`);
            process.exit(0);
        }

        const dbName = `hrm_${company.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${company.id}`;
        console.log(`Initializing database: ${dbName}...`);

        await setupTenantDatabase(dbName);
        await Organization.updateCompanyDbName(company.id, dbName);

        console.log(`SUCCESS: Database ${dbName} setup completed for company ${company.name}`);
        process.exit(0);
    } catch (error) {
        console.error('FAILED to setup database:', error.message);
        process.exit(1);
    }
};

const companyId = process.argv[2];
setupDatabaseForCompany(companyId);
