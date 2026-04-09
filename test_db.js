const { pool } = require('./Config/dbConfig');

async function test() {
    try {
        const [users] = await pool.execute('SELECT id, employee_name, department FROM users WHERE role != "superadmin" LIMIT 5');
        console.log('Users (first 5):', JSON.stringify(users, null, 2));

        const [depts] = await pool.execute('SELECT * FROM departments');
        console.log('Departments:', JSON.stringify(depts, null, 2));

        const [joined] = await pool.execute(`
            SELECT u.id, u.employee_name, u.department, d.name as dept_name 
            FROM users u 
            LEFT JOIN departments d ON u.department = d.id 
            WHERE u.role != "superadmin" LIMIT 5
        `);
        console.log('Joined Data (first 5):', JSON.stringify(joined, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
