const Notification = require('../models/notificationModel');
const asyncHandler = require('express-async-handler');

/**
 * Get notifications for the logged-in user
 */
const getMyNotifications = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const role = req.user.role;

    const notifications = await Notification.getUserNotifications(userId, role);
    res.json(notifications);
});

/**
 * Mark a notification as read
 */
const markRead = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await Notification.markAsRead(id);
    res.json({ message: 'Notification marked as read' });
});

/**
 * Mark all notifications as read for the user
 */
const markAllRead = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const role = req.user.role;

    await Notification.markAllAsRead(userId, role);
    res.json({ message: 'All notifications marked as read' });
});

module.exports = {
    getMyNotifications,
    markRead,
    markAllRead
};
