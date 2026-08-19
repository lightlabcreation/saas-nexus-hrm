const db = require('../config/db');

exports.getNotifications = async (req, res) => {
    try {
        const { id: userId, company_id: companyId, role } = req.user;
        const isSuperadmin = role.toLowerCase().includes('master') || role.toLowerCase() === 'superadmin';

        let query = 'SELECT * FROM in_app_notifications WHERE ';
        let params = [];

        if (isSuperadmin) {
            // Superadmins see global alerts (company_id IS NULL)
            query += 'company_id IS NULL AND (user_id IS NULL OR user_id = ?) ';
            params.push(userId);
        } else {
            // Admins see alerts for their company
            query += 'company_id = ? AND (user_id IS NULL OR user_id = ?) ';
            params.push(companyId, userId);
        }

        query += 'ORDER BY created_at DESC LIMIT 50';

        const [rows] = await db.execute(query, params);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const { company_id: companyId, role } = req.user;
        const isSuperadmin = role.toLowerCase().includes('master') || role.toLowerCase() === 'superadmin';

        // Ownership check: only mark notifications belonging to this user's scope
        let query = 'UPDATE in_app_notifications SET is_read = TRUE WHERE id = ?';
        let params = [id];

        if (isSuperadmin) {
            query += ' AND company_id IS NULL';
        } else {
            query += ' AND company_id = ?';
            params.push(companyId);
        }

        const [result] = await db.execute(query, params);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Notification not found or access denied' });
        }
        res.json({ message: 'Marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.markAllAsRead = async (req, res) => {
    try {
        const { id: userId, company_id: companyId, role } = req.user;
        const isSuperadmin = role.toLowerCase().includes('master') || role.toLowerCase() === 'superadmin';

        let query = 'UPDATE in_app_notifications SET is_read = TRUE WHERE ';
        let params = [];

        if (isSuperadmin) {
            query += 'company_id IS NULL AND (user_id IS NULL OR user_id = ?) ';
            params.push(userId);
        } else {
            query += 'company_id = ? AND (user_id IS NULL OR user_id = ?) ';
            params.push(companyId, userId);
        }

        await db.execute(query, params);
        res.json({ message: 'All marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
