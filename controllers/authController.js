const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User } = require('../models/userModel');
const generateToken = require('../utils/generateToken');
const { pool } = require('../Config/dbConfig');
const { sendEmail } = require('../utils/emailService');

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
    const { email, password, staySignedIn } = req.body;

    const user = await User.findByEmail(email);

    if (user && (await bcrypt.compare(password, user.password))) {
        // Fetch role permissions
        const RolePermission = require('../models/rolePermissionModel');
        const permissions = await RolePermission.getPermissionsByRole(user.role);

        res.json({
            id: user.id,
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            company: user.company,
            team_lead: user.team_lead,
            permissions: permissions || [],
            database: process.env.DB_NAME,
            is_main_db: true,
            token: generateToken(user.id, staySignedIn),
        });
    } else {
        res.status(401);
        throw new Error('Invalid email or password');
    }
});

// @desc    Request password reset (OTP)
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await User.findByEmail(email);

    if (!user) {
        res.status(404);
        throw new Error('User not found with this email');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const resetOtpExpiry = new Date(Date.now() + 600000); // 10 minutes from now

    // Update user with OTP and expiry
    await pool.execute(
        'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
        [otp, resetOtpExpiry, user.id]
    );

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

        res.status(200).json({ success: true, message: 'OTP sent to your email' });
    } catch (error) {
        console.error('Email send error:', error);
        await pool.execute(
            'UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
            [user.id]
        );
        res.status(500);
        throw new Error('Email could not be sent');
    }
});

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    const [rows] = await pool.execute(
        'SELECT * FROM users WHERE email = ? AND reset_token = ? AND reset_token_expiry > ?',
        [email, otp, new Date()]
    );

    if (rows.length === 0) {
        res.status(400);
        throw new Error('Invalid or expired OTP');
    }

    res.status(200).json({ success: true, message: 'OTP verified successfully' });
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;

    const [rows] = await pool.execute(
        'SELECT * FROM users WHERE email = ? AND reset_token = ? AND reset_token_expiry > ?',
        [email, otp, new Date()]
    );

    const user = rows[0];

    if (!user) {
        res.status(400);
        throw new Error('Invalid or expired OTP');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.execute(
        'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
        [hashedPassword, user.id]
    );

    res.status(200).json({ success: true, message: 'Password reset successfully' });
});

module.exports = {
    loginUser,
    forgotPassword,
    verifyOtp,
    resetPassword,
};
