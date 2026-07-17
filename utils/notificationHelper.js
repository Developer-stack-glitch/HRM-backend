const Notification = require('../models/notificationModel');

/**
 * Send a notification to a specific user or role
 * @param {Object} io - Socket.io instance
 * @param {Object} data - Notification data
 */
const sendNotification = async (io, data) => {
    try {
        const { user_id, role, type, title, message, extra_data } = data;

        // Save to database
        const notificationId = await Notification.create({
            user_id,
            role,
            type,
            title,
            message,
            extra_data
        });

        const notification = {
            id: notificationId,
            user_id,
            role,
            type,
            title,
            message,
            data: extra_data,
            is_read: false,
            created_at: new Date()
        };

        // Helper to stringify all data values for FCM
        const safeData = { type: type || 'general' };
        if (extra_data && typeof extra_data === 'object') {
            for (const [k, v] of Object.entries(extra_data)) {
                if (v !== null && v !== undefined) {
                    safeData[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
                }
            }
        }

        // Emit via Socket.io
        if (user_id) {
            io.to(`user_${user_id}`).emit('notification', notification);

            // Push Notification via FCM
            try {
                const admin = require('../Config/firebaseConfig');
                const { pool } = require('../Config/dbConfig');
                const [rows] = await pool.execute('SELECT fcm_token FROM users WHERE id = ?', [user_id]);

                if (rows.length > 0 && rows[0].fcm_token) {
                    const messagePayload = {
                        notification: {
                            title: title || 'New Notification',
                            body: message || ''
                        },
                        webpush: {
                            notification: {
                                icon: '/hrplus_favicon.png'
                            }
                        },
                        data: safeData,
                        token: rows[0].fcm_token
                    };
                    await admin.messaging().send(messagePayload);
                }
            } catch (fcmError) {
                console.error('Error sending FCM push notification:', fcmError);
            }
        }

        if (role) {
            io.to(`role_${role}`).emit('notification', notification);
            // If it's for admin, also send to superadmin
            if (role === 'admin') {
                io.to(`role_superadmin`).emit('notification', notification);
            }

            // Push Notification to all users with this role
            try {
                const admin = require('../Config/firebaseConfig');
                const { pool } = require('../Config/dbConfig');
                let query = 'SELECT fcm_token FROM users WHERE role = ? AND fcm_token IS NOT NULL';
                let params = [role];
                if (role === 'admin') {
                    query = 'SELECT fcm_token FROM users WHERE (role = ? OR role = ?) AND fcm_token IS NOT NULL';
                    params = ['admin', 'superadmin'];
                }
                const [rows] = await pool.execute(query, params);

                const tokens = rows.map(r => r.fcm_token).filter(t => t);
                if (tokens.length > 0) {
                    const messagePayload = {
                        notification: {
                            title: title || 'New Notification',
                            body: message || ''
                        },
                        webpush: {
                            notification: {
                                icon: '/hrplus_favicon.png'
                            }
                        },
                        data: safeData,
                        tokens: tokens
                    };
                    await admin.messaging().sendEachForMulticast(messagePayload);
                }
            } catch (fcmError) {
                console.error('Error sending FCM multicast notification:', fcmError);
            }
        }

        return notificationId;
    } catch (error) {
        console.error('Error sending notification:', error);
    }
};

module.exports = { sendNotification };
