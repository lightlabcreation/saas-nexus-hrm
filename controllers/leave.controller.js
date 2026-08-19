const db = require('../config/db');

exports.getLeaves = async (req, res) => {
    try {
        const { company_id, role, employee_id } = req.user;
        let query = `
            SELECT l.*, e.name as employee_name, e.custom_id as employee_id 
            FROM leaves l 
            LEFT JOIN employees e ON l.employee_id = e.id 
            WHERE l.company_id = ?
        `;
        let params = [company_id];

        // If employee, only show their own leaves
        if (role === 'employee') {
            query += ' AND l.employee_id = ?';
            params.push(employee_id);
        } else {
            // Admin/HR shouldn't see leaves they cleared
            query += ' AND (l.admin_hidden = FALSE OR l.admin_hidden IS NULL)';
        }

        query += ' ORDER BY l.created_at DESC';

        const [leaves] = await db.execute(query, params);
        res.json(leaves);
    } catch (err) {
        console.error('Error fetching leaves:', err);
        res.status(500).json({ message: 'Server error fetching leaves', error: err.message });
    }
};

exports.getLeaveBalances = async (req, res) => {
    try {
        const { company_id, employee_id } = req.user;

        if (!employee_id) {
            return res.status(400).json({ message: 'User is not an employee' });
        }

        const [balances] = await db.execute(
            'SELECT * FROM leave_balances WHERE company_id = ? AND employee_id = ?',
            [company_id, employee_id]
        );

        if (balances.length === 0) {
            // Return default balances if not found
            return res.json({
                annual: 15,
                sick: 10,
                unpaid: 20,
                emergency: 5
            });
        }

        res.json(balances[0]);
    } catch (err) {
        console.error('Error fetching leave balances:', err);
        res.status(500).json({ message: 'Server error fetching leave balances', error: err.message });
    }
};

exports.applyLeave = async (req, res) => {
    try {
        const { company_id, employee_id } = req.user;
        const name = req.user.name || req.body.employee_name || 'Employee';
        const { leave_type, start_date, end_date, days, half_day, reason } = req.body;

        if (!employee_id) {
            return res.status(400).json({ message: 'Only employees can apply for leave' });
        }

        const attachment = req.file ? `/uploads/${req.file.filename}` : null;

        await db.execute(
            `INSERT INTO leaves 
            (company_id, employee_id, employee_name, leave_type, start_date, end_date, days, half_day, reason, applied_date, attachment) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
            [company_id, employee_id, name, leave_type || 'Leave Request', start_date, end_date, days || 1, half_day ? 1 : 0, reason || '', attachment]
        );

        // Notify Admin conditionally
        const [settingsRows] = await db.execute('SELECT notify_leaves FROM settings WHERE company_id = ?', [company_id]);
        const shouldNotify = settingsRows.length > 0 ? settingsRows[0].notify_leaves : 1;

        if (shouldNotify) {
            await db.execute(
                `INSERT INTO in_app_notifications (company_id, title, message, type) VALUES (?, ?, ?, ?)`,
                [company_id, 'New Leave Request', `${name} has applied for ${days || 1} day(s) of leave.`, 'info']
            );
        }

        res.json({ message: 'Leave application submitted successfully' });
    } catch (err) {
        console.error('Error applying for leave:', err);
        res.status(500).json({ message: 'Server error applying for leave', error: err.message });
    }
};

exports.updateLeaveStatus = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { company_id } = req.user;

        await connection.beginTransaction();

        // 1. Get the leave details
        const [leaves] = await connection.execute(
            'SELECT * FROM leaves WHERE id = ? AND company_id = ?',
            [id, company_id]
        );

        if (leaves.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Leave not found' });
        }

        const leave = leaves[0];

        // 2. Update leave status
        await connection.execute(
            'UPDATE leaves SET status = ? WHERE id = ? AND company_id = ?',
            [status, id, company_id]
        );

        // 3. Handle leave_balances deduction/restoration
        const leaveTypeMap = {
            'Annual Leave': 'annual',
            'Sick Leave': 'sick',
            'Unpaid Leave': 'unpaid',
            'Emergency Leave': 'emergency'
        };
        const dbColumn = leaveTypeMap[leave.leave_type];

        if (dbColumn) {
            // Ensure leave balance exists first
            const [balances] = await connection.execute(
                'SELECT id FROM leave_balances WHERE employee_id = ?',
                [leave.employee_id]
            );

            if (balances.length === 0) {
                await connection.execute(
                    'INSERT INTO leave_balances (company_id, employee_id) VALUES (?, ?)',
                    [company_id, leave.employee_id]
                );
            }

            // If changing to Approved from something else, deduct balance
            if (status === 'Approved' && leave.status !== 'Approved') {
                await connection.execute(
                    `UPDATE leave_balances SET ${dbColumn} = ${dbColumn} - ? WHERE employee_id = ?`,
                    [leave.days, leave.employee_id]
                );
            } 
            // If changing FROM Approved to something else, restore balance
            else if (leave.status === 'Approved' && status !== 'Approved') {
                await connection.execute(
                    `UPDATE leave_balances SET ${dbColumn} = ${dbColumn} + ? WHERE employee_id = ?`,
                    [leave.days, leave.employee_id]
                );
            }
        }

        await connection.commit();
        res.json({ message: `Leave status updated to ${status}` });
    } catch (err) {
        await connection.rollback();
        console.error('Error updating leave status:', err);
        res.status(500).json({ message: 'Server error updating leave status', error: err.message });
    } finally {
        connection.release();
    }
};

exports.clearLeaveHistory = async (req, res) => {
    try {
        const { company_id } = req.user;
        // Hide leaves from admin instead of deleting, so employees can still see their history
        await db.execute('UPDATE leaves SET admin_hidden = TRUE WHERE company_id = ? AND status != "Pending"', [company_id]);
        res.json({ message: 'Leave history cleared successfully' });
    } catch (err) {
        console.error('Error clearing leave history:', err);
        res.status(500).json({ message: 'Server error clearing leave history', error: err.message });
    }
};
