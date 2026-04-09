const CompanyWeekOff = require('../models/companyWeekoffModel');

exports.saveCompanyWeekOffs = async (req, res) => {
    try {
        const { company_id, days } = req.body;
        console.log('Attempting to save company weekoffs for company_id:', company_id);

        if (!company_id || company_id === 'null' || !Array.isArray(days)) {
            return res.status(400).json({ message: 'A valid Company ID and days array are required' });
        }

        // 1. Get existing weekoffs for this company
        const existing = await CompanyWeekOff.getByCompanyId(company_id);
        const existingDays = existing.map(e => e.day_name);

        // 2. Determine which to add and which to remove
        const toAdd = days.filter(d => !existingDays.includes(d));
        const toRemove = existingDays.filter(d => !days.includes(d));

        // 3. Process changes
        for (const day of toAdd) {
            await CompanyWeekOff.create({ company_id, day_name: day });
        }
        for (const day of toRemove) {
            await CompanyWeekOff.deleteByCompanyAndDay(company_id, day);
        }

        res.status(200).json({ message: 'Company week offs updated successfully' });
    } catch (error) {
        console.error('Error in saveCompanyWeekOffs:', error);
        res.status(500).json({ message: 'Error updating company week offs', error: error.message });
    }
};

exports.getCompanyWeekOffs = async (req, res) => {
    try {
        const { company_id } = req.query;
        if (company_id) {
            const rows = await CompanyWeekOff.getByCompanyId(company_id);
            res.status(200).json(rows);
        } else {
            const rows = await CompanyWeekOff.getAll();
            res.status(200).json(rows);
        }
    } catch (error) {
        res.status(500).json({ message: 'Error fetching company week offs', error: error.message });
    }
};
