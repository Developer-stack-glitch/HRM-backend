const { pool } = require('../Config/dbConfig');

const handleSettingsUpdate = async (tableName, company_id, settings) => {
    const keys = Object.keys(settings);
    const values = Object.values(settings);
    
    // Check if entry exists
    const [existing] = await pool.execute(`SELECT id FROM ${tableName} WHERE company_id = ?`, [company_id]);
    
    if (existing.length > 0) {
        const updateFields = keys.map(k => `${k} = ?`).join(', ');
        await pool.execute(`UPDATE ${tableName} SET ${updateFields} WHERE company_id = ?`, [...values, company_id]);
    } else {
        const insertKeys = ['company_id', ...keys].join(', ');
        const insertPlaceholders = ['?', ...keys.map(() => '?')].join(', ');
        await pool.execute(`INSERT INTO ${tableName} (${insertKeys}) VALUES (${insertPlaceholders})`, [company_id, ...values]);
    }
};

const complianceSettingsController = {
    // PF
    getPFSettings: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM compliance_pf_settings WHERE company_id = ?', [company_id]);
            res.json(rows[0] || {});
        } catch (error) { res.status(500).json({ error: error.message }); }
    },
    updatePFSettings: async (req, res) => {
        try {
            const { company_id, ...settings } = req.body;
            await handleSettingsUpdate('compliance_pf_settings', company_id, settings);
            res.json({ message: 'PF settings updated successfully' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // ESI
    getESISettings: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM compliance_esi_settings WHERE company_id = ?', [company_id]);
            res.json(rows[0] || {});
        } catch (error) { res.status(500).json({ error: error.message }); }
    },
    updateESISettings: async (req, res) => {
        try {
            const { company_id, ...settings } = req.body;
            await handleSettingsUpdate('compliance_esi_settings', company_id, settings);
            res.json({ message: 'ESI settings updated successfully' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // PT
    getPTSettings: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM compliance_pt_settings WHERE company_id = ?', [company_id]);
            res.json(rows[0] || {});
        } catch (error) { res.status(500).json({ error: error.message }); }
    },
    updatePTSettings: async (req, res) => {
        try {
            const { company_id, ...settings } = req.body;
            await handleSettingsUpdate('compliance_pt_settings', company_id, settings);
            res.json({ message: 'PT registration settings updated successfully' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },
    getPTStates: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM compliance_pt_states WHERE company_id = ? ORDER BY state_name ASC', [company_id]);
            res.json(rows);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },
    updatePTState: async (req, res) => {
        try {
            const { id } = req.params;
            const { is_applicable, no_of_slabs } = req.body;
            await pool.execute(
                'UPDATE compliance_pt_states SET is_applicable = ?, no_of_slabs = ? WHERE id = ?',
                [is_applicable, no_of_slabs, id]
            );
            res.json({ message: 'State PT settings updated successfully' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // LWF
    getLWFSettings: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM compliance_lwf_settings WHERE company_id = ?', [company_id]);
            res.json(rows[0] || {});
        } catch (error) { res.status(500).json({ error: error.message }); }
    },
    updateLWFSettings: async (req, res) => {
        try {
            const { company_id, ...settings } = req.body;
            await handleSettingsUpdate('compliance_lwf_settings', company_id, settings);
            res.json({ message: 'LWF registration settings updated successfully' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },
    getLWFStates: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM compliance_lwf_states WHERE company_id = ? ORDER BY state_name ASC', [company_id]);
            res.json(rows);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },
    updateLWFState: async (req, res) => {
        try {
            const { id } = req.params;
            const { is_applicable, frequency, ee_share, er_share } = req.body;
            await pool.execute(
                'UPDATE compliance_lwf_states SET is_applicable = ?, frequency = ?, ee_share = ?, er_share = ? WHERE id = ?',
                [is_applicable, frequency, ee_share, er_share, id]
            );
            res.json({ message: 'State LWF settings updated successfully' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // TDS
    getTDSSettings: async (req, res) => {
        try {
            const { company_id } = req.query;
            const [rows] = await pool.execute('SELECT * FROM compliance_tds_settings WHERE company_id = ?', [company_id]);
            res.json(rows[0] || {});
        } catch (error) { res.status(500).json({ error: error.message }); }
    },
    updateTDSSettings: async (req, res) => {
        try {
            const { company_id, ...settings } = req.body;
            await handleSettingsUpdate('compliance_tds_settings', company_id, settings);
            res.json({ message: 'TDS settings updated successfully' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    }
};

module.exports = complianceSettingsController;
