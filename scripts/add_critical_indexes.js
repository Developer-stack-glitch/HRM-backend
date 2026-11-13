const { pool } = require('../Config/dbConfig');

async function addIndexIfNotExists(table, indexName, indexDefinition) {
    try {
        const [rows] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [indexName]);
        if (rows.length === 0) {
            console.log(`Adding index ${indexName} on ${table}...`);
            await pool.query(`ALTER TABLE \`${table}\` ADD ${indexDefinition}`);
            console.log(`Successfully added index ${indexName} on ${table}`);
        } else {
            console.log(`Index ${indexName} already exists on ${table}, skipping.`);
        }
    } catch (err) {
        console.error(`Error adding index ${indexName} on ${table}:`, err.message);
    }
}

async function run() {
    console.log('Starting index migration...');

    // 1. Attendance table indexes
    await addIndexIfNotExists('attendance', 'idx_attendance_date', 'INDEX `idx_attendance_date` (`date`)');
    await addIndexIfNotExists('attendance', 'unique_user_date', 'UNIQUE KEY `unique_user_date` (`user_id`, `date`)');

    // 2. Leaves table indexes
    await addIndexIfNotExists('leaves', 'idx_leaves_status', 'INDEX `idx_leaves_status` (`status`)');
    await addIndexIfNotExists('leaves', 'idx_leaves_dates', 'INDEX `idx_leaves_dates` (`start_date`, `end_date`)');

    // 3. Users table indexes
    await addIndexIfNotExists('users', 'idx_users_emp_id', 'INDEX `idx_users_emp_id` (`emp_id`)');
    await addIndexIfNotExists('users', 'idx_users_biometric_id', 'INDEX `idx_users_biometric_id` (`biometric_id`)');
    await addIndexIfNotExists('users', 'idx_users_role', 'INDEX `idx_users_role` (`role`)');
    await addIndexIfNotExists('users', 'idx_users_reporting_manager', 'INDEX `idx_users_reporting_manager` (`reporting_manager`)');

    console.log('Index migration completed successfully!');
    process.exit(0);
}

run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

