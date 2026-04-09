const Device = require('../models/deviceModel');

exports.getAllDevices = async (req, res) => {
    try {
        const devices = await Device.getAll();
        res.status(200).json(devices);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching devices', error: error.message });
    }
};

exports.getDeviceById = async (req, res) => {
    try {
        const device = await Device.getById(req.params.id);
        if (!device) return res.status(404).json({ message: 'Device not found' });
        res.status(200).json(device);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching device', error: error.message });
    }
};

exports.createDevice = async (req, res) => {
    try {
        const id = await Device.create(req.body);
        res.status(201).json({ message: 'Device created successfully', id });
    } catch (error) {
        res.status(500).json({ message: 'Error creating device', error: error.message });
    }
};

exports.updateDevice = async (req, res) => {
    try {
        await Device.update(req.params.id, req.body);
        res.status(200).json({ message: 'Device updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating device', error: error.message });
    }
};

exports.deleteDevice = async (req, res) => {
    try {
        await Device.delete(req.params.id);
        res.status(200).json({ message: 'Device deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting device', error: error.message });
    }
};
