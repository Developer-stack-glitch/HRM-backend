const SalaryStructure = require('../models/salaryStructureModel');

const salaryStructureController = {
    create: async (req, res) => {
        try {
            const id = await SalaryStructure.create(req.body);
            res.status(201).json({ message: 'Batch allocation created successfully', id });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getAll: async (req, res) => {
        try {
            const { company_id } = req.query;
            const structures = await SalaryStructure.getAll(company_id);
            // Fetch components for each structure
            const enhancedStructures = await Promise.all(structures.map(async (s) => {
                const components = await SalaryStructure.getComponents(s.id);
                return { ...s, components };
            }));
            res.json(enhancedStructures);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getById: async (req, res) => {
        try {
            const structure = await SalaryStructure.getById(req.params.id);
            if (!structure) return res.status(404).json({ message: 'Batch allocation not found' });
            
            // Add components
            const components = await SalaryStructure.getComponents(req.params.id);
            res.json({ ...structure, components });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    update: async (req, res) => {
        try {
            const affectedRows = await SalaryStructure.update(req.params.id, req.body);
            if (affectedRows === 0) return res.status(404).json({ message: 'Batch allocation not found or no changes made' });
            res.json({ message: 'Batch allocation updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    delete: async (req, res) => {
        try {
            const affectedRows = await SalaryStructure.delete(req.params.id);
            if (affectedRows === 0) return res.status(404).json({ message: 'Batch allocation not found' });
            res.json({ message: 'Batch allocation deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ---- Assignment endpoints ----

    // Assign users to a batch allocation (replaces existing assignments)
    assignUsers: async (req, res) => {
        try {
            const { id } = req.params;
            const { user_ids } = req.body;

            if (!user_ids || !Array.isArray(user_ids)) {
                return res.status(400).json({ error: 'user_ids must be an array' });
            }

            // Remove existing assignments first, then add new ones
            await SalaryStructure.removeAllUsers(id);
            if (user_ids.length > 0) {
                await SalaryStructure.assignUsers(id, user_ids);
            }

            res.json({ message: `${user_ids.length} user(s) assigned successfully` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Remove a single user from a batch allocation
    removeUser: async (req, res) => {
        try {
            const { id, userId } = req.params;
            await SalaryStructure.removeUser(id, userId);
            res.json({ message: 'User removed from batch allocation' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Get users assigned to a batch allocation
    getAssignedUsers: async (req, res) => {
        try {
            const { id } = req.params;
            const users = await SalaryStructure.getAssignedUsers(id);
            res.json(users);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Get all user IDs assigned to ANY batch in the company
    getAllAssignedUsers: async (req, res) => {
        try {
            const { company_id } = req.query;
            if (!company_id) return res.status(400).json({ error: 'company_id is required' });
            const assignedIds = await SalaryStructure.getAllAssignedUsersForCompany(company_id);
            res.json(assignedIds);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Assign components to a batch allocation
    assignComponents: async (req, res) => {
        try {
            const { id } = req.params;
            const { component_ids } = req.body;

            if (!component_ids || !Array.isArray(component_ids)) {
                return res.status(400).json({ error: 'component_ids must be an array' });
            }

            await SalaryStructure.removeAllComponents(id);
            if (component_ids.length > 0) {
                await SalaryStructure.assignComponents(id, component_ids);
            }

            res.json({ message: `${component_ids.length} component(s) assigned successfully` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Get components for a specific batch allocation
    getComponents: async (req, res) => {
        try {
            const { id } = req.params;
            const components = await SalaryStructure.getComponents(id);
            res.json(components);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = salaryStructureController;

