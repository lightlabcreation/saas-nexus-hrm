const db = require('../config/db');

exports.getClaims = async (req, res) => {
    try {
        const { company_id, role, employee_id } = req.user;
        let query = 'SELECT * FROM claims WHERE company_id = ?';
        let params = [company_id];

        // If employee, only show their own claims
        if (role === 'employee') {
            query += ' AND employee_id = ?';
            params.push(employee_id);
        }

        query += ' ORDER BY created_at DESC';

        const [claims] = await db.execute(query, params);
        res.json(claims);
    } catch (err) {
        console.error('Error fetching claims:', err);
        res.status(500).json({ message: 'Server error fetching claims', error: err.message });
    }
};

exports.submitClaim = async (req, res) => {
    try {
        const { company_id, employee_id } = req.user;
        const { claim_type, amount, expense_date, description } = req.body;

        if (!employee_id) {
            return res.status(400).json({ message: 'Only employees can submit claims' });
        }

        // Retrieve employee name from database as it's not present in req.user token payload
        const [empRows] = await db.execute('SELECT name FROM employees WHERE id = ?', [employee_id]);
        const employeeName = empRows.length > 0 ? empRows[0].name : 'Employee';

        const receipt = req.file ? `/uploads/${req.file.filename}` : null;

        const [result] = await db.execute(
            `INSERT INTO claims 
            (company_id, employee_id, employee_name, claim_type, amount, expense_date, description, receipt, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [
                company_id || null, 
                employee_id || null, 
                employeeName, 
                claim_type || null, 
                amount || 0, 
                expense_date || null, 
                description || null, 
                receipt
            ]
        );

        // Notify Admin conditionally
        const [settingsRows] = await db.execute('SELECT notify_claims FROM settings WHERE company_id = ?', [company_id]);
        const shouldNotify = settingsRows.length > 0 ? settingsRows[0].notify_claims : 1;

        if (shouldNotify) {
            await db.execute(
                `INSERT INTO in_app_notifications (company_id, title, message, type) VALUES (?, ?, ?, ?)`,
                [company_id, 'New Claim Request', `${employeeName} has submitted a ${claim_type || 'claim'} for ${amount}.`, 'info']
            );
        }

        res.json({ message: 'Claim submitted successfully', id: result.insertId });
    } catch (err) {
        console.error('Error submitting claim:', err);
        res.status(500).json({ message: 'Server error submitting claim', error: err.message });
    }
};

exports.updateClaimStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { company_id } = req.user;

        const [result] = await db.execute(
            'UPDATE claims SET status = ? WHERE id = ? AND company_id = ?',
            [status, id, company_id]
        );

        if (result.affectedRows === 0) {
             return res.status(404).json({ message: 'Claim not found' });
        }

        res.json({ message: `Claim status updated to ${status}` });
    } catch (err) {
        console.error('Error updating claim status:', err);
        res.status(500).json({ message: 'Server error updating claim status', error: err.message });
    }
};
