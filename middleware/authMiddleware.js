const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const { pool } = require('../Config/dbConfig');

const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            const [rows] = await pool.execute('SELECT id, name, email, role, company FROM users WHERE id = ?', [decoded.id]);
            req.user = rows[0];

            next();
        } catch (error) {
            console.error(error);
            res.status(401);
            throw new Error('Not authorized, token failed');
        }
    }

    if (!token) {
        res.status(401);
        throw new Error('Not authorized, no token');
    }
});

const superAdminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'superadmin') {
        next();
    } else {
        res.status(403);
        throw new Error('Access denied. Superadmin only.');
    }
};

module.exports = { protect, superAdminOnly };
