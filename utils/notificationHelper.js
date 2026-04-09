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

        // Emit via Socket.io
        if (user_id) {
            io.to(`user_${user_id}`).emit('notification', notification);
        }

        if (role) {
            io.to(`role_${role}`).emit('notification', notification);
            // If it's for admin, also send to superadmin
            if (role === 'admin') {
                io.to(`role_superadmin`).emit('notification', notification);
            }
        }

        return notificationId;
    } catch (error) {
        console.error('Error sending notification:', error);
    }
};

module.exports = { sendNotification };
