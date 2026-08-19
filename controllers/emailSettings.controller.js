const db = require('../config/db');
const { encrypt, decrypt } = require('../utils/cryptoUtils');
const nodemailer = require('nodemailer');

exports.getEmailSettings = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await db.execute('SELECT * FROM company_email_settings WHERE company_id = ?', [companyId]);
        if (rows.length === 0) {
            return res.json({});
        }
        
        const settings = rows[0];
        // Don't send the real decrypted password to frontend for security
        // Just send a flag indicating it exists
        settings.smtp_pass = settings.smtp_pass ? '********' : '';
        
        res.json(settings);
    } catch (err) {
        console.error('Error fetching email settings:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.saveEmailSettings = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const { smtp_host, smtp_port, smtp_user, smtp_pass, sender_email, sender_name, is_active } = req.body;
        
        // Validation
        if (!smtp_host || !smtp_port || !smtp_user || !sender_email || !sender_name) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const [existing] = await db.execute('SELECT * FROM company_email_settings WHERE company_id = ?', [companyId]);
        
        let encryptedPass;
        if (smtp_pass && smtp_pass !== '********') {
            encryptedPass = encrypt(smtp_pass);
        } else if (existing.length > 0) {
            encryptedPass = existing[0].smtp_pass;
        } else {
            return res.status(400).json({ error: 'Password is required for new settings.' });
        }

        if (existing.length > 0) {
            await db.execute(
                `UPDATE company_email_settings 
                 SET smtp_host=?, smtp_port=?, smtp_user=?, smtp_pass=?, sender_email=?, sender_name=?, is_active=?, updated_at=NOW()
                 WHERE company_id=?`,
                [smtp_host, smtp_port, smtp_user, encryptedPass, sender_email, sender_name, is_active, companyId]
            );
        } else {
            await db.execute(
                `INSERT INTO company_email_settings 
                 (company_id, smtp_host, smtp_port, smtp_user, smtp_pass, sender_email, sender_name, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [companyId, smtp_host, smtp_port, smtp_user, encryptedPass, sender_email, sender_name, is_active]
            );
        }

        res.json({ success: true, message: 'Email settings saved successfully.' });
    } catch (err) {
        console.error('Error saving email settings:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.testEmailConnection = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await db.execute('SELECT * FROM company_email_settings WHERE company_id = ?', [companyId]);
        
        if (rows.length === 0) {
            return res.status(400).json({ error: 'Save settings first before testing.' });
        }

        const settings = rows[0];
        const password = decrypt(settings.smtp_pass);

        const transporter = nodemailer.createTransport({
            host: settings.smtp_host,
            port: parseInt(settings.smtp_port),
            secure: parseInt(settings.smtp_port) === 465,
            auth: {
                user: settings.smtp_user,
                pass: password,
            }
        });

        await transporter.verify(); // Test connection
        
        // Send a test email to the configured sender_email (or user email if available)
        const recipient = req.user.email || settings.sender_email;
        
        await transporter.sendMail({
            from: `"${settings.sender_name}" <${settings.sender_email}>`,
            to: recipient,
            subject: 'Test Email from HRM SaaS',
            text: 'Your SMTP settings are working perfectly! You are now ready to send e-payslips.'
        });

        res.json({ success: true, message: 'Connection successful. Test email sent!' });
    } catch (err) {
        console.error('Test email failed:', err);
        res.status(400).json({ error: 'Connection failed: ' + err.message });
    }
};
