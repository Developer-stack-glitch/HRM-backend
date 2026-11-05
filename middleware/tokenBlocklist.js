// In-memory token blocklist with automatic TTL cleanup
// For multi-server clusters, replace or back this with Redis.

const blocklist = new Map();

/**
 * Add a token to the blocklist until its expiration timestamp
 * @param {string} token 
 * @param {number} expSec Expiration time in Unix seconds (from JWT)
 */
const revokeToken = (token, expSec) => {
    if (!token) return;
    const now = Math.floor(Date.now() / 1000);
    const ttl = (expSec && expSec > now) ? (expSec - now) * 1000 : 24 * 60 * 60 * 1000;
    
    blocklist.set(token, Date.now() + ttl);

    // Auto cleanup after TTL
    setTimeout(() => {
        blocklist.delete(token);
    }, ttl).unref();
};

/**
 * Check if a token has been revoked
 * @param {string} token 
 * @returns {boolean}
 */
const isTokenRevoked = (token) => {
    if (!token) return false;
    const expiresAt = blocklist.get(token);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        blocklist.delete(token);
        return false;
    }
    return true;
};

module.exports = {
    revokeToken,
    isTokenRevoked
};

