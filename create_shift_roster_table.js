const { pool } = require('./Config/dbConfig');

async function createTable() {
    try {
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
        console.error('Error creating table:', error);
        process.exit(1);
    }
}

createTable();
