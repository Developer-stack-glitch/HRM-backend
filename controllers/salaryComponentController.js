const SalaryComponent = require('../models/salaryComponentModel');

const salaryComponentController = {
    create: async (req, res) => {
        try {
            const id = await SalaryComponent.create(req.body);
            res.status(201).json({ message: 'Salary component created successfully', id });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getAll: async (req, res) => {
        try {
            const { company_id } = req.query;
            const components = await SalaryComponent.getAll(company_id);
            res.json(components);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getById: async (req, res) => {
        try {
            const component = await SalaryComponent.getById(req.params.id);
            if (!component) return res.status(404).json({ message: 'Component not found' });
            res.json(component);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    update: async (req, res) => {
        try {
            const affectedRows = await SalaryComponent.update(req.params.id, req.body);
            if (affectedRows === 0) return res.status(404).json({ message: 'Component not found or no changes made' });
            res.json({ message: 'Component updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    delete: async (req, res) => {
        try {
            const affectedRows = await SalaryComponent.delete(req.params.id);
            if (affectedRows === 0) return res.status(404).json({ message: 'Component not found' });
            res.json({ message: 'Component deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    bulkUpdateOrder: async (req, res) => {
        try {
            const { orderData } = req.body;
            if (!orderData || !Array.isArray(orderData)) {
                return res.status(400).json({ error: 'orderData must be an array' });
            }
            await SalaryComponent.bulkUpdateOrder(orderData);
            res.json({ message: 'Order updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = salaryComponentController;
