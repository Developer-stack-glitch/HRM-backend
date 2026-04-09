const { pool } = require('../Config/dbConfig');

class CompanyPolicy {
    static async getByCompanyId(companyId) {
        const [rows] = await pool.execute(
            'SELECT * FROM company_policies WHERE company_id = ?',
            [companyId]
        );
        return rows[0] || null;
    }

    static async save(data) {
        const { company_id, cl_limit, permission_limit } = data;
        const existing = await this.getByCompanyId(company_id);

        if (existing) {
            await pool.execute(
                'UPDATE company_policies SET cl_limit = ?, permission_limit = ? WHERE company_id = ?',
                [cl_limit || 0, permission_limit || 0, company_id]
            );
            return existing.id;
        } else {
            const [result] = await pool.execute(
                'INSERT INTO company_policies (company_id, cl_limit, permission_limit) VALUES (?, ?, ?)',
                [company_id, cl_limit || 0, permission_limit || 0]
            );
            return result.insertId;
        }
    }
}

module.exports = CompanyPolicy;
