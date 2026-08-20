const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const notificationsUtil = require('../utils/notifications');

exports.login = async (req, res) => {
    console.log('Login attempt:', req.body);
    const { email, userId, password } = req.body;
    const identifier = email || userId;

    if (!identifier) {
        return res.status(400).json({ message: 'Email or User ID is required' });
    }

    try {
        console.log('--- LOGIN DEBUG START ---');
        console.log('Identifier received:', identifier);
        
        // Comprehensive search: Check User Email, Employee Email, Custom Employee ID, Machine ID, or Employee Database ID
        let [users] = await db.execute(`
            SELECT u.*, e.name as emp_name, e.photo as emp_photo, e.machine_id, e.custom_id, e.email as emp_email, e.id as employee_db_id 
            FROM users u 
            LEFT JOIN employees e ON u.employee_id = e.id 
            WHERE u.email = ? OR e.email = ? OR e.custom_id = ? OR e.machine_id = ? OR e.id = ?
        `, [identifier, identifier, identifier, identifier, identifier]);
        
        console.log('Database result count:', users.length);
        
        // Auto-healing: If no user found in `users` table, check `employees` table directly
        if (users.length === 0) {
            console.log('No user row found. Checking employees table for auto-healing...');
            const [empRows] = await db.execute(`
                SELECT * FROM employees 
                WHERE email = ? OR custom_id = ? OR machine_id = ? OR id = ?
            `, [identifier, identifier, identifier, identifier]);

            if (empRows.length > 0) {
                const emp = empRows[0];
                console.log('Employee found in employees table without user account. Healing user record for employee ID:', emp.id);
                
                // Check if user record exists for this employee_id under a different email
                const [existingUser] = await db.execute('SELECT * FROM users WHERE employee_id = ?', [emp.id]);
                
                if (existingUser.length > 0) {
                    // Update user's email to match employee email
                    await db.execute('UPDATE users SET email = ? WHERE employee_id = ?', [emp.email || '', emp.id]);
                } else {
                    // Create missing user record with default/hashed password
                    const defaultPasswordHash = await bcrypt.hash('12345678', 10);
                    await db.execute(
                        'INSERT INTO users (employee_id, email, password, role, name, created_by, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [emp.id, emp.email || '', defaultPasswordHash, emp.role || 'employee', emp.name || '', emp.created_by || null, emp.company_id || null]
                    );
                }

                // Re-fetch the healed user
                [users] = await db.execute(`
                    SELECT u.*, e.name as emp_name, e.photo as emp_photo, e.machine_id, e.custom_id, e.email as emp_email, e.id as employee_db_id 
                    FROM users u 
                    LEFT JOIN employees e ON u.employee_id = e.id 
                    WHERE u.employee_id = ? OR u.email = ? OR e.email = ?
                `, [emp.id, emp.email || '', emp.email || '']);
            }
        }

        if (users.length === 0) {
            console.log('FAILURE: No user found matching identifier');
            return res.status(401).json({ message: 'Invalid credentials (User not found)' });
        }

        const user = users[0];
        console.log('User found:', { 
            db_id: user.id, 
            email: user.email, 
            emp_id: user.employee_id, 
            machine_id: user.machine_id,
            role: user.role 
        });

        // Password comparison
        console.log('Comparing password for:', user.email || `EMP-${user.employee_db_id}`);
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('Password match result:', isMatch);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials (Password mismatch)' });
        }

        // Strict Role Validation: The role requested in the UI MUST match the DB role
        const dbRole = user.role?.toLowerCase() || '';
        const reqRole = req.body.role?.toLowerCase() || '';
        
        let isValidRole = false;
        if (!reqRole) {
            isValidRole = true; // Auto-detect role from DB if not provided
        } else if (reqRole === 'superadmin' && (dbRole === 'master admin' || dbRole === 'masteradmin' || dbRole === 'superadmin')) {
            isValidRole = true;
        } else if (reqRole === 'admin' && (dbRole === 'admin' || dbRole === 'hr' || dbRole === 'hr admin')) {
            isValidRole = true;
        } else if (reqRole === 'employee' && dbRole === 'employee') {
            isValidRole = true;
        }

        if (!isValidRole) {
            return res.status(403).json({ message: `Access denied. You do not have ${req.body.role} privileges.` });
        }

        // Check Subscription Expiry for non-superadmins
        // (Removed so admins can log in and see the Subscription Blocker UI to renew)
        
            // NEW REAL-TIME SUPERADMIN VERIFICATION
            try {
                const [companies] = await db.execute('SELECT email, status FROM companies WHERE id = ?', [user.company_id]);
                if (companies.length > 0) {
                    const companyStatus = companies[0].status;
                    if (companyStatus && companyStatus.toLowerCase() !== 'active') {
                        return res.status(403).json({ message: 'Your company account has been suspended or is inactive. Please contact the platform administrator.' });
                    }

                    const employerEmail = companies[0].email;
                    const superadminApiUrl = process.env.SUPERADMIN_API_URL;
                    
                    if (superadminApiUrl) {
                        const response = await axios.get(`${superadminApiUrl}/master/verify-subscription?email=${employerEmail}`);
                        if (!response.data || response.data.success === false) {
                            return res.status(403).json({
                                message: response.data.message || 'Subscription verification failed via Superadmin.'
                            });
                        }
                    }
                }
            } catch (superadminErr) {
                console.error('Superadmin Verification Error:', superadminErr.message);
                return res.status(500).json({ 
                    message: 'Login blocked: Unable to verify subscription status with Superadmin.', 
                    error: superadminErr.response?.data?.message || superadminErr.message 
                });
            }

        // Fetch Localization Settings
        let localization = {};
        try {
            const [globalRows] = await db.execute('SELECT timezone, currency, date_format, language FROM global_settings LIMIT 1');
            const globalSettings = globalRows[0] || { timezone: 'UTC', currency: 'USD', date_format: 'YYYY-MM-DD', language: 'English' };

            let companySettings = {};
            if (user.company_id) {
                const [companyRows] = await db.execute(
                    'SELECT timezone, currency, date_format, language FROM settings WHERE company_id = ? OR (company_id IS NULL AND id = 1) ORDER BY company_id DESC LIMIT 1',
                    [user.company_id]
                );
                companySettings = companyRows[0] || {};
            }

            localization = {
                timezone: companySettings.timezone || globalSettings.timezone,
                currency: companySettings.currency || globalSettings.currency,
                date_format: companySettings.date_format || globalSettings.date_format,
                language: companySettings.language || globalSettings.language
            };
        } catch (setErr) {
            console.error('Error fetching localization settings:', setErr);
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, employee_id: user.employee_id, company_id: user.company_id, localization },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.emp_name || user.name, // Use latest employee name if available
                email: user.email,
                role: user.role,
                photo: user.emp_photo || user.photo, // Use latest employee photo if available
                employee_id: user.employee_id,
                company_id: user.company_id,
                localization
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.forgotPasswordRequest = async (req, res) => {
    try {
        const { userId } = req.body; // Can be email or employee custom_id
        if (!userId) {
            return res.status(400).json({ message: 'Please provide your Email or User ID' });
        }

        // Find user by email, or check if it matches an employee custom_id
        const [users] = await db.execute(`
            SELECT u.id, u.name, u.role, u.company_id, u.email 
            FROM users u
            LEFT JOIN employees e ON u.employee_id = e.id
            WHERE u.email = ? OR e.custom_id = ?
        `, [userId, userId]);

        if (users.length === 0) {
            // Return success anyway to prevent user enumeration attacks
            return res.json({ message: 'If an account matches, a reset request has been sent to the Administrator.' });
        }

        const user = users[0];
        const isSuperadmin = user.role.toLowerCase() === 'superadmin' || user.role.toLowerCase().includes('master');
        const isAdmin = user.role.toLowerCase() === 'admin';

        let notifCompanyId = user.company_id;
        let title = 'Password Reset Request';
        let message = '';

        if (isAdmin || isSuperadmin) {
            // Admins send request to SuperAdmin (company_id = NULL)
            notifCompanyId = null;
            message = `Admin ${user.name} (${user.email}) requested a password reset.`;
        } else {
            // Employees send request to their Company Admin
            message = `Employee ${user.name} (${user.email}) requested a password reset. Go to the Employees list to generate a new password.`;
        }

        let shouldNotify = true;
        if (notifCompanyId !== null) {
            const [settingsRows] = await db.execute('SELECT notify_password_resets FROM settings WHERE company_id = ?', [notifCompanyId]);
            shouldNotify = settingsRows.length > 0 ? settingsRows[0].notify_password_resets : 1;
        }

        if (shouldNotify) {
            await db.execute(
                'INSERT INTO in_app_notifications (company_id, title, message, type) VALUES (?, ?, ?, ?)',
                [notifCompanyId, title, message, 'warning']
            );
        }

        res.json({ message: 'Request sent! Please contact your Administrator or HR for your new password.' });
    } catch (err) {
        console.error('Error in forgot password request:', err);
        res.status(500).json({ message: 'Server error processing request', error: err.message });
    }
};

exports.register = async (req, res) => {
    const { companyName, adminName, email, phone, password, planId } = req.body;

    if (!companyName || !adminName || !email || !password) {
        return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Check if email already exists in users table
        const [existingUsers] = await connection.execute('SELECT id, company_id FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            const [company] = await connection.execute('SELECT id FROM companies WHERE id = ?', [existingUsers[0].company_id]);
            if (company.length > 0) {
                await connection.rollback();
                return res.status(400).json({ message: 'Email already registered. Please login to your account.' });
            } else {
                // Orphaned user from deleted company -> clean it up
                await connection.execute('DELETE FROM users WHERE id = ?', [existingUsers[0].id]);
            }
        }

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const chosenPlan = planId || 'Free Trial';

        // 3. Get plan employee limit
        const [planRows] = await connection.execute('SELECT employee_limit, duration FROM plans WHERE name = ?', [chosenPlan]);
        const empLimit = planRows.length > 0 ? (planRows[0].employee_limit || 10) : 10;
        const planDuration = planRows.length > 0 ? (planRows[0].duration || 'weekly') : 'weekly';

        // 4. Create Company directly (Instant Activation)
        const [companyResult] = await connection.execute(
            'INSERT INTO companies (company_name, owner_name, email, phone, plan, employee_limit, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [companyName, adminName, email, phone || '', chosenPlan, empLimit, 'active']
        );
        const companyId = companyResult.insertId;

        // 5. Create Admin User directly
        const [userResult] = await connection.execute(
            'INSERT INTO users (name, email, password, role, company_id) VALUES (?, ?, ?, ?, ?)',
            [adminName, email, hashedPassword, 'admin', companyId]
        );
        const userId = userResult.insertId;

        // 6. Create Initial Subscription (7 Days for Free Trial or Plan duration)
        let daysToAdd = 7;
        if (planDuration === 'monthly') daysToAdd = 30;
        if (planDuration === 'quarterly') daysToAdd = 90;
        if (planDuration === 'half-yearly') daysToAdd = 180;
        if (planDuration === 'annually') daysToAdd = 365;

        const endDate = new Date();
        endDate.setDate(endDate.getDate() + daysToAdd);

        await connection.execute(
            'INSERT INTO subscriptions (company_id, plan_name, amount, billing_cycle, start_date, end_date, payment_status) VALUES (?, ?, ?, ?, CURDATE(), ?, "paid")',
            [companyId, chosenPlan, 0, planDuration, endDate.toISOString().split('T')[0]]
        );

        // 7. Log in company_requests as accepted for audit history
        await connection.execute(
            'INSERT INTO company_requests (company_name, owner_name, email, password, phone, plan, status) VALUES (?, ?, ?, ?, ?, ?, "accepted")',
            [companyName, adminName, email, hashedPassword, phone || '', chosenPlan]
        );

        // 8. Create Company Settings
        await connection.execute(
            'INSERT INTO settings (company_id, business_name, business_email, business_phone, currency) VALUES (?, ?, ?, ?, ?)',
            [companyId, companyName, email, phone || '', 'INR']
        );

        await connection.commit();

        // 9. Generate JWT Token for Auto Login
        const token = jwt.sign(
            { id: userId, email, role: 'admin', company_id: companyId },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        notificationsUtil.checkAndNotify('emailCompanyRequest', {
            company_id: null,
            title: 'New Free Trial Activated',
            message: `${adminName} (${companyName}) has directly started a Free Trial on the ${chosenPlan} plan.`,
            type: 'info'
        });

        res.json({ 
            success: true,
            message: 'Free Trial activated! Welcome aboard.', 
            token: token,
            user: {
                id: userId,
                name: adminName,
                email: email,
                role: 'admin',
                company_id: companyId,
                company_name: companyName
            }
        });
    } catch (err) {
        await connection.rollback();
        console.error('Registration Error:', err);
        res.status(500).json({ message: 'Server error during registration', error: err.message });
    } finally {
        connection.release();
    }
};

