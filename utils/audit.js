const db = require('../config/db');

/**
 * Log an action to the audit_logs table
 * @param {number} adminId - ID of the user performing the action
 * @param {string} action - Short string describing the action (e.g. 'company_approved')
 * @param {number} targetId - Optional ID of the entity affected
 * @param {string} details - Detailed string or JSON representation
 */
exports.logAction = async (adminId, action, targetId = null, details = '') => {
    try {
        await db.execute(
            'INSERT INTO audit_logs (admin_id, action, target_id, details, created_at) VALUES (?, ?, ?, ?, NOW())',
            [adminId, action, targetId, typeof details === 'object' ? JSON.stringify(details) : details]
        );
    } catch (err) {
        console.error('Failed to log audit action:', err.message);
    }
};
