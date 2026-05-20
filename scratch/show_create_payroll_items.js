const mysql = require('mysql2/promise');

async function main() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'hrm_database'
    });
    try {
        const [rows] = await connection.query("SHOW TABLES LIKE 'payroll_items'");
        if (rows.length > 0) {
            const [createRows] = await connection.query('SHOW CREATE TABLE payroll_items');
            console.log(createRows[0]['Create Table']);
        } else {
            console.log("payroll_items table does not exist.");
        }
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

main();
