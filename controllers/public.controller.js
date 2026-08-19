const notificationsUtil = require('../utils/notifications');
const db = require('../config/db');

exports.requestCompany = async (req, res) => {
    try {
        // Basic placeholder for requesting a company
        const { companyName, email, name, phone } = req.body;
        
        // TODO: Save to database or send email
        
        res.status(200).json({ success: true, message: 'Company request received successfully.' });
    } catch (error) {
        console.error('Error in requestCompany:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

    exports.submitEnquiry = async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }
        await db.execute(
            'INSERT INTO enquiries (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
            [name, email, phone || null, subject, message]
        );

        // Notify SuperAdmin
        await notificationsUtil.checkAndNotify('emailNewEnquiry', {
            company_id: null,
            user_id: null,
            title: 'New Support Enquiry',
            message: `You received a new enquiry from ${name} regarding "${subject}".`,
            type: 'info'
        });

        res.status(200).json({ success: true, message: 'Enquiry submitted successfully.' });
    } catch (error) {
        console.error('Error in submitEnquiry:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
