const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User } = require('../models/userModel');
const generateToken = require('../utils/generateToken');
const { pool } = require('../Config/dbConfig');
const { sendEmail } = require('../utils/emailService');
const { revokeToken } = require('../middleware/tokenBlocklist');

// In-memory failed OTP attempt tracker: email -> { count, lockedUntil }
const otpAttempts = new Map();

/**
 * Hash an OTP string with SHA-256 for secure storage
 */
const hashOtp = (otp) => {
    return crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
};

/**
 * Validates password complexity
 * Requires: min 8 characters, at least 1 letter and 1 number
 */
const validatePasswordStrength = (password) => {
    if (!password || typeof password !== 'string') return false;
    if (password.length < 8) return false;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return hasLetter && hasNumber;
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
    const { email, password, staySignedIn, fcmToken } = req.body;

    if (!email || !password) {
        res.status(400);
        throw new Error('Email and password are required');
    }

    const user = await User.findByEmail(email.trim().toLowerCase());

    if (user && (await bcrypt.compare(password, user.password))) {
        // Update FCM Token if provided
        if (fcmToken) {
            await pool.execute('UPDATE users SET fcm_token = ? WHERE id = ?', [fcmToken, user.id]);
        }

        // Fetch role permissions
        const RolePermission = require('../models/rolePermissionModel');
        const permissions = await RolePermission.getPermissionsByRole(user.role);

        res.json({
            id: user.id,
            _id: user.id,
            name: user.name || user.employee_name,
            employee_name: user.employee_name,
            email: user.email,
            role: user.role,
            company: user.company,
            team_lead: user.team_lead,
            permissions: permissions || [],
            token: generateToken(user.id, staySignedIn),
        });
    } else {
        res.status(401);
        throw new Error('Invalid email or password');
    }
});

// @desc    Logout user & invalidate JWT session
// @route   POST /api/auth/logout
// @access  Private
const logoutUser = asyncHandler(async (req, res) => {
    if (req.userToken) {
        revokeToken(req.userToken, req.tokenExp);
    }
    res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// @desc    Request password reset (OTP)
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        res.status(400);
        throw new Error('Email is required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findByEmail(normalizedEmail);

    // Uniform response to eliminate user enumeration vulnerability
    if (!user) {
        return res.status(200).json({
            success: true,
            message: 'If an account exists with this email, a verification code has been sent.'
        });
    }

    // Cryptographically secure 6-digit OTP (100000 - 999999)
    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = hashOtp(otp);
    const resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Store hashed OTP in database
    await pool.execute(
        'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
        [hashedOtp, resetOtpExpiry, user.id]
    );

    // Reset failed verification attempts tracker
    otpAttempts.delete(normalizedEmail);

    const message = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #4F46E5; text-align: center;">Verification Code</h2>
            <p>Your one-time password (OTP) for resetting your account password is:</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #111827; margin: 20px 0;">
                ${otp}
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">If you did not request this code, please ignore this email.</p>
        </div>
    `;

    try {
        await sendEmail({
            to: user.email,
            subject: `${otp} is your verification code`,
            html: message,
        });

        res.status(200).json({
            success: true,
            message: 'If an account exists with this email, a verification code has been sent.'
        });
    } catch (error) {
        console.error('Email send error:', error);
        await pool.execute(
            'UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
            [user.id]
        );
        res.status(500);
        throw new Error('Email delivery failed. Please try again later.');
    }
});

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        res.status(400);
        throw new Error('Email and OTP are required');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check failed attempt lockout
    const attemptRecord = otpAttempts.get(normalizedEmail) || { count: 0, lockedUntil: 0 };
    if (Date.now() < attemptRecord.lockedUntil) {
        res.status(429);
        throw new Error('Too many invalid attempts. Please wait 15 minutes or request a new OTP.');
    }

    const hashedOtp = hashOtp(otp);

    const [rows] = await pool.execute(
        'SELECT id FROM users WHERE email = ? AND reset_token = ? AND reset_token_expiry > ?',
        [normalizedEmail, hashedOtp, new Date()]
    );

    if (rows.length === 0) {
        attemptRecord.count += 1;
        if (attemptRecord.count >= 5) {
            attemptRecord.lockedUntil = Date.now() + 15 * 60 * 1000;
            // Invalidate the token in database on excessive failed attempts
            await pool.execute(
                'UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE email = ?',
                [normalizedEmail]
            );
        }
        otpAttempts.set(normalizedEmail, attemptRecord);

        res.status(400);
        throw new Error('Invalid or expired OTP');
    }

    // Success: reset attempts
    otpAttempts.delete(normalizedEmail);

    res.status(200).json({ success: true, message: 'OTP verified successfully' });
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        res.status(400);
        throw new Error('Email, OTP, and new password are required');
    }

    if (!validatePasswordStrength(newPassword)) {
        res.status(400);
        throw new Error('Password must be at least 8 characters long and contain both letters and numbers.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const hashedOtp = hashOtp(otp);

    const [rows] = await pool.execute(
        'SELECT id FROM users WHERE email = ? AND reset_token = ? AND reset_token_expiry > ?',
        [normalizedEmail, hashedOtp, new Date()]
    );

    const user = rows[0];

    if (!user) {
        res.status(400);
        throw new Error('Invalid or expired OTP');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear reset token
    await pool.execute(
        'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
        [hashedPassword, user.id]
    );

    otpAttempts.delete(normalizedEmail);

    res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
});

module.exports = {
    loginUser,
    logoutUser,
    forgotPassword,
    verifyOtp,
    resetPassword,
};
