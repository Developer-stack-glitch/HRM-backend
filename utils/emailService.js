const nodemailer = require('nodemailer');
require('dotenv').config();

const isWellKnownService = (s) => ['gmail', 'yahoo', 'hotmail', 'outlook365', 'icloud'].includes((s || '').toLowerCase().trim());

const smtpHost = (process.env.SMTP_HOST || 'gmail').trim();
const smtpUser = (process.env.SMTP_USER || '').trim();
const smtpPass = (process.env.SMTP_PASS || '').trim();
const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 587;

let transportOptions;
if (isWellKnownService(smtpHost)) {
    transportOptions = {
        service: smtpHost,
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    };
} else {
    transportOptions = {
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    };
}

const transporter = nodemailer.createTransport(transportOptions);

const sendEmail = async ({ to, subject, text, html, attachments, from }) => {
    try {
        const defaultFrom = process.env.SMTP_FROM || process.env.SMTP_USER || 'hr@acte.in';
        const mailOptions = {
            from: from || defaultFrom,
            to,
            subject,
            text,
            html,
            attachments
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to ${to}: ${info.messageId || info.response}`);
        return info;
    } catch (error) {
        console.error(`Error sending email to ${to}:`, error.message);
        throw error;
    }
};

module.exports = { sendEmail, transporter };
