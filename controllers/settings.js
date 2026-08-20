const db = require('../config/db');

exports.getSettings = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        let sql = 'SELECT * FROM settings WHERE company_id = ?';
        let params = [companyId];
        
        if (!companyId) {
            sql = 'SELECT * FROM settings WHERE id = 1';
            params = [];
        }
        
        const [rows] = await db.execute(sql, params);
        
        if (rows.length === 0) {
            if (companyId) {
                // Fetch defaults from id = 1
                const [defaultRows] = await db.execute('SELECT * FROM settings WHERE id = 1');
                const defaultSettings = defaultRows[0] || {};
                
                // Fetch company name to use as business_name
                const [companyRows] = await db.execute('SELECT company_name, email, phone FROM companies WHERE id = ?', [companyId]);
                const companyInfo = companyRows[0] || {};
                
                // Insert a new row for this company
                const insertSql = `
                    INSERT INTO settings 
                    (company_id, machine_ip, machine_port, machine_alias, sync_interval, late_deduction, late_deduction_amount, salary_cycle, salary_cycle_start_date, ot_multiplier, business_name, business_address, business_phone, business_email, standard_start_time, timezone, currency, date_format, language, grace_period_mins, standard_end_time, weekends, notify_leaves, notify_claims, notify_password_resets)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                const insertParams = [
                    companyId,
                    defaultSettings.machine_ip || null,
                    defaultSettings.machine_port || 4370,
                    defaultSettings.machine_alias || 'Main Entrance',
                    defaultSettings.sync_interval || 30,
                    defaultSettings.late_deduction !== undefined ? defaultSettings.late_deduction : 1,
                    defaultSettings.late_deduction_amount || 50.00,
                    defaultSettings.salary_cycle || '15 Days Cycle',
                    defaultSettings.salary_cycle_start_date || 1,
                    defaultSettings.ot_multiplier || 1.50,
                    companyInfo.company_name || defaultSettings.business_name || 'Kiaan HRM Pro',
                    defaultSettings.business_address || null,
                    companyInfo.phone || defaultSettings.business_phone || '',
                    companyInfo.email || defaultSettings.business_email || '',
                    defaultSettings.standard_start_time || '09:00:00',
                    defaultSettings.timezone || 'Asia/Kolkata',
                    defaultSettings.currency || 'ZAR',
                    defaultSettings.date_format || 'DD/MM/YYYY',
                    defaultSettings.language || 'English',
                    defaultSettings.grace_period_mins || 15,
                    defaultSettings.standard_end_time || '17:00:00',
                    defaultSettings.weekends || 'Saturday,Sunday',
                    defaultSettings.notify_leaves !== undefined ? defaultSettings.notify_leaves : 1,
                    defaultSettings.notify_claims !== undefined ? defaultSettings.notify_claims : 1,
                    defaultSettings.notify_password_resets !== undefined ? defaultSettings.notify_password_resets : 1
                ];
                
                await db.execute(insertSql, insertParams);
                
                const [newRows] = await db.execute('SELECT * FROM settings WHERE company_id = ?', [companyId]);
                let settingsData = newRows[0];
                settingsData.business_name = companyInfo.company_name || settingsData.business_name;
                settingsData.business_email = companyInfo.email || settingsData.business_email;
                settingsData.business_phone = companyInfo.phone || settingsData.business_phone;
                return res.json(settingsData);
            }
            return res.status(404).json({ message: 'Settings not found' });
        }
        
        let settingsData = rows[0];
        if (companyId) {
            const [compRows] = await db.execute('SELECT company_name, email, phone FROM companies WHERE id = ?', [companyId]);
            if (compRows.length > 0) {
                settingsData.business_name = compRows[0].company_name || settingsData.business_name;
                settingsData.business_email = compRows[0].email || settingsData.business_email;
                settingsData.business_phone = compRows[0].phone || settingsData.business_phone;
            }
        }
        res.json(settingsData);
    } catch (err) {
        console.error('❌ SQL Error (getSettings):', err);
        res.status(500).json({ message: 'Error fetching settings', error: err.message });
    }
};

exports.updateSettings = async (req, res) => {
    const { 
        machine_ip, machine_port, machine_alias, sync_interval, 
        late_deduction, late_deduction_amount, salary_cycle, salary_cycle_start_date, ot_multiplier, standard_start_time,
        business_name, business_address, business_phone, business_email,
        admin_password, currency, timezone, date_format, language,
        grace_period_mins, standard_end_time, weekends,
        notify_leaves, notify_claims, notify_password_resets,
        contribution_enabled, default_employee_contribution_percentage, default_employer_contribution_percentage
    } = req.body;
    
    const companyId = req.user.company_id;

    try {
        const updates = [];
        const params = [];

        const fields = {
            machine_ip, machine_port, machine_alias, sync_interval, 
            late_deduction: late_deduction !== undefined ? (late_deduction ? 1 : 0) : undefined, 
            late_deduction_amount,
            salary_cycle, salary_cycle_start_date, ot_multiplier, standard_start_time,
            business_name, business_address, business_phone, business_email,
            currency, timezone, date_format, language,
            grace_period_mins, standard_end_time, weekends,
            notify_leaves: notify_leaves !== undefined ? (notify_leaves ? 1 : 0) : undefined,
            notify_claims: notify_claims !== undefined ? (notify_claims ? 1 : 0) : undefined,
            notify_password_resets: notify_password_resets !== undefined ? (notify_password_resets ? 1 : 0) : undefined,
            contribution_enabled: contribution_enabled !== undefined ? (contribution_enabled ? 1 : 0) : undefined,
            default_employee_contribution_percentage: default_employee_contribution_percentage !== undefined ? parseFloat(default_employee_contribution_percentage || 0) : undefined,
            default_employer_contribution_percentage: default_employer_contribution_percentage !== undefined ? parseFloat(default_employer_contribution_percentage || 0) : undefined
        };

        Object.keys(fields).forEach(key => {
            if (fields[key] !== undefined) {
                updates.push(`${key} = ?`);
                params.push(fields[key]);
            }
        });

        if (updates.length > 0) {
            let query = '';
            if (companyId) {
                // Ensure a settings record exists for this company
                const [existing] = await db.execute('SELECT id FROM settings WHERE company_id = ?', [companyId]);
                if (existing.length === 0) {
                    const [defaultRows] = await db.execute('SELECT * FROM settings WHERE id = 1');
                    const defaultSettings = defaultRows[0] || {};
                    
                    // Fetch company name to use as business_name
                    const [companyRows] = await db.execute('SELECT company_name, email, phone FROM companies WHERE id = ?', [companyId]);
                    const companyInfo = companyRows[0] || {};
                    
                    const insertSql = `
                        INSERT INTO settings 
                        (company_id, machine_ip, machine_port, machine_alias, sync_interval, late_deduction, late_deduction_amount, salary_cycle, salary_cycle_start_date, ot_multiplier, business_name, business_address, business_phone, business_email, standard_start_time, timezone, currency, date_format, language, grace_period_mins, standard_end_time, weekends, notify_leaves, notify_claims, notify_password_resets, contribution_enabled, default_employee_contribution_percentage, default_employer_contribution_percentage)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    const insertParams = [
                        companyId,
                        defaultSettings.machine_ip || null,
                        defaultSettings.machine_port || 4370,
                        defaultSettings.machine_alias || 'Main Entrance',
                        defaultSettings.sync_interval || 30,
                        defaultSettings.late_deduction !== undefined ? defaultSettings.late_deduction : 1,
                        defaultSettings.late_deduction_amount || 50.00,
                        defaultSettings.salary_cycle || '15 Days Cycle',
                        defaultSettings.salary_cycle_start_date || 1,
                        defaultSettings.ot_multiplier || 1.50,
                        companyInfo.company_name || defaultSettings.business_name || 'Kiaan HRM Pro',
                        defaultSettings.business_address || null,
                        companyInfo.phone || defaultSettings.business_phone || '',
                        companyInfo.email || defaultSettings.business_email || '',
                        defaultSettings.standard_start_time || '09:00:00',
                        defaultSettings.timezone || 'Asia/Kolkata',
                        defaultSettings.currency || 'ZAR',
                        defaultSettings.date_format || 'DD/MM/YYYY',
                        defaultSettings.language || 'English',
                        defaultSettings.grace_period_mins || 15,
                        defaultSettings.standard_end_time || '17:00:00',
                        defaultSettings.weekends || 'Saturday,Sunday',
                        defaultSettings.notify_leaves !== undefined ? defaultSettings.notify_leaves : 1,
                        defaultSettings.notify_claims !== undefined ? defaultSettings.notify_claims : 1,
                        defaultSettings.notify_password_resets !== undefined ? defaultSettings.notify_password_resets : 1,
                        defaultSettings.contribution_enabled || 0,
                        defaultSettings.default_employee_contribution_percentage || 0.00,
                        defaultSettings.default_employer_contribution_percentage || 0.00
                    ];
                    await db.execute(insertSql, insertParams);
                }
                query = `UPDATE settings SET ${updates.join(', ')} WHERE company_id = ?`;
                params.push(companyId);
            } else {
                query = `UPDATE settings SET ${updates.join(', ')} WHERE id = 1`;
            }
            
            console.log('📝 Executing SQL (Update Settings):', query, 'Params:', params);
            await db.execute(query, params);
        }

        // Sync business_name, phone, email to companies table so Super Admin sees the same
        if (companyId && (business_name || business_phone || business_email)) {
            const compUpdates = [];
            const compParams = [];
            if (business_name) { compUpdates.push('company_name = ?'); compParams.push(business_name); }
            if (business_phone) { compUpdates.push('phone = ?'); compParams.push(business_phone); }
            if (business_email) { compUpdates.push('email = ?'); compParams.push(business_email); }
            if (compUpdates.length > 0) {
                compParams.push(companyId);
                await db.execute(`UPDATE companies SET ${compUpdates.join(', ')} WHERE id = ?`, compParams);
            }
        }

        // Handle Admin Password update if provided
        if (admin_password) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(admin_password, 10);
            const userSql = 'UPDATE users SET password = ? WHERE role IN ("admin", "Master Admin") AND company_id = ?';
            await db.execute(userSql, [hashedPassword, req.user.company_id || null]);
        }

        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        console.error('❌ SQL Error (updateSettings):', err);
        res.status(500).json({ 
            message: 'Error updating settings', 
            error: err.message,
            sqlMessage: err.sqlMessage,
            code: err.code
        });
    }
};

