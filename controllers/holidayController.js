const Holiday = require('../models/holidayModel');
const Organization = require('../models/organizationModel');
const { getTenantPool } = require('../Config/dbConfig');

const createHoliday = async (req, res) => {
    try {
        const { company_id } = req.body;
        let targetPool = null;
        let tenantPool = null;

        if (company_id) {
            const company = await Organization.getCompanyById(company_id);
            if (company && company.db_name) {
                tenantPool = getTenantPool(company.db_name);
                targetPool = tenantPool;
            }
        }

        const id = await Holiday.create(req.body, targetPool);

        if (tenantPool) {
            await tenantPool.end();
        }

        res.status(201).json({ message: 'Holiday created successfully', id });
    } catch (error) {
        console.error('Error in createHoliday:', error);
        res.status(500).json({ message: 'Error creating holiday', error: error.message });
    }
};

const getHolidays = async (req, res) => {
    try {
        const { company_id, year } = req.query;
        let tenantPool = null;
        let holidays;

        if (company_id) {
            const company = await Organization.getCompanyById(company_id);
            if (company && company.db_name) {
                tenantPool = getTenantPool(company.db_name);
                holidays = await Holiday.getAll(year, tenantPool);
                await tenantPool.end();
            } else {
                holidays = await Holiday.getByCompanyId(company_id, year);
            }
        } else {
            holidays = await Holiday.getAll(year);
        }

        res.status(200).json(holidays);
    } catch (error) {
        console.error('Error in getHolidays:', error);
        res.status(500).json({ message: 'Error fetching holidays', error: error.message });
    }
};

const updateHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const { company_id } = req.body;
        let targetPool = null;
        let tenantPool = null;

        if (company_id) {
            const company = await Organization.getCompanyById(company_id);
            if (company && company.db_name) {
                tenantPool = getTenantPool(company.db_name);
                targetPool = tenantPool;
            }
        }

        await Holiday.update(id, req.body, targetPool);

        if (tenantPool) {
            await tenantPool.end();
        }

        res.status(200).json({ message: 'Holiday updated successfully' });
    } catch (error) {
        console.error('Error in updateHoliday:', error);
        res.status(500).json({ message: 'Error updating holiday', error: error.message });
    }
};

const deleteHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const { company_id } = req.query;
        let targetPool = null;
        let tenantPool = null;

        if (company_id) {
            const company = await Organization.getCompanyById(company_id);
            if (company && company.db_name) {
                tenantPool = getTenantPool(company.db_name);
                targetPool = tenantPool;
            }
        }

        await Holiday.delete(id, targetPool);

        if (tenantPool) {
            await tenantPool.end();
        }

        res.status(200).json({ message: 'Holiday deleted successfully' });
    } catch (error) {
        console.error('Error in deleteHoliday:', error);
        res.status(500).json({ message: 'Error deleting holiday', error: error.message });
    }
};

module.exports = {
    createHoliday,
    getHolidays,
    updateHoliday,
    deleteHoliday
};
