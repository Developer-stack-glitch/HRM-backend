const { pool } = require('../Config/dbConfig');
const bcrypt = require('bcryptjs');

const updateSuperAdminPassword = async () => {
    try {
        const newPassword = process.argv[2] || process.env.NEW_SUPERADMIN_PASSWORD;
        if (!newPassword || newPassword.length < 12) {
            console.error('ERROR: You must supply a secure password with at least 12 characters.');
            console.error('Usage: node scripts/updateSuperAdminPassword.js <StrongPassword123!>');
            process.exit(1);
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        const [result] = await pool.execute(
            'UPDATE users SET password = ? WHERE role = ? OR email = ?',
            [hashedPassword, 'superadmin', 'superadminhrm@gmail.com']
        );
        
        console.log(`Updated superadmin password for ${result.affectedRows} user(s).`);
        process.exit(0);
    } catch (error) {
        console.error('Error updating superadmin password:', error);
        process.exit(1);
    }
};

updateSuperAdminPassword();
