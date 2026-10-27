const { pool } = require('../Config/dbConfig');
const bcrypt = require('bcryptjs');

const updateSuperAdminPassword = async () => {
    try {
        const newPassword = process.argv[2] || 'SuperAdmin@#2k26';
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
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
