const asyncHandler = require('express-async-handler');
const RolePermission = require('../models/rolePermissionModel');
const { User } = require('../models/userModel');

// @desc    Get all role permissions
// @route   GET /api/role-permissions
// @access  Private/Admin
const getAllRolePermissions = asyncHandler(async (req, res) => {
    const permissions = await RolePermission.getAllPermissions();
    
    // Enrich with user counts
    const enrichedPermissions = await Promise.all(
        permissions.map(async (p) => {
            const count = await User.countByRole(p.role);
            return { ...p, userCount: count };
        })
    );

    res.json(enrichedPermissions);
});

// @desc    Get permissions for a specific role
// @route   GET /api/role-permissions/:role
// @access  Private
const getRolePermissions = asyncHandler(async (req, res) => {
    const permissions = await RolePermission.getPermissionsByRole(req.params.role);
    res.json(permissions || []);
});

// @desc    Update permissions for a specific role
// @route   POST /api/role-permissions
// @access  Private/Admin
const updateRolePermissions = asyncHandler(async (req, res) => {
    const { role, permissions } = req.body;

    if (!role || !Array.isArray(permissions)) {
        res.status(400);
        throw new Error('Role and permissions are required');
    }

    await RolePermission.upsertPermissions(role, permissions);
    res.json({ message: 'Permissions updated successfully' });
});

// @desc    Delete a role
// @route   DELETE /api/role-permissions/:role
// @access  Private/Admin
const deleteRoleFull = asyncHandler(async (req, res) => {
    const { role } = req.params;

    // Core system roles protection
    const coreRoles = ['superadmin', 'admin', 'employee'];

    if (coreRoles.includes(role.toLowerCase())) {
        // Only superadmin can touch core roles
        if (!req.user || req.user.role !== 'superadmin') {
            res.status(403);
            throw new Error('Only superadmin can modify system roles');
        }

        // Safety: Do not allow deleting the superadmin role itself to prevent total lockout
        if (role.toLowerCase() === 'superadmin') {
            res.status(400);
            throw new Error('System protection: The superadmin role cannot be deleted');
        }
    }

    // Check if any user is assigned to this role
    const userCount = await User.countByRole(role);
    if (userCount > 0) {
        res.status(400);
        throw new Error(`Cannot delete role "${role}" because it is currently assigned to ${userCount} ${userCount === 1 ? 'user' : 'users'}. Please reassign or remove the users first.`);
    }

    await RolePermission.deleteRole(role);
    res.json({ message: 'Role deleted successfully' });
});

module.exports = {
    getAllRolePermissions,
    getRolePermissions,
    updateRolePermissions,
    deleteRoleFull,
};
