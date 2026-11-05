const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const { pool } = require('../Config/dbConfig');
const { isTokenRevoked } = require('./tokenBlocklist');

/**
 * Checks if a user has administrative/HR privileges
 */
const isUserAdmin = (user) => {
    if (!user || !user.role) return false;
    const r = user.role.toLowerCase().trim();
    return r === 'superadmin' || r === 'admin' || r === 'hr executive' || r.includes('admin') || r.includes('hr');
};

/**
 * Protect middleware: validates JWT, checks blocklist, ensures user exists in DB
 */
const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    } else if (req.query && req.query.token) {
        // Supported for secure media/document streaming
        token = req.query.token;
    }

    if (!token) {
        res.status(401);
        throw new Error('Not authorized, no token provided');
    }

    // Check if token has been explicitly revoked upon logout
    if (isTokenRevoked(token)) {
        res.status(401);
        throw new Error('Not authorized, session has been revoked. Please log in again.');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [rows] = await pool.execute(
            'SELECT id, name, employee_name, email, role, company, department, branch, reporting_manager FROM users WHERE id = ?',
            [decoded.id]
        );

        if (!rows || rows.length === 0) {
            res.status(401);
            throw new Error('Not authorized, user account no longer exists');
        }

        req.user = rows[0];
        req.userToken = token;
        req.tokenExp = decoded.exp;

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            res.status(401);
            throw new Error('Token has expired, please log in again');
        }
        res.status(401);
        throw new Error('Not authorized, invalid token');
    }
});

/**
 * Restricts access to Superadmin only
 */
const superAdminOnly = (req, res, next) => {
    if (req.user && req.user.role && req.user.role.toLowerCase().trim() === 'superadmin') {
        next();
    } else {
        res.status(403);
        throw new Error('Access denied. Superadmin only.');
    }
};

/**
 * Restricts access to Admin, Superadmin, and HR Executive roles
 */
const adminOnly = (req, res, next) => {
    if (isUserAdmin(req.user)) {
        next();
    } else {
        res.status(403);
        throw new Error('Access denied. Administrator or HR privileges required.');
    }
};

/**
 * Higher-order middleware to require specific role(s)
 */
const requireRoles = (...allowedRoles) => {
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase().trim());
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            res.status(403);
            throw new Error('Access denied. User role not recognized.');
        }
        const userRole = req.user.role.toLowerCase().trim();
        if (normalizedAllowed.includes(userRole) || userRole === 'superadmin') {
            next();
        } else {
            res.status(403);
            throw new Error(`Access denied. Allowed roles: ${allowedRoles.join(', ')}`);
        }
    };
};

module.exports = {
    protect,
    superAdminOnly,
    adminOnly,
    requireRoles,
    isUserAdmin
};
