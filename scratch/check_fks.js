const mysql = require('mysql2/promise');

async function main() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'hrm_database'
    });
    try {
        const [rows] = await connection.query(`
            SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME 
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
            WHERE REFERENCED_TABLE_SCHEMA = 'hrm_database' 
              AND REFERENCED_TABLE_NAME = 'users'
        `);
        console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

main();
