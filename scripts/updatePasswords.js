const { pool } = require('../Config/dbConfig');
const bcrypt = require('bcryptjs');

const updatePasswords = async () => {
    try {
        const newPassword = process.argv[2];
        if (!newPassword || newPassword.length < 8) {
            console.error('ERROR: You must supply a new password with at least 8 characters.');
            console.error('Usage: node scripts/updatePasswords.js <NewPassword>');
            process.exit(1);
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
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
