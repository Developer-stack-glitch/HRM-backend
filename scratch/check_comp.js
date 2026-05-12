const { pool } = require('../Config/dbConfig');
async function check() {
    try {
        const [rows] = await pool.execute('SELECT name, calculation_type, calculation_value FROM salary_components WHERE name IN ("PF", "PT")');
        console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
check();
