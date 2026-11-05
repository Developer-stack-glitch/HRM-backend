/**
 * Lightweight sliding-window in-memory rate limiter middleware.
 * Zero external dependencies.
 */

const createRateLimiter = ({
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // max requests per windowMs
    message = 'Too many requests from this IP, please try again later.',
    keyGenerator = (req) => req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
} = {}) => {
    const hits = new Map();

    // Clean up stale entries every 5 minutes
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, record] of hits.entries()) {
            if (now > record.resetTime) {
                hits.delete(key);
            }
        }
    }, 5 * 60 * 1000);
    cleanupInterval.unref();

    return (req, res, next) => {
        const key = keyGenerator(req);
        const now = Date.now();

        let record = hits.get(key);

        if (!record || now > record.resetTime) {
            record = {
                count: 1,
                resetTime: now + windowMs
            };
            hits.set(key, record);
        } else {
            record.count += 1;
        }

        const remaining = Math.max(0, max - record.count);
        const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetSeconds);

        if (record.count > max) {
            res.setHeader('Retry-After', resetSeconds);
            return res.status(429).json({
                success: false,
                message,
                retryAfter: resetSeconds
            });
        }

        next();
    };
};

// Pre-configured rate limiters for critical authentication routes
const loginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 failed/success attempts per IP
    message: 'Too many login attempts. Please wait 15 minutes before trying again.'
});

const otpLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // max 5 OTP requests / verifications per window
    message: 'Too many OTP attempts. Please wait 10 minutes before trying again.'
});

const generalApiLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute
    message: 'Too many requests. Please slow down.'
});

module.exports = {
    createRateLimiter,
    loginLimiter,
    otpLimiter,
    generalApiLimiter
};

