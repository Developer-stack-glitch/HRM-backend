const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

(async () => {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        const [rows] = await pool.execute(`
            SELECT l.*, u.employee_name 
            FROM leaves l 
            JOIN users u ON l.employee_id = u.id 
            WHERE l.leave_type = 'Permission' 
              AND l.start_date = '2026-03-27' 
              AND u.employee_name LIKE '%Divya%'
        `);
        console.log('Found Permissions:', JSON.stringify(rows, null, 2));

        const [allLeaves] = await pool.execute(`
            SELECT l.*, u.employee_name 
            FROM leaves l 
            JOIN users u ON l.employee_id = u.id 
            WHERE l.start_date = '2026-03-27' 
              AND u.employee_name LIKE '%Divya%'
        `);
        console.log('All Leaves for Divya on 27th:', JSON.stringify(allLeaves, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
})();
