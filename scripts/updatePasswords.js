const { pool } = require('../Config/dbConfig');
const bcrypt = require('bcryptjs');

const updatePasswords = async () => {
    try {
        const hashedPassword = await bcrypt.hash('acte@123', 10);
        const [result] = await pool.execute(
            'UPDATE users SET password = ? WHERE role IN (?, ?)',
            [hashedPassword, 'admin', 'employee']
        );
        console.log(`Updated passwords for ${result.affectedRows} users.`);
        process.exit(0);
    } catch (error) {
        console.error('Error updating passwords:', error);
        process.exit(1);
    }
};

updatePasswords();
