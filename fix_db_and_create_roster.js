const { pool } = require('./Config/dbConfig');

async function fixTables() {
    try {
        console.log('Fixing shifts table...');
        // Check if id is already a primary key (just in case)
        const [columns] = await pool.execute('DESCRIBE shifts');
        const idCol = columns.find(c => c.Field === 'id');
        
        if (idCol.Key !== 'PRI') {
            console.log('Adding PRIMARY KEY to shifts.id...');
            await pool.execute('ALTER TABLE shifts MODIFY id INT AUTO_INCREMENT PRIMARY KEY');
            console.log('shifts table fixed.');
        } else {
            console.log('shifts table already has a primary key.');
        }

        console.log('Creating shift_roster table...');
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS shift_roster (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                shift_id INT NOT NULL,
                roster_date DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_date (user_id, roster_date),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
            )
        `);
        console.log('Table shift_roster created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixTables();
