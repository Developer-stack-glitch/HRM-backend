const { pool } = require('./Config/dbConfig');

async function check() {
    try {
        const [users] = await pool.execute('SHOW CREATE TABLE users');
        console.log('--- users ---');
        console.log(users[0]['Create Table']);
        
        const [shifts] = await pool.execute('SHOW CREATE TABLE shifts');
        console.log('--- shifts ---');
        console.log(shifts[0]['Create Table']);
        
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

check();
