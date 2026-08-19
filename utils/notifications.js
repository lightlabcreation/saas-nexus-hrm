const db = require('../config/db');

/**
 * Helper to create an in-app notification.
 * @param {Object} options
 * @param {number|null} options.company_id - The ID of the company this is for (NULL if for SuperAdmin only)
 * @param {number|null} options.user_id - The ID of a specific user (NULL if for all admins of that company/platform)
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification body
 * @param {string} options.type - 'info', 'warning', 'success', 'error'
 */
exports.createNotification = async ({ company_id = null, user_id = null, title, message, type = 'info' }) => {
    try {
        await db.execute(
            'INSERT INTO in_app_notifications (company_id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)',
            [company_id, user_id, title, message, type]
        );
        return true;
    } catch (err) {
        console.error("Failed to create notification:", err);
        return false;
    }
};

exports.checkAndNotify = async (settingKey, options) => {
    try {
        const [rows] = await db.execute('SELECT notifications FROM global_settings LIMIT 1');
        if (rows.length > 0 && rows[0].notifications) {
            const settings = typeof rows[0].notifications === 'string' ? JSON.parse(rows[0].notifications) : rows[0].notifications;
            if (settings[settingKey] === true) {
                await exports.createNotification(options);
            }
        }
    } catch (err) {
        console.error("Error checking and notifying:", err);
    }
};
