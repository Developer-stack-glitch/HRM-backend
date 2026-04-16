require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { pool } = require('../Config/dbConfig');

const createTable = async () => {
    try {
        const query = `
            CREATE TABLE IF NOT EXISTS regularisations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                date DATE NOT NULL,
                check_in TIME,
                check_out TIME,
                reason TEXT,
                status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
                approved_by INT,
                rejection_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `;
        await pool.execute(query);
        console.log('Regularisations table created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error creating table:', error);
        process.exit(1);
    }
};

createTable();
