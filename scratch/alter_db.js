const { pool } = require('../Config/dbConfig');
pool.query("ALTER TABLE payroll_incentives ADD COLUMN type ENUM('addition', 'deduction') DEFAULT 'addition'")
  .then(() => { console.log('Column added'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
