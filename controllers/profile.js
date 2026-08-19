const db = require('../config/db');
const bcrypt = require('bcryptjs');

exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const [users] = await db.execute('SELECT id, name, email, role, employee_id, photo FROM users WHERE id = ?', [userId]);
        
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(users[0]);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const employeeId = req.user.employee_id;
        const { name, email, password, photo } = req.body;
        // NOTE: 'role' is intentionally NOT accepted here to prevent privilege escalation.
        // Role changes must go through admin/superadmin management endpoints.

        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email);
        }
        if (photo !== undefined) {
            updates.push('photo = ?');
            params.push(photo);
        }
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push('password = ?');
            params.push(hashedPassword);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        params.push(userId);

        await db.execute(query, params);

        // SYNC: If this user is an employee, sync name and photo back to employees table
        if (employeeId) {
            const empUpdates = [];
            const empParams = [];
            if (name !== undefined) { empUpdates.push('name = ?'); empParams.push(name); }
            if (photo !== undefined) { empUpdates.push('photo = ?'); empParams.push(photo); }
            if (email !== undefined) { empUpdates.push('email = ?'); empParams.push(email); }
            
            if (empUpdates.length > 0) {
                const empQuery = `UPDATE employees SET ${empUpdates.join(', ')} WHERE id = ?`;
                empParams.push(employeeId);
                await db.execute(empQuery, empParams);
            }
        }

        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role ? req.user.role.toLowerCase() : 'employee';
        const isMaster = role.includes('master');
        const isAdmin = role.includes('admin') && !isMaster;

        let notifications = [];

        if (isMaster) {
            const [companyRequests] = await db.execute('SELECT company_name, created_at FROM company_requests WHERE status = "pending" ORDER BY created_at DESC LIMIT 3');
            companyRequests.forEach(cr => {
                notifications.push({
                    title: 'New Company Request',
                    desc: `${cr.company_name} requested to join the platform`,
                    time: cr.created_at,
                    type: 'system'
                });
            });

            const [companies] = await db.execute('SELECT company_name, created_at FROM companies ORDER BY created_at DESC LIMIT 3');
            companies.forEach(c => {
                notifications.push({
                    title: 'New Company Registered',
                    desc: `${c.company_name} joined the platform`,
                    time: c.created_at,
                    type: 'system'
                });
            });
            const [requests] = await db.execute('SELECT c.company_name, pr.requested_plan, pr.created_at FROM plan_requests pr JOIN companies c ON pr.company_id = c.id ORDER BY pr.created_at DESC LIMIT 3');
            requests.forEach(r => {
                notifications.push({
                    title: 'Plan Request',
                    desc: `${r.company_name} requested ${r.requested_plan} plan`,
                    time: r.created_at,
                    type: 'payroll'
                });
            });
        } else if (isAdmin) {
            const [attendance] = await db.execute(`
                SELECT e.name, a.status, a.date as created_at 
                FROM attendance a 
                JOIN employees e ON a.employee_id = e.id 
                WHERE e.created_by = ? 
                ORDER BY a.date DESC LIMIT 3
            `, [userId]);
            attendance.forEach(a => {
                notifications.push({
                    title: 'Attendance Update',
                    desc: `${a.name} marked as ${a.status}`,
                    time: a.created_at,
                    type: 'attendance'
                });
            });

            const [payroll] = await db.execute(`
                SELECT e.name, p.cycle_start, p.cycle_end as generated_at 
                FROM payroll p 
                JOIN employees e ON p.employee_id = e.id 
                WHERE e.created_by = ? 
                ORDER BY p.cycle_end DESC LIMIT 2
            `, [userId]);
            payroll.forEach(p => {
                notifications.push({
                    title: 'Payroll Generated',
                    desc: `Payroll for ${p.name} (${new Date(p.cycle_start).toLocaleDateString()})`,
                    time: p.generated_at,
                    type: 'payroll'
                });
            });
            
            const [emp] = await db.execute('SELECT name, created_at FROM employees WHERE created_by = ? ORDER BY created_at DESC LIMIT 2', [userId]);
            emp.forEach(e => {
                notifications.push({
                    title: 'New Employee Added',
                    desc: `${e.name} was added to the system`,
                    time: e.created_at,
                    type: 'system'
                });
            });
        } else {
            // Employee Notifications
            const [attendance] = await db.execute(`
                SELECT status, date as created_at FROM attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 3
            `, [req.user.employee_id]);
            attendance.forEach(a => {
                notifications.push({
                    title: 'Attendance Marked',
                    desc: `You were marked ${a.status}`,
                    time: a.created_at,
                    type: 'attendance'
                });
            });

            const [leaves] = await db.execute(`
                SELECT leave_type, status, applied_date as created_at 
                FROM leaves 
                WHERE employee_id = ? 
                ORDER BY applied_date DESC LIMIT 3
            `, [req.user.employee_id]);
            leaves.forEach(l => {
                notifications.push({
                    title: 'Leave Update',
                    desc: `Your ${l.leave_type} is ${l.status}`,
                    time: l.created_at,
                    type: 'system'
                });
            });

            const [payroll] = await db.execute(`
                SELECT cycle_start, cycle_end as generated_at FROM payroll WHERE employee_id = ? ORDER BY cycle_end DESC LIMIT 2
            `, [req.user.employee_id]);
            payroll.forEach(p => {
                notifications.push({
                    title: 'Payroll Ready',
                    desc: `Your payroll starting ${new Date(p.cycle_start).toLocaleDateString()} is ready`,
                    time: p.generated_at,
                    type: 'payroll'
                });
            });
        }

        notifications.sort((a, b) => new Date(b.time) - new Date(a.time));
        
        // Take top 5
        notifications = notifications.slice(0, 5);

        const formatTimeAgo = (dateStr) => {
            const date = new Date(dateStr);
            const now = new Date();
            const diffInSeconds = Math.floor((now - date) / 1000);
            if (diffInSeconds < 60) return `${diffInSeconds} secs ago`;
            if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} mins ago`;
            if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
            return `${Math.floor(diffInSeconds / 86400)} days ago`;
        };

        notifications = notifications.map(n => ({
            ...n,
            time: formatTimeAgo(n.time)
        }));

        res.json(notifications);

    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};
