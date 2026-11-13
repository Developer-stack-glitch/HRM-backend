const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Clean & normalize SMTP settings from environment variables
 */
const getSmtpConfig = () => {
    const rawHost = (process.env.SMTP_HOST || 'gmail').trim();
    const smtpUser = (process.env.SMTP_USER || '').trim();

    // Sanitize password: strip surrounding quotes & all whitespace (Google App Passwords have spaces)
    let rawPass = (process.env.SMTP_PASS || '').trim();
    rawPass = rawPass.replace(/^['"]|['"]$/g, '');
    const smtpPass = rawPass.replace(/\s+/g, '');

    const smtpPort = parseInt(process.env.SMTP_PORT, 10) || (rawHost === 'gmail' ? 465 : 587);
    const smtpSecure = process.env.SMTP_SECURE !== undefined
        ? (process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1')
        : (smtpPort === 465);

    return {
        host: rawHost,
        user: smtpUser,
        pass: smtpPass,
        port: smtpPort,
        secure: smtpSecure
    };
};

/**
 * Builds nodemailer transport options with production-ready connection timeouts
 */
const buildTransportOptions = (customPort = null, customSecure = null) => {
    const config = getSmtpConfig();
    const isGmailService = config.host.toLowerCase() === 'gmail';
    const port = customPort !== null ? customPort : config.port;
    const secure = customSecure !== null ? customSecure : (port === 465);

    const baseOptions = {
        connectionTimeout: 10000, // 10s timeout prevents hanging on blocked ports
        greetingTimeout: 10000,
        socketTimeout: 15000,
        dnsTimeout: 5000,
        tls: {
            rejectUnauthorized: false // avoids SSL handshake rejection on cloud droplets
        }
    };

    if (isGmailService && customPort === null) {
        return {
            ...baseOptions,
            service: 'gmail',
            auth: {
                user: config.user,
                pass: config.pass
            }
        };
    }

    const host = isGmailService ? 'smtp.gmail.com' : config.host;
    return {
        ...baseOptions,
        host,
        port,
        secure,
        auth: {
            user: config.user,
            pass: config.pass
        }
    };
};

/**
 * Active nodemailer transporter instance
 */
let transporter = nodemailer.createTransport(buildTransportOptions());

/**
 * Diagnostic function to test SMTP connectivity and credentials
 */
const verifySmtpConnection = async () => {
    const config = getSmtpConfig();

    if (!config.user || !config.pass) {
        return {
            success: false,
            error: 'SMTP_USER or SMTP_PASS is missing in environment variables (.env)',
            code: 'ENOCREDENTIALS',
            config: {
                host: config.host,
                port: config.port,
                user: config.user || '(not set)',
                passConfigured: Boolean(config.pass),
                passLength: config.pass.length
            }
        };
    }

    // Attempt primary verification
    try {
        await transporter.verify();
        return {
            success: true,
            message: 'SMTP connection established and authenticated successfully',
            config: {
                host: config.host,
                port: config.port,
                user: config.user,
                passConfigured: true,
                passLength: config.pass.length
            }
        };
    } catch (primaryErr) {
        console.warn(`[EmailService] Primary verify failed (${primaryErr.message}). Testing alternative port/SSL configuration...`);

        // If primary was 587, try 465; if primary was 465, try 587
        const altPort = (config.port === 465) ? 587 : 465;
        const altSecure = altPort === 465;

        try {
            const altTransporter = nodemailer.createTransport(buildTransportOptions(altPort, altSecure));
            await altTransporter.verify();
            console.log(`[EmailService] Fallback to port ${altPort} succeeded! Updating active transporter.`);
            transporter = altTransporter;
            return {
                success: true,
                message: `SMTP connection succeeded using fallback port ${altPort} (secure: ${altSecure})`,
                config: {
                    host: config.host,
                    port: altPort,
                    user: config.user,
                    passConfigured: true,
                    passLength: config.pass.length,
                    note: `Primary configuration failed with ${primaryErr.message}, but port ${altPort} connected successfully.`
                }
            };
        } catch (altErr) {
            let troubleshooting = '';
            if (primaryErr.code === 'ETIMEDOUT' || altErr.code === 'ETIMEDOUT') {
                troubleshooting = 'Connection timed out on both ports 465 and 587. Your hosting provider (DigitalOcean) blocks outbound SMTP ports by default. Please submit a support ticket to DigitalOcean to unblock outbound SMTP ports (465/587), or configure an SMTP relay like SendGrid, Mailgun, or Brevo (port 2525/587).';
            } else if (primaryErr.code === 'EAUTH' || altErr.code === 'EAUTH' || primaryErr.message.includes('535') || altErr.message.includes('535')) {
                troubleshooting = 'Authentication failed. Please verify that SMTP_USER is correct, 2-Step Verification is enabled on the Google Account, and a valid 16-character App Password (without spaces) is set in SMTP_PASS in .env.';
            } else {
                troubleshooting = `SMTP error: ${primaryErr.message} (fallback error: ${altErr.message})`;
            }

            return {
                success: false,
                error: primaryErr.message,
                code: primaryErr.code || 'ESMTPOVERALL',
                altError: altErr.message,
                troubleshooting,
                config: {
                    host: config.host,
                    port: config.port,
                    user: config.user,
                    passConfigured: Boolean(config.pass),
                    passLength: config.pass.length
                }
            };
        }
    }
};

/**
 * Send an email with automatic failover and structured logging
 */
const sendEmail = async ({ to, subject, text, html, attachments, from, replyTo }) => {
    const config = getSmtpConfig();
    const defaultFrom = process.env.SMTP_FROM || config.user || 'hr@acte.in';

    const mailOptions = {
        from: from || defaultFrom,
        to,
        subject,
        text,
        html,
        attachments,
        ...(replyTo ? { replyTo } : {})
    };

    console.log(`[EmailService] Dispatching email to: ${to} | Subject: "${subject}" | From: ${mailOptions.from}`);

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Email sent successfully to ${to}: ${info.messageId || info.response}`);
        return info;
    } catch (error) {
        console.warn(`[EmailService] Primary dispatch failed (${error.message}). Attempting failover...`);

        // If socket / connection error, attempt alternate port
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ESOCKET') {
            const altPort = (config.port === 465) ? 587 : 465;
            try {
                const altTransporter = nodemailer.createTransport(buildTransportOptions(altPort, altPort === 465));
                const altInfo = await altTransporter.sendMail(mailOptions);
                console.log(`[EmailService] Failover email sent successfully to ${to} on port ${altPort}`);
                transporter = altTransporter;
                return altInfo;
            } catch (altErr) {
                console.error(`[EmailService] Failover also failed:`, altErr.message);
            }
        }

        console.error(`[EmailService] Error sending email to ${to}:`, error.message, error.code);
        throw error;
    }
};

module.exports = {
    sendEmail,
    transporter,
    verifySmtpConnection,
    getSmtpConfig
};
