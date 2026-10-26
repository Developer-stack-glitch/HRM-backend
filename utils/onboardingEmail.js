const path = require('path');
const fs = require('fs');
const { sendEmail } = require('./emailService');
const { pool } = require('../Config/dbConfig');
const { User } = require('../models/userModel');

/**
 * Generate a random alphanumeric password (letters & numbers)
 * Guaranteed to have uppercase, lowercase, and numeric digits
 */
const generateRandomPassword = (length = 10) => {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnpqrstuvwxyz';
    const numbers = '23456789';

    const required = [
        uppercase[Math.floor(Math.random() * uppercase.length)],
        uppercase[Math.floor(Math.random() * uppercase.length)],
        lowercase[Math.floor(Math.random() * lowercase.length)],
        lowercase[Math.floor(Math.random() * lowercase.length)],
        numbers[Math.floor(Math.random() * numbers.length)],
        numbers[Math.floor(Math.random() * numbers.length)],
    ];

    const combined = uppercase + lowercase + numbers;
    while (required.length < length) {
        required.push(combined[Math.floor(Math.random() * combined.length)]);
    }

    // Fisher-Yates shuffle
    for (let i = required.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [required[i], required[j]] = [required[j], required[i]];
    }

    return required.join('');
};

/**
 * Format date for clean display (e.g., "Oct 14, 2026")
 */
const formatDate = (dateVal) => {
    if (!dateVal) return 'N/A';
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return String(dateVal);
        return d.toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return String(dateVal);
    }
};

/**
 * Format string to professional Title Case (e.g. "TRAINING AND DEVELOPMENT" -> "Training and Development")
 */
