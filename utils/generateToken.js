const jwt = require('jsonwebtoken');

const generateToken = (id, staySignedIn = false) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: staySignedIn ? '30d' : '1d',
    });
};

module.exports = generateToken;