exports.getGlobalSettings = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM global_settings LIMIT 1');
        const settings = rows[0] || {};
        if (settings.notifications && typeof settings.notifications === 'string') {
            try {
                settings.notifications = JSON.parse(settings.notifications);
            } catch (e) {}
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateGlobalSettings = async (req, res) => {
    try {
        const {
            platform_name, powered_by, support_email, timezone, currency, date_format, language, notifications,
            company_name, company_logo, company_address, contact_number, about_us,
            social_linkedin, social_facebook, social_instagram, social_twitter, social_youtube,
            privacy_policy, terms_conditions, copyright_text, whatsapp_number
        } = req.body;
        const [rows] = await db.execute('SELECT id FROM global_settings LIMIT 1');
        
        const notifJson = notifications ? JSON.stringify(notifications) : null;

        if (rows.length > 0) {
            await db.execute(
                `UPDATE global_settings SET 
                    platform_name=?, powered_by=?, support_email=?, timezone=?, currency=?, date_format=?, language=?, notifications=?,
                    company_name=?, company_logo=?, company_address=?, contact_number=?, about_us=?,
                    social_linkedin=?, social_facebook=?, social_instagram=?, social_twitter=?, social_youtube=?,
                    privacy_policy=?, terms_conditions=?, copyright_text=?, whatsapp_number=?
                WHERE id=?`,
                [
                    platform_name, powered_by || 'Kiaan Technology', support_email, timezone, currency, date_format, language, notifJson,
                    company_name || null, company_logo || null, company_address || null, contact_number || null, about_us || null,
                    social_linkedin || null, social_facebook || null, social_instagram || null, social_twitter || null, social_youtube || null,
                    privacy_policy || null, terms_conditions || null, copyright_text || null, whatsapp_number || null,
                    rows[0].id
                ]
            );
        } else {
            await db.execute(
                `INSERT INTO global_settings 
                    (platform_name, powered_by, support_email, timezone, currency, date_format, language, notifications,
                     company_name, company_logo, company_address, contact_number, about_us,
                     social_linkedin, social_facebook, social_instagram, social_twitter, social_youtube,
                     privacy_policy, terms_conditions, copyright_text, whatsapp_number) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    platform_name, powered_by || 'Kiaan Technology', support_email, timezone, currency, date_format, language, notifJson,
                    company_name || null, company_logo || null, company_address || null, contact_number || null, about_us || null,
                    social_linkedin || null, social_facebook || null, social_instagram || null, social_twitter || null, social_youtube || null,
                    privacy_policy || null, terms_conditions || null, copyright_text || null, whatsapp_number || null
                ]
            );
        }
        res.json({ message: 'Global settings updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getSiteInfo = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT platform_name, powered_by, support_email, company_name, company_logo, company_address, contact_number, about_us,
                    social_linkedin, social_facebook, social_instagram, social_twitter, social_youtube,
                    privacy_policy, terms_conditions, copyright_text, whatsapp_number
             FROM global_settings LIMIT 1`
        );
        res.json(rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getCurrentPlan = async (req, res) => {
    try {
        const [compRows] = await db.execute('SELECT id, company_name, email, phone, status, plan, created_at FROM companies WHERE id = ?', [req.user.company_id]);
        const comp = compRows[0] || {};

        const sql = `
            SELECT s.plan_name, s.end_date, s.payment_status, s.amount, s.billing_cycle, s.created_at
            FROM subscriptions s 
            WHERE s.company_id = ?
            ORDER BY s.id DESC LIMIT 1
        `;
        const [rows] = await db.execute(sql, [req.user.company_id]);
        if (rows.length === 0) {
            return res.json({ 
                plan_name: comp.plan || 'Free Trial', 
                end_date: null, 
                payment_status: 'paid', 
                amount: 0, 
                billing_cycle: 'weekly',
                created_at: comp.created_at,
                company_id: comp.id,
                company_name: comp.company_name,
                company_email: comp.email,
                company_phone: comp.phone,
                company_status: comp.status || 'active'
            });
        }
        res.json({
            ...rows[0],
            company_id: comp.id,
            company_name: comp.company_name,
            company_email: comp.email,
            company_phone: comp.phone,
            company_status: comp.status || 'active'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.testUpdateSubscription = async (req, res) => {
    try {
        const { status } = req.body;
        const compId = (req.user && req.user.company_id) ? req.user.company_id : null;
        
        let newCreatedAt;
        let newEndDate;
        const now = new Date();
        
        if (status === '10sec') {
            // Exactly 10 seconds remaining on 7-day cycle
            newCreatedAt = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000) + 10000);
            newEndDate = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        } else if (status === '1day' || status === '1_day') {
            // Exactly 24 hours (1 day) remaining on 7-day cycle
            newCreatedAt = new Date(now.getTime() - (6 * 24 * 60 * 60 * 1000));
            newEndDate = new Date(now.getTime() + (24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        } else if (status === 'expired') {
            // Expired 1 day ago
            newCreatedAt = new Date(now.getTime() - (8 * 24 * 60 * 60 * 1000));
            newEndDate = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        } else if (status === 'renew' || status === 'reset' || status === '7days') {
            // Reset to full 7 days
            newCreatedAt = now;
            newEndDate = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        } else {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const [result] = await db.execute(
            'UPDATE subscriptions SET created_at = ?, end_date = ?, billing_cycle = "weekly" WHERE company_id = ? ORDER BY id DESC LIMIT 1', 
            [newCreatedAt, newEndDate, compId]
        );
        if (result.affectedRows === 0) {
            await db.execute('UPDATE companies SET created_at = ? WHERE id = ?', [newCreatedAt, compId]);
        }
        
        res.json({ message: `Subscription status updated to ${status} for testing.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.requestPlan = async (req, res) => {
    try {
        const { plan } = req.body;
        if (!plan) return res.status(400).json({ error: 'Plan is required' });
        
        // Check if there's already a pending request
        const [existing] = await db.execute(
            "SELECT id FROM plan_requests WHERE company_id = ? AND status = 'pending'",
            [req.user.company_id]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Renewal request already sent. Please wait for admin approval.' });
        }
        
        await db.execute(
            'INSERT INTO plan_requests (company_id, requested_plan) VALUES (?, ?)',
            [req.user.company_id, plan]
        );

        const notificationsUtil = require('../utils/notifications');
        notificationsUtil.checkAndNotify('emailPlanRenewalRequest', {
            company_id: null,
            title: 'Plan Renewal Request',
            message: `A company has requested a plan renewal/upgrade to ${plan}.`,
            type: 'warning'
        });

        const [comp] = await db.execute('SELECT company_name FROM companies WHERE id = ?', [req.user.company_id]);
        const compName = comp[0]?.company_name || 'A company';

        notificationsUtil.checkAndNotify('emailPlanRenewalRequest', {
            company_id: null,
            title: 'Plan Renewal/Upgrade Request',
            message: `${compName} has requested to renew/upgrade to the ${plan} plan.`,
            type: 'info'
        });

        res.json({ message: 'Request submitted successfully. Waiting for admin approval.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getPlans = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM plans ORDER BY id ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createPlan = async (req, res) => {
    try {
        const { name, price, duration, employee_limit, description, features, buttonText, isPopular } = req.body;
        const empLimit = parseInt(employee_limit) || 0;
        const [result] = await db.execute(
            'INSERT INTO plans (name, price, duration, employee_limit, description, features, buttonText, isPopular) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, price, duration, empLimit, description, JSON.stringify(features), buttonText || 'Get Started', isPopular ? 1 : 0]
        );
        res.status(201).json({ message: 'Plan created successfully', id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, duration, employee_limit, description, features, buttonText, isPopular } = req.body;
        const empLimit = parseInt(employee_limit) || 0;
        await db.execute(
            'UPDATE plans SET name=?, price=?, duration=?, employee_limit=?, description=?, features=?, buttonText=?, isPopular=? WHERE id=?',
            [name, price, duration, empLimit, description, JSON.stringify(features), buttonText || 'Get Started', isPopular ? 1 : 0, id]
        );

        await db.execute(
            'UPDATE companies SET employee_limit=? WHERE plan=?',
            [empLimit, name]
        );

        res.json({ message: 'Plan updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        await db.execute('DELETE FROM plans WHERE id=?', [id]);
        res.json({ message: 'Plan deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const bcrypt = require('bcryptjs');
        const { old_password, new_password } = req.body;
        if (!old_password || !new_password) {
            return res.status(400).json({ error: 'Old password and new password are required' });
        }

        const [users] = await db.execute('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isMatch = await bcrypt.compare(old_password, users[0].password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Incorrect old password' });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
        
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Failed to change password' });
    }
};