const formatTitleCase = (str) => {
    if (!str || typeof str !== 'string') return str || 'N/A';
    if (str.length <= 4 && str === str.toUpperCase()) return str; // keep acronyms like HR, QA, IT
    return str
        .toLowerCase()
        .split(' ')
        .map(word => {
            if (['and', 'or', 'of', 'in', 'on', 'at', 'to', 'for'].includes(word)) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
};

/**
 * Builds a clean, professional, light UI onboarding HTML email
 */
const buildOnboardingEmailHtml = ({
    employeeName,
    empId,
    department,
    designation,
    branch,
    workLocation,
    doj,
    employmentType,
    loginEmail,
    rawPassword,
    loginUrl,
    companyName,
    companyEmail,
    hasLogo,
    recipientType,
    recipientEmail
}) => {
    const year = new Date().getFullYear();
    const formattedDoj = formatDate(doj);
    const formattedDept = formatTitleCase(department);
    const formattedDesig = formatTitleCase(designation);
    const formattedEmpType = formatTitleCase(employmentType || 'Full-time');
    const locationDisplay = [formatTitleCase(branch), formatTitleCase(workLocation)]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(' - ') || 'Main Office';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #334155;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 36px 12px;">
        <tr>
            <td align="center">
                <!-- Main Email Card -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 2px 4px -2px rgba(0, 0, 0, 0.03);">

                    <!-- Top subtle accent line -->
                    <tr>
                        <td style="height: 4px; background-color: #0f172a;"></td>
                    </tr>

                    <!-- Header & Welcome Message -->
                    <tr>
                        <td style="padding: 32px 32px 20px 32px; text-align: left;">
                            ${hasLogo
                                ? `<div style="margin-bottom: 24px;"><img src="cid:companyLogo" alt="${companyName}" style="max-height: 40px; max-width: 190px; width: auto; object-fit: contain; display: block; border: 0;" /></div>`
                                : `<div style="font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 20px; letter-spacing: -0.01em;">${companyName}</div>`
                            }

                            <h1 style="margin: 0 0 10px 0; font-size: 21px; font-weight: 600; color: #0f172a; letter-spacing: -0.015em; line-height: 1.35;">
                                Welcome to the team, ${employeeName}
                            </h1>
                            <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.6; font-weight: 400;">
                                We are pleased to welcome you to <strong>${companyName}</strong>. Your employee account has been created and your onboarding details and system login credentials are provided below.
                            </p>
                        </td>
                    </tr>

                    <!-- Content Body -->
                    <tr>
                        <td style="padding: 0 32px 28px 32px;">

                            <!-- Employee Summary Table (Subtle, balanced weights) -->
                            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-top: 6px;">
                                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px;">
                                    Employee Summary
                                </div>
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td width="50%" style="padding: 0 8px 12px 0; vertical-align: top;">
                                            <div style="font-size: 12px; color: #64748b; margin-bottom: 3px; font-weight: 400;">Employee ID</div>
                                            <div style="font-size: 13.5px; font-weight: 600; color: #0f172a;">${empId || 'N/A'}</div>
                                        </td>
                                        <td width="50%" style="padding: 0 0 12px 8px; vertical-align: top;">
                                            <div style="font-size: 12px; color: #64748b; margin-bottom: 3px; font-weight: 400;">Designation</div>
                                            <div style="font-size: 13.5px; font-weight: 500; color: #0f172a;">${formattedDesig}</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td width="50%" style="padding: 0 8px 12px 0; vertical-align: top;">
                                            <div style="font-size: 12px; color: #64748b; margin-bottom: 3px; font-weight: 400;">Department</div>
                                            <div style="font-size: 13.5px; font-weight: 500; color: #0f172a;">${formattedDept}</div>
                                        </td>
                                        <td width="50%" style="padding: 0 0 12px 8px; vertical-align: top;">
                                            <div style="font-size: 12px; color: #64748b; margin-bottom: 3px; font-weight: 400;">Date of Joining</div>
                                            <div style="font-size: 13.5px; font-weight: 500; color: #0f172a;">${formattedDoj}</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td width="50%" style="padding: 0 8px 0 0; vertical-align: top;">
                                            <div style="font-size: 12px; color: #64748b; margin-bottom: 3px; font-weight: 400;">Work Location / Branch</div>
                                            <div style="font-size: 13.5px; font-weight: 500; color: #0f172a;">${locationDisplay}</div>
                                        </td>
                                        <td width="50%" style="padding: 0 0 0 8px; vertical-align: top;">
                                            <div style="font-size: 12px; color: #64748b; margin-bottom: 3px; font-weight: 400;">Employment Type</div>
                                            <div style="font-size: 13.5px; font-weight: 500; color: #0f172a;">${formattedEmpType}</div>
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <!-- Login Credentials Card (Clean Light SaaS style) -->
                            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-top: 20px;">
                                <div style="font-size: 13.5px; font-weight: 600; color: #0f172a; margin-bottom: 14px;">
                                    Portal Login Credentials
                                </div>

                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td style="padding-bottom: 12px;">
                                            <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
                                                Portal URL
                                            </div>
                                            <a href="${loginUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 13px; font-weight: 500; color: #2563eb; text-decoration: none; word-break: break-all;">
                                                ${loginUrl}
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding-bottom: 12px;">
                                            <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
                                                Login Email ID
                                            </div>
                                            <div style="font-size: 13.5px; font-weight: 500; color: #0f172a;">
                                                ${loginEmail}
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                                                Initial Temporary Password
                                            </div>
                                            <div style="display: inline-block; background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 14px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; font-size: 14px; font-weight: 600; color: #0f172a; letter-spacing: 0.05em;">
                                                ${rawPassword}
                                            </div>
                                        </td>
                                    </tr>
                                </table>

                                <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b; line-height: 1.45;">
                                    Please use this temporary password to sign in for the first time. For security, you can update your password anytime under your profile settings.
                                </div>
                            </div>

                            <!-- Clean Corporate Action Button -->
                            <div style="text-align: center; margin: 26px 0 22px 0;">
                                <a href="${loginUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #0f172a; color: #ffffff; padding: 12px 28px; border-radius: 7px; font-size: 13.5px; font-weight: 500; text-decoration: none; display: inline-block;">
                                    Log In to Employee Portal &rarr;
                                </a>
                            </div>

                            <!-- First-Day Checklist -->
                            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-top: 8px;">
                                <div style="font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 10px;">
                                    First Day Checklist:
                                </div>
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td width="16" style="vertical-align: top; padding-bottom: 6px; font-size: 13px; color: #64748b;">&bull;</td>
                                        <td style="vertical-align: top; font-size: 13px; color: #475569; padding-bottom: 6px; line-height: 1.45;">
                                            Sign in to the employee portal using your login credentials above.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td width="16" style="vertical-align: top; padding-bottom: 6px; font-size: 13px; color: #64748b;">&bull;</td>
                                        <td style="vertical-align: top; font-size: 13px; color: #475569; padding-bottom: 6px; line-height: 1.45;">
                                            Review and verify your personal details, emergency contacts, and bank information.
                                        </td>
                                    </tr>
                                    <tr>
                                        <td width="16" style="vertical-align: top; font-size: 13px; color: #64748b;">&bull;</td>
                                        <td style="vertical-align: top; font-size: 13px; color: #475569; line-height: 1.45;">
                                            Check your assigned shift timing, attendance rules, and organization policies.
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <!-- Support note -->
                            <div style="margin-top: 22px; text-align: center; font-size: 12.5px; color: #64748b; line-height: 1.5;">
                                Need help getting started? Contact the HR team at 
                                <a href="mailto:${companyEmail}" style="color: #2563eb; text-decoration: none; font-weight: 500;">${companyEmail}</a>.
                            </div>

                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 18px 24px; text-align: center;">
                            <p style="margin: 0 0 4px 0; font-size: 11.5px; color: #94a3b8;">
                                Delivered to <strong>${recipientEmail}</strong> (${recipientType}).
                            </p>
                            <p style="margin: 0; font-size: 11px; color: #cbd5e1;">
                                &copy; ${year} ${companyName}. All rights reserved.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
};

/**
 * Dispatches onboarding emails to both official and personal emails with inline logo attachment
 * @param {Object} params
 * @param {number|string} params.userId
 * @param {string} params.rawPassword
 */
const sendOnboardingEmails = async ({ userId, rawPassword }) => {
    try {
        if (!userId) return { success: false, message: 'User ID is required' };

        // 1. Fetch full user details with names resolved
        const user = await User.findById(userId);
        if (!user) {
            console.error(`sendOnboardingEmails: User ${userId} not found`);
            return { success: false, message: 'User not found' };
        }

        // 2. Fetch company details for branding
        let company = null;
        if (user.company) {
            const [[c]] = await pool.execute('SELECT * FROM companies WHERE id = ?', [user.company]);
            company = c;
        }
        if (!company) {
            const [[c]] = await pool.execute('SELECT * FROM companies LIMIT 1');
            company = c;
        }

        const companyName = company?.name || 'Human Resource Team';
        const companyEmail = company?.email || process.env.SMTP_FROM || process.env.SMTP_USER || 'hr@acte.in';
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const loginUrl = `${frontendUrl}/login`;

        // 3. Resolve Company Logo for inline CID attachment (works reliably across all email clients)
        const attachments = [];
        let hasLogo = false;

        if (company?.logo) {
            const cleanPath = company.logo.replace(/\\/g, '/').replace(/^\/+/, '');
            const absoluteLogoPath = path.resolve(__dirname, '..', cleanPath);
            if (fs.existsSync(absoluteLogoPath)) {
                attachments.push({
                    filename: path.basename(absoluteLogoPath),
                    path: absoluteLogoPath,
                    cid: 'companyLogo'
                });
                hasLogo = true;
            }
        }

        // 4. Collect unique email recipients (Official & Personal)
        const recipients = [];
        const officialEmail = (user.off_mail_id || user.email || '').trim();
        const personalEmail = (user.per_mail_id || '').trim();

        if (officialEmail) {
            recipients.push({ email: officialEmail, type: 'Official Email' });
        }
        if (personalEmail && personalEmail.toLowerCase() !== officialEmail.toLowerCase()) {
            recipients.push({ email: personalEmail, type: 'Personal Email' });
        }

        if (recipients.length === 0) {
            console.log(`sendOnboardingEmails: No email addresses found for user ${userId}`);
            return { success: false, message: 'No email address found for user' };
        }

        console.log(`Sending onboarding email for employee "${user.employee_name || user.name}" to:`, recipients.map(r => `${r.email} (${r.type})`).join(', '));

        const loginEmail = officialEmail || personalEmail;
        const initialPassword = rawPassword || generateRandomPassword(10);
        const subject = `Welcome to ${companyName} - Your Account Credentials`;

        // 5. Send emails in parallel
        const dispatchPromises = recipients.map(rec => {
            const html = buildOnboardingEmailHtml({
                employeeName: user.employee_name || user.name,
                empId: user.emp_id,
                department: user.department_name || user.department,
                designation: user.designation_name || user.designation,
                branch: user.branch_name || user.branch,
                workLocation: user.work_location_name || user.work_location,
                doj: user.doj,
                employmentType: user.employment_type_name || user.employment_type,
                loginEmail,
                rawPassword: initialPassword,
                loginUrl,
                companyName,
                companyEmail,
                hasLogo,
                recipientType: rec.type,
                recipientEmail: rec.email
            });

            return sendEmail({
                to: rec.email,
                subject,
                html,
                attachments: attachments.length > 0 ? attachments : undefined
            }).then(() => ({
                email: rec.email,
                type: rec.type,
                success: true
            })).catch(err => {
                console.error(`Error sending onboarding email to ${rec.email} (${rec.type}):`, err.message);
                return {
                    email: rec.email,
                    type: rec.type,
                    success: false,
                    error: err.message
                };
            });
        });

        const results = await Promise.all(dispatchPromises);
        console.log('Onboarding email dispatch results:', results);
        return { success: true, results };
    } catch (error) {
        console.error('Error in sendOnboardingEmails:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendOnboardingEmails,
    buildOnboardingEmailHtml,
    generateRandomPassword
};
