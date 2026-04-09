const { pool } = require('../Config/dbConfig');
const bcrypt = require('bcryptjs');

const initDB = async () => {
    try {
        // Create users table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'employee', 'superadmin') DEFAULT 'employee',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Users table checked/created.');

        // Check if admin user exists
        const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', ['admin@hrm.com']);

        if (users.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await pool.execute(
                'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
                ['Admin User', 'admin@hrm.com', hashedPassword, 'admin']
            );
            console.log('Default admin user created: admin@hrm.com / admin123');
        } else {
            console.log('Admin user already exists.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
};

initDB();