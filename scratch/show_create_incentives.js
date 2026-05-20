const mysql = require('mysql2/promise');

async function main() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'hrm_database'
    });
    try {
        const [rows] = await connection.query('SHOW CREATE TABLE payroll_incentives');
        console.log(rows[0]['Create Table']);
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

main();
