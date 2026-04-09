const { pool } = require('../Config/dbConfig');

const Notification = {
    create: async (data) => {
        const { user_id, role, type, title, message, extra_data } = data;
        const [result] = await pool.execute(
            'INSERT INTO notifications (user_id, role, type, title, message, data) VALUES (?, ?, ?, ?, ?, ?)',
            [user_id || null, role || null, type, title, message, extra_data ? JSON.stringify(extra_data) : null]
        );
        return result.insertId;
    },

    getUserNotifications: async (userId, role) => {
        const [rows] = await pool.execute(
            `SELECT * FROM notifications 
             WHERE user_id = ? OR role = ? OR (role = 'admin' AND ? = 'superadmin')
             ORDER BY created_at DESC LIMIT 50`,
            [userId, role, role]
        );
        return rows;
    },

    markAsRead: async (id) => {
        const [result] = await pool.execute(
            'UPDATE notifications SET is_read = TRUE WHERE id = ?',
            [id]
        );
        return result.affectedRows;
    },

    markAllAsRead: async (userId, role) => {
        const [result] = await pool.execute(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? OR role = ?',
            [userId, role]
        );
        return result.affectedRows;
    },

    delete: async (id) => {
        const [result] = await pool.execute('DELETE FROM notifications WHERE id = ?', [id]);
        return result.affectedRows;
    }
};

module.exports = Notification;
