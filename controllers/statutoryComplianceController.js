const { pool } = require('../Config/dbConfig');

const statutoryComplianceController = {
    // PF
    getPF: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM statutory_pf WHERE company_id = ? OR ? IS NULL ORDER BY created_at DESC', [company_id || null, company_id || null]);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    createPF: async (req, res) => {
        try {
            const { company_id, month, employees_count, wages, er_share, ee_share, total_epf, status, trrn_no, challan_file } = req.body;
            const [result] = await pool.execute(
                'INSERT INTO statutory_pf (company_id, month, employees_count, wages, er_share, ee_share, total_epf, status, trrn_no, challan_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [company_id || null, month || null, employees_count || 0, wages || 0, er_share || 0, ee_share || 0, total_epf || 0, status || 'Pending', trrn_no || null, challan_file || null]
            );
            res.status(201).json({ id: result.insertId, message: 'PF record created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ESI
    getESI: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM statutory_esi WHERE company_id = ? OR ? IS NULL ORDER BY created_at DESC', [company_id || null, company_id || null]);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    createESI: async (req, res) => {
        try {
            const { company_id, month, insured_persons, wages, er_share, ee_share, total_esi, status, challan_id, challan_file } = req.body;
            const [result] = await pool.execute(
                'INSERT INTO statutory_esi (company_id, month, insured_persons, wages, er_share, ee_share, total_esi, status, challan_id, challan_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [company_id || null, month || null, insured_persons || 0, wages || 0, er_share || 0, ee_share || 0, total_esi || 0, status || 'Pending', challan_id || null, challan_file || null]
            );
            res.status(201).json({ id: result.insertId, message: 'ESI record created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // PT
    getPT: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM statutory_pt WHERE company_id = ? OR ? IS NULL ORDER BY created_at DESC', [company_id || null, company_id || null]);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    createPT: async (req, res) => {
        try {
            const { company_id, month, state, taxable_employees, amount, filing_date, status, challan_file } = req.body;
            const [result] = await pool.execute(
                'INSERT INTO statutory_pt (company_id, month, state, taxable_employees, amount, filing_date, status, challan_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [company_id || null, month || null, state || null, taxable_employees || 0, amount || 0, filing_date || null, status || 'Pending', challan_file || null]
            );
            res.status(201).json({ id: result.insertId, message: 'PT record created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // TDS
    getTDS: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM statutory_tds WHERE company_id = ? OR ? IS NULL ORDER BY created_at DESC', [company_id || null, company_id || null]);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    createTDS: async (req, res) => {
        try {
            const { company_id, period, section, payout, tds_deducted, fine, bsr_code, challan_no, status, challan_file } = req.body;
            const [result] = await pool.execute(
                'INSERT INTO statutory_tds (company_id, period, section, payout, tds_deducted, fine, bsr_code, challan_no, status, challan_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [company_id || null, period || null, section || null, payout || 0, tds_deducted || 0, fine || 0, bsr_code || null, challan_no || null, status || 'Pending', challan_file || null]
            );
            res.status(201).json({ id: result.insertId, message: 'TDS record created successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Get Summary Stats for Dashboard Cards
    getSummaryStats: async (req, res) => {
        try {
            const { company_id } = req.query;
            const queryPF = 'SELECT SUM(total_epf) as total FROM statutory_pf WHERE (company_id = ? OR ? IS NULL) AND status = "Paid"';
            const queryESI = 'SELECT SUM(total_esi) as total FROM statutory_esi WHERE (company_id = ? OR ? IS NULL) AND status = "Paid"';
            const queryPT = 'SELECT SUM(amount) as total FROM statutory_pt WHERE (company_id = ? OR ? IS NULL) AND status = "Filed"';
            const queryTDS = 'SELECT SUM(tds_deducted) as total FROM statutory_tds WHERE (company_id = ? OR ? IS NULL) AND status = "Pending"';

            const [[rowPF]] = await pool.execute(queryPF, [company_id || null, company_id || null]);
            const [[rowESI]] = await pool.execute(queryESI, [company_id || null, company_id || null]);
            const [[rowPT]] = await pool.execute(queryPT, [company_id || null, company_id || null]);
            const [[rowTDS]] = await pool.execute(queryTDS, [company_id || null, company_id || null]);

            res.json({
                pf_contribution: Number(rowPF?.total || 0),
                esi_contribution: Number(rowESI?.total || 0),
                pt_paid: Number(rowPT?.total || 0),
                tds_payable: Number(rowTDS?.total || 0)
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    deletePF: async (req, res) => {
        try {
            await pool.execute('DELETE FROM statutory_pf WHERE id = ?', [req.params.id]);
            res.json({ message: 'PF record deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    deleteESI: async (req, res) => {
        try {
            await pool.execute('DELETE FROM statutory_esi WHERE id = ?', [req.params.id]);
            res.json({ message: 'ESI record deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    deletePT: async (req, res) => {
        try {
            await pool.execute('DELETE FROM statutory_pt WHERE id = ?', [req.params.id]);
            res.json({ message: 'PT record deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    deleteTDS: async (req, res) => {
        try {
            await pool.execute('DELETE FROM statutory_tds WHERE id = ?', [req.params.id]);
            res.json({ message: 'TDS record deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = statutoryComplianceController;

