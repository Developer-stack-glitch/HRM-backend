const { pool, getTenantPool } = require('../Config/dbConfig');

async function fixTable(dbConn, dbName) {
    try {
        console.log(`Checking table payroll_incentives in ${dbName}...`);
        
        // Drop constraint if it exists
        const [fks] = await dbConn.query(`
            SELECT CONSTRAINT_NAME 
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
            WHERE TABLE_SCHEMA = ? 
              AND TABLE_NAME = 'payroll_incentives' 
              AND REFERENCED_TABLE_NAME = 'users'
        `, [dbName]);

        for (const fk of fks) {
            console.log(`Dropping foreign key constraint ${fk.CONSTRAINT_NAME} from ${dbName}.payroll_incentives...`);
            try {
                await dbConn.query(`ALTER TABLE \`${dbName}\`.payroll_incentives DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
            } catch (dropErr) {
                console.error(`Failed to drop constraint ${fk.CONSTRAINT_NAME}:`, dropErr.message);
            }
        }

        console.log(`Adding foreign key constraint with ON DELETE CASCADE to ${dbName}.payroll_incentives...`);
        await dbConn.query(`
            ALTER TABLE \`${dbName}\`.payroll_incentives 
            ADD CONSTRAINT fk_payroll_incentives_user 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        `);
        console.log(`Successfully fixed payroll_incentives table in ${dbName}.`);
    } catch (err) {
        console.error(`Error fixing database ${dbName}:`, err.message);
    }
}

async function main() {
    // 1. Fix main database
    await fixTable(pool, 'hrm_database');

    // 2. Fix tenant databases if any exist
    try {
        // Check if companies table exists first
        const [tables] = await pool.query("SHOW TABLES LIKE 'companies'");
        if (tables.length > 0) {
            const [companies] = await pool.query('SELECT db_name FROM companies WHERE db_name IS NOT NULL AND db_name != ""');
            for (const company of companies) {
                const tenantPool = getTenantPool(company.db_name);
                await fixTable(tenantPool, company.db_name);
                await tenantPool.end();
            }
        } else {
            console.log("No companies table found in main database.");
        }
    } catch (err) {
        console.log('Error checking/updating tenant databases:', err.message);
    }

    console.log("Migration complete!");
    process.exit(0);
}

main();
