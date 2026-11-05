/**
 * Security headers middleware implementing OWASP recommendations.
 * Provides protection equivalent to helmet without introducing external dependencies.
 */

const securityHeaders = (req, res, next) => {
    // Disable X-Powered-By to prevent framework fingerprinting
    res.removeHeader('X-Powered-By');

    // Prevent MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent Clickjacking / UI Redressing
    res.setHeader('X-Frame-Options', 'DENY');

    // Modern standard for XSS Protection header (replaces deprecated '1; mode=block')
    res.setHeader('X-XSS-Protection', '0');

    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // HSTS (HTTP Strict Transport Security) - enforce HTTPS in production
    if (process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Permissions Policy to disable sensitive browser APIs by default
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

    // Content Security Policy
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' " + (process.env.FRONTEND_URL || '') + " wss: ws: https:; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self';"
    );

    next();
};

module.exports = securityHeaders;

