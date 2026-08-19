const db = require('../config/db');
const audit = require('../utils/audit');

exports.getDashboardStats = async (req, res) => {
    try {
        const isMaster = req.user.role && req.user.role.toLowerCase().includes('master');
        const companyFilter = isMaster ? '' : `WHERE created_by = ${db.escape(req.user.id)}`;
        
        const [companies] = await db.execute(`SELECT COUNT(*) as total FROM companies ${companyFilter}`);
        const [activeCompanies] = await db.execute(`SELECT COUNT(*) as active FROM companies WHERE status = "active" ${isMaster ? '' : `AND created_by = ${db.escape(req.user.id)}`}`);
        const [revenue] = await db.execute(`SELECT SUM(s.amount) as total FROM subscriptions s LEFT JOIN companies c ON s.company_id = c.id WHERE s.payment_status = "paid" ${isMaster ? '' : `AND c.created_by = ${db.escape(req.user.id)}`}`);
        const [admins] = await db.execute(`SELECT COUNT(*) as total FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.role IN ("admin", "Master Admin") ${isMaster ? '' : `AND c.created_by = ${db.escape(req.user.id)}`}`);
        const [employees] = await db.execute(`SELECT COUNT(*) as total FROM employees e LEFT JOIN companies c ON e.company_id = c.id WHERE e.status = "active" ${isMaster ? '' : `AND c.created_by = ${db.escape(req.user.id)}`}`);
        const [attendance] = await db.execute(`SELECT COUNT(*) as present FROM attendance a LEFT JOIN employees e ON a.employee_id = e.id LEFT JOIN companies c ON e.company_id = c.id WHERE a.date = CURDATE() AND a.status IN ("present", "late", "half_day") ${isMaster ? '' : `AND c.created_by = ${db.escape(req.user.id)}`}`);
        const [activePlans] = await db.execute(`SELECT COUNT(*) as active FROM subscriptions s LEFT JOIN companies c ON s.company_id = c.id WHERE s.payment_status = "paid" AND s.end_date >= CURDATE() ${isMaster ? '' : `AND c.created_by = ${db.escape(req.user.id)}`}`);
        
        const filterCondition = isMaster ? `WHERE u.role IN ('superadmin', 'Master Admin', 'system') OR u.id IS NULL` : `WHERE c.created_by = ${db.escape(req.user.id)} AND u.role IN ('superadmin', 'Master Admin', 'system')`;
        const [recentActivity] = await db.execute(`SELECT a.* FROM audit_logs a LEFT JOIN users u ON a.admin_id = u.id LEFT JOIN companies c ON u.company_id = c.id ${filterCondition} ORDER BY a.created_at DESC LIMIT 5`);

        const days = parseInt(req.query.days) || 7;
        const chartData = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dStr = d.toISOString().split('T')[0];
            
            const [signupsResult] = await db.execute(`SELECT COUNT(*) as count FROM companies WHERE DATE(created_at) = ? ${isMaster ? '' : `AND created_by = ${db.escape(req.user.id)}`}`, [dStr]);
            const [revenueResult] = await db.execute(`SELECT SUM(s.amount) as total FROM subscriptions s LEFT JOIN companies c ON s.company_id = c.id WHERE DATE(s.created_at) = ? AND s.payment_status="paid" ${isMaster ? '' : `AND c.created_by = ${db.escape(req.user.id)}`}`, [dStr]);

            let label = d.toLocaleDateString('en-US', { weekday: 'short' });
            if (days > 7) {
                label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }

            chartData.push({
                name: label,
                signups: signupsResult[0].count || 0,
                revenue: revenueResult[0].total || 0
            });
        }

        res.json({
            totalCompanies: companies[0].total || 0,
            activeCompanies: activeCompanies[0].active || 0,
            monthlyRevenue: revenue[0].total || 0,
            totalAdmins: admins[0].total || 0,
            totalEmployees: employees[0].total || 0,
            presentToday: attendance[0].present || 0,
            activePlans: activePlans[0].active || 0,
            recentActivity: recentActivity,
            chartData: chartData
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getCompanies = async (req, res) => {
    try {
        const isMaster = req.user.role && req.user.role.toLowerCase().includes('master');
        const [rows] = await db.execute(`
            SELECT c.*,                s.plan_name as active_plan,                s.amount as plan_amount,                s.end_date as plan_expiry,                s.payment_status as plan_status,                s.created_at as plan_created_at,                s.billing_cycle as plan_billing_cycle,                (SELECT COUNT(*) FROM employees WHERE company_id = c.id) as employee_count,                (SELECT COUNT(*) FROM users WHERE company_id = c.id AND role IN ('admin', 'Master Admin')) as admin_count         FROM companies c         LEFT JOIN subscriptions s ON c.id = s.company_id AND s.id = (SELECT MAX(id) FROM subscriptions WHERE company_id = c.id)
            ${isMaster ? '' : `WHERE c.created_by = ${db.escape(req.user.id)}`}
            ORDER BY c.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createCompany = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { company_name, owner_name, email, phone, plan, employee_limit, status, password } = req.body;
        
        // 1. Insert Company
        const [companyResult] = await connection.execute(
            'INSERT INTO companies (company_name, owner_name, email, phone, plan, employee_limit, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [company_name, owner_name, email, phone, plan, employee_limit, status || 'active', req.user.id]
        );
        const companyId = companyResult.insertId;

        // 2. Create Admin User for this company if password is provided
        if (password) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(password, 10);
            await connection.execute(
                'INSERT INTO users (name, email, password, role, company_id) VALUES (?, ?, ?, ?, ?)',
                [owner_name, email, hashedPassword, 'admin', companyId]
            );
        }

        await connection.commit();

        // Log the action
        await audit.logAction(req.user.id, 'CREATE COMPANY', companyId, JSON.stringify({
            info: `Created company: ${company_name}`,
            email: email,
            plan: plan
        }));

        res.json({ message: 'Company created', id: companyId });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
};

exports.updateCompany = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { company_name, owner_name, email, phone, plan, employee_limit, status, password } = req.body;
        
        // 1. Update Company
        await connection.execute(
            'UPDATE companies SET company_name=?, owner_name=?, email=?, phone=?, plan=?, employee_limit=?, status=? WHERE id=?',
            [company_name, owner_name, email, phone, plan, employee_limit, status, id]
        );

        // 2. Check if Admin User exists for this company
        const [existingAdmins] = await connection.execute(
            'SELECT * FROM users WHERE company_id = ? AND role = "admin"',
            [id]
        );

        const bcrypt = require('bcryptjs');
        if (existingAdmins.length > 0) {
            // Update existing Admin (Password update explicitly removed for privacy)
            await connection.execute(
                'UPDATE users SET name = ?, email = ? WHERE company_id = ? AND role = "admin"',
                [owner_name, email, id]
            );
        } else {
            // Create Admin if not exists
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                await connection.execute(
                    'INSERT INTO users (name, email, password, role, company_id) VALUES (?, ?, ?, ?, ?)',
                    [owner_name, email, hashedPassword, 'admin', id]
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Company updated' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
};

exports.deleteCompany = async (req, res) => {
    try {
        await db.execute('DELETE FROM companies WHERE id=?', [req.params.id]);
        res.json({ message: 'Company deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateCompanyStatus = async (req, res) => {
    try {
        const { status } = req.body;
        await db.execute('UPDATE companies SET status=? WHERE id=?', [status, req.params.id]);
        res.json({ message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.resetCompanyPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const [existingAdmins] = await db.execute('SELECT * FROM users WHERE company_id = ? AND (role = "admin" OR role = "master admin") LIMIT 1', [id]);
        
        if (existingAdmins.length === 0) {
            return res.status(404).json({ message: 'Admin not found for this company' });
        }

        const admin = existingAdmins[0];
        const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-2).toUpperCase() + '!';
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        await db.execute(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, admin.id]
        );

        res.json({ message: 'Password reset successfully', tempPassword });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getRequests = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM company_requests ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.acceptRequest = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        
        const [requests] = await connection.execute('SELECT * FROM company_requests WHERE id=?', [id]);
        if (requests.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Request not found' });
        }
        const reqData = requests[0];
        if (reqData.status === 'accepted') {
            await connection.rollback();
            return res.status(400).json({ error: 'Request already accepted' });
        }

        // 1. Mark request as accepted
        await connection.execute('UPDATE company_requests SET status="accepted" WHERE id=?', [id]);

        // 2. Insert into companies
        const planToAssign = reqData.plan || 'Free Trial';
        const [planRows] = await connection.execute('SELECT employee_limit FROM plans WHERE name = ?', [planToAssign]);
        const empLimit = planRows.length > 0 ? (planRows[0].employee_limit || 0) : 0;

        const [companyResult] = await connection.execute(
            'INSERT INTO companies (company_name, owner_name, email, phone, plan, employee_limit, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [reqData.company_name, reqData.owner_name, reqData.email, reqData.phone || '', planToAssign, empLimit, 'active', req.user.id]
        );
        const companyId = companyResult.insertId;

        // 3. Create Admin User
        await connection.execute(
            'INSERT INTO users (name, email, password, role, company_id) VALUES (?, ?, ?, ?, ?)',
            [reqData.owner_name, reqData.email, reqData.password, 'admin', companyId]
        );

        // 4. Create Subscriptions
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7); // Default 7 days trial logic, superadmin can adjust later
        await connection.execute(
            'INSERT INTO subscriptions (company_id, plan_name, amount, billing_cycle, start_date, end_date, payment_status) VALUES (?, ?, ?, ?, CURDATE(), ?, "paid")',
            [companyId, planToAssign, 0, 'monthly', endDate.toISOString().split('T')[0]]
        );

        await connection.commit();

        // Log the action
        await audit.logAction(req.user.id, 'ACCEPT COMPANY REQUEST', reqData.id, JSON.stringify({
            info: `Accepted company request for: ${reqData.company_name}`,
            email: reqData.email,
            plan: planToAssign
        }));

        res.json({ message: 'Request accepted, company and admin user created successfully' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
};

exports.rejectRequest = async (req, res) => {
    try {
        await db.execute('UPDATE company_requests SET status="rejected" WHERE id=?', [req.params.id]);
        res.json({ message: 'Request rejected' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getInvoices = async (req, res) => {
    try {
        const isMaster = req.user.role && req.user.role.toLowerCase().includes('master');
        const [rows] = await db.execute(`
            SELECT s.*, c.company_name 
            FROM subscriptions s 
            LEFT JOIN companies c ON s.company_id = c.id 
            ${isMaster ? '' : `WHERE c.created_by = ${db.escape(req.user.id)}`}
            ORDER BY s.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getPayments = async (req, res) => {
    res.json([]);
};

exports.getAnalytics = async (req, res) => {
    try {
        const isMaster = req.user.role && req.user.role.toLowerCase().includes('master');
        const companyFilter = isMaster ? '' : `WHERE created_by = ${db.escape(req.user.id)}`;
        
        // 1. Overview Stats
        const [totalRev] = await db.execute(`SELECT SUM(s.amount) as total FROM subscriptions s LEFT JOIN companies c ON s.company_id = c.id WHERE s.payment_status = "paid" ${isMaster ? '' : `AND c.created_by = ${db.escape(req.user.id)}`}`);
        const [activeSubs] = await db.execute(`SELECT COUNT(*) as active FROM subscriptions s LEFT JOIN companies c ON s.company_id = c.id WHERE s.payment_status = "paid" AND s.end_date >= CURDATE() ${isMaster ? '' : `AND c.created_by = ${db.escape(req.user.id)}`}`);
        const [totalComps] = await db.execute(`SELECT COUNT(*) as total FROM companies ${companyFilter}`);

        // 2. Revenue Trend (Last 6 Months)
        const revenueTrend = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const monthStr = d.toLocaleString('default', { month: 'short' });
            const yearStr = d.getFullYear();
            
            const [revResult] = await db.execute(`
                SELECT SUM(s.amount) as total 
                FROM subscriptions s 
                LEFT JOIN companies c ON s.company_id = c.id 
                WHERE s.payment_status = 'paid' 
                AND MONTH(s.created_at) = ? AND YEAR(s.created_at) = ?
                ${isMaster ? '' : `AND c.created_by = ${db.escape(req.user.id)}`}
            `, [d.getMonth() + 1, yearStr]);
            
            revenueTrend.push({
                name: `${monthStr} ${yearStr}`,
                revenue: revResult[0].total || 0
            });
        }

        // 3. Plan Popularity
        const [planDist] = await db.execute(`
            SELECT s.plan_name as name, COUNT(*) as value 
            FROM subscriptions s 
            LEFT JOIN companies c ON s.company_id = c.id 
            WHERE s.payment_status = 'paid' AND s.end_date >= CURDATE()
            ${isMaster ? '' : `AND c.created_by = ${db.escape(req.user.id)}`}
            GROUP BY s.plan_name
        `);

        // If no plans, provide dummy for empty state
        const finalPlanDist = planDist.length > 0 ? planDist : [{ name: 'No Active Plans', value: 1 }];

        res.json({ 
            overview: {
                totalRevenue: totalRev[0].total || 0,
                activeSubscriptions: activeSubs[0].active || 0,
                totalCompanies: totalComps[0].total || 0
            },
            revenueTrend,
            planDistribution: finalPlanDist
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getSettings = async (req, res) => {
    res.json({ platform: 'Kiaan HRM Pro SuperAdmin' });
};

exports.updateSettings = async (req, res) => {
    res.json({ message: 'Updated' });
};

exports.getPlanRequests = async (req, res) => {
    try {
        const isMaster = req.user.role && req.user.role.toLowerCase().includes('master');
        const [rows] = await db.execute(`
            SELECT pr.*, c.company_name, c.email, c.owner_name 
            FROM plan_requests pr
            LEFT JOIN companies c ON pr.company_id = c.id
            ${isMaster ? '' : `WHERE c.created_by = ${db.escape(req.user.id)}`}
            ORDER BY pr.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.handlePlanRequest = async (req, res) => {
    const { id, action } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [reqs] = await connection.execute('SELECT * FROM plan_requests WHERE id = ?', [id]);
        if (reqs.length === 0) return res.status(404).json({ error: 'Request not found' });
        const request = reqs[0];
        const { company_id, requested_plan } = request;

        const status = action === 'accept' ? 'approved' : 'rejected';
        await connection.execute('UPDATE plan_requests SET status = ? WHERE id = ?', [status, id]);

        if (status === 'approved') {
            const [planRows] = await connection.execute('SELECT duration, price, employee_limit FROM plans WHERE name = ?', [requested_plan]);
            const planDuration = planRows.length > 0 ? planRows[0].duration : 'monthly';
            const amount = planRows.length > 0 ? planRows[0].price : 0;
            const empLimit = planRows.length > 0 ? (planRows[0].employee_limit || 0) : 0;

            let daysToAdd = 30;
            if (planDuration === 'weekly') daysToAdd = 7;
            if (planDuration === 'quarterly') daysToAdd = 90;
            if (planDuration === 'half-yearly') daysToAdd = 180;
            if (planDuration === 'annually') daysToAdd = 365;

            const [latestSubs] = await connection.execute(
                'SELECT created_at, billing_cycle FROM subscriptions WHERE company_id = ? ORDER BY id DESC LIMIT 1',
                [company_id]
            );

            let newCreatedAt = new Date();
            if (latestSubs.length > 0) {
                const lastSub = latestSubs[0];
                const lastCreatedAt = new Date(lastSub.created_at);
                const lastDuration = lastSub.billing_cycle || 'monthly';
                let lastDaysToAdd = 30;
                if (lastDuration === 'weekly') lastDaysToAdd = 7;
                if (lastDuration === 'quarterly') lastDaysToAdd = 90;
                if (lastDuration === 'half-yearly') lastDaysToAdd = 180;
                if (lastDuration === 'annually') lastDaysToAdd = 365;

                const lastExpiry = new Date(lastCreatedAt.getTime() + lastDaysToAdd * 24 * 60 * 60 * 1000);
                if (lastExpiry > newCreatedAt) {
                    const remainingDiff = lastExpiry - newCreatedAt;
                    newCreatedAt = new Date(newCreatedAt.getTime() + remainingDiff);
                }
            }
            
            const startStr = newCreatedAt.toISOString().slice(0, 10);
            const endStr = new Date(newCreatedAt.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const createdStr = newCreatedAt.toISOString().slice(0, 19).replace('T', ' ');

            await connection.execute(
                'INSERT INTO subscriptions (company_id, plan_name, billing_cycle, amount, payment_status, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, \'paid\', ?, ?, ?, NOW())',
                [company_id, requested_plan, planDuration, amount || 0, startStr, endStr, createdStr]
            );

            await connection.execute(
                'UPDATE companies SET plan = ?, employee_limit = ?, status = "active" WHERE id = ?',
                [requested_plan, empLimit, company_id]
            );
        }

        await connection.commit();

        // Log the action
        await audit.logAction(req.user.id, 'HANDLE PLAN REQUEST', id, JSON.stringify({
            info: `${action === 'accept' ? 'Accepted' : 'Rejected'} plan request for company ID: ${company_id}`,
            requested_plan,
            action
        }));

        res.json({ message: `Plan request ${status}` });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
};

exports.getPlans = async (req, res) => {
    try {
        const isMaster = req.user.role && req.user.role.toLowerCase().includes('master');
        const [rows] = await db.execute(`SELECT * FROM plans ${isMaster ? '' : `WHERE created_by = ${db.escape(req.user.id)}`} ORDER BY id ASC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createPlan = async (req, res) => {
    try {
        const { name, price, duration, employee_limit, description, features, buttonText, isPopular } = req.body;
        const empLimit = parseInt(employee_limit) || 0;
        await db.execute(
            'INSERT INTO plans (name, price, duration, employee_limit, description, features, buttonText, isPopular, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, price, duration, empLimit, description, JSON.stringify(features), buttonText || 'Get Started', isPopular ? 1 : 0, req.user.id]
        );
        res.json({ message: 'Plan created successfully' });
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
        await db.execute('DELETE FROM plans WHERE id=?', [req.params.id]);
        res.json({ message: 'Plan deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.recordPayment = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { company_id, plan_name, amount } = req.body;

        if (!company_id || !plan_name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const [planRows] = await connection.execute('SELECT duration, employee_limit FROM plans WHERE name = ?', [plan_name]);
        const planDuration = planRows.length > 0 ? planRows[0].duration : 'monthly';
        const empLimit = planRows.length > 0 ? (planRows[0].employee_limit || 0) : 0;
        
        let daysToAdd = 30;
        if (planDuration === 'weekly') daysToAdd = 7;
        if (planDuration === 'quarterly') daysToAdd = 90;
        if (planDuration === 'half-yearly') daysToAdd = 180;
        if (planDuration === 'annually') daysToAdd = 365;

        const [latestSubs] = await connection.execute(
            'SELECT created_at, billing_cycle FROM subscriptions WHERE company_id = ? ORDER BY id DESC LIMIT 1',
            [company_id]
        );

        let newCreatedAt = new Date();

        if (latestSubs.length > 0) {
            const lastSub = latestSubs[0];
            const lastCreatedAt = new Date(lastSub.created_at);
            const lastDuration = lastSub.billing_cycle || 'monthly';
            let lastDaysToAdd = 30;
            if (lastDuration === 'weekly') lastDaysToAdd = 7;
            if (lastDuration === 'quarterly') lastDaysToAdd = 90;
            if (lastDuration === 'half-yearly') lastDaysToAdd = 180;
            if (lastDuration === 'annually') lastDaysToAdd = 365;

            const lastExpiry = new Date(lastCreatedAt.getTime() + lastDaysToAdd * 24 * 60 * 60 * 1000);

            if (lastExpiry > newCreatedAt) {
                const remainingDiff = lastExpiry - newCreatedAt;
                newCreatedAt = new Date(newCreatedAt.getTime() + remainingDiff);
            }
        }

        const startStr = newCreatedAt.toISOString().slice(0, 10);
        const endStr = new Date(newCreatedAt.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const createdStr = newCreatedAt.toISOString().slice(0, 19).replace('T', ' ');

        await connection.execute(
            'INSERT INTO subscriptions (company_id, plan_name, billing_cycle, amount, payment_status, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, \'paid\', ?, ?, ?, NOW())',
            [company_id, plan_name, planDuration, amount || 0, startStr, endStr, createdStr]
        );

        await connection.execute(
            'UPDATE companies SET plan = ?, employee_limit = ?, status = "active" WHERE id = ?',
            [plan_name, empLimit, company_id]
        );

        await connection.commit();
        res.json({ message: 'Payment recorded successfully' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
};

exports.getEnquiries = async (req, res) => {
    try {
        const [enquiries] = await db.execute('SELECT * FROM enquiries ORDER BY created_at DESC');
        res.status(200).json(enquiries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.resolveEnquiry = async (req, res) => {
    try {
        const { id } = req.params;
        await db.execute("UPDATE enquiries SET status = 'resolved' WHERE id = ?", [id]);
        res.status(200).json({ message: 'Enquiry resolved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteEnquiry = async (req, res) => {
    try {
        const { id } = req.params;
        await db.execute('DELETE FROM enquiries WHERE id = ?', [id]);
        res.status(200).json({ message: 'Enquiry deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
