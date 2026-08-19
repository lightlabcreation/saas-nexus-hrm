const db = require('../config/db');

exports.getKPIs = async (req, res) => {
    try {
        const { company_id } = req.user;
        const [kpis] = await db.execute(
            'SELECT * FROM kpis WHERE company_id = ? ORDER BY updated_at DESC',
            [company_id]
        );
        res.json(kpis);
    } catch (err) {
        console.error('Error fetching KPIs:', err);
        res.status(500).json({ message: 'Server error fetching KPIs', error: err.message });
    }
};

exports.getMyKPI = async (req, res) => {
    try {
        const { company_id, employee_id } = req.user;

        if (!employee_id) {
            return res.status(400).json({ message: 'User is not an employee' });
        }

        const [kpis] = await db.execute(
            'SELECT * FROM kpis WHERE company_id = ? AND employee_id = ? ORDER BY updated_at DESC LIMIT 1',
            [company_id, employee_id]
        );

        if (kpis.length === 0) {
            // Return default KPI structure if none exists
            return res.json({
                attendance_score: 0,
                task_score: 0,
                overall_score: 0,
                rating: 'Average',
                review_period: 'Q' + Math.ceil((new Date().getMonth() + 1) / 3) + ' ' + new Date().getFullYear()
            });
        }

        res.json(kpis[0]);
    } catch (err) {
        console.error('Error fetching my KPI:', err);
        res.status(500).json({ message: 'Server error fetching my KPI', error: err.message });
    }
};

exports.updateKPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { company_id } = req.user;
        const { task_score, review_period, employee_id } = req.body;

        const taskScoreNum = parseInt(task_score, 10);

        // Auto-calculate Attendance Score for the last 30 days
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        let expected_days = 0;
        let cur = new Date(thirtyDaysAgo);
        while (cur <= today) {
            if (cur.getDay() !== 0 && cur.getDay() !== 6) {
                expected_days++;
            }
            cur.setDate(cur.getDate() + 1);
        }

        const [attendanceStats] = await db.execute(`
            SELECT 
                SUM(CASE WHEN status IN ('present', 'late', 'half_day') THEN 1 ELSE 0 END) as present_days
            FROM attendance 
            WHERE employee_id = ? AND company_id = ? AND date >= ?
        `, [employee_id, company_id, thirtyDaysAgo.toISOString().split('T')[0]]);

        const present_days = attendanceStats[0].present_days || 0;
        let attendance_score = 0;
        if (expected_days > 0) {
            attendance_score = Math.round((present_days / expected_days) * 100);
            if (attendance_score > 100) attendance_score = 100;
        }

        const overall_score = Math.round((attendance_score + taskScoreNum) / 2);

        let rating = 'Average';
        if (overall_score >= 75) rating = 'High';
        else if (overall_score >= 50) rating = 'Average';
        else rating = 'Low';

        const [result] = await db.execute(
            'UPDATE kpis SET attendance_score = ?, task_score = ?, overall_score = ?, rating = ?, review_period = ? WHERE id = ? AND company_id = ?',
            [attendance_score, taskScoreNum, overall_score, rating, review_period, id, company_id]
        );

         if (result.affectedRows === 0) {
            // Maybe we need to insert it if it doesn't exist?
            // The frontend should ideally send employee_id for creation, but let's assume update for now based on route
             return res.status(404).json({ message: 'KPI record not found' });
        }

        res.json({ message: 'KPI updated successfully' });
    } catch (err) {
        console.error('Error updating KPI:', err);
        res.status(500).json({ message: 'Server error updating KPI', error: err.message });
    }
};
exports.createKPI = async (req, res) => {
    try {
        const { company_id } = req.user;
        const { employee_id, task_score, review_period } = req.body;

        if (!employee_id || task_score === undefined) {
            return res.status(400).json({ message: 'Missing employee_id or task_score' });
        }

        // Fetch employee details
        const [emp] = await db.execute('SELECT name, department FROM employees WHERE id = ? AND company_id = ?', [employee_id, company_id]);
        if (emp.length === 0) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        const { name: employee_name, department } = emp[0];

        // Auto-calculate Attendance Score for the last 30 days
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        let expected_days = 0;
        let cur = new Date(thirtyDaysAgo);
        while (cur <= today) {
            if (cur.getDay() !== 0 && cur.getDay() !== 6) {
                expected_days++;
            }
            cur.setDate(cur.getDate() + 1);
        }

        const [attendanceStats] = await db.execute(`
            SELECT 
                SUM(CASE WHEN status IN ('present', 'late', 'half_day') THEN 1 ELSE 0 END) as present_days
            FROM attendance 
            WHERE employee_id = ? AND company_id = ? AND date >= ?
        `, [employee_id, company_id, thirtyDaysAgo.toISOString().split('T')[0]]);

        const present_days = attendanceStats[0].present_days || 0;
        let attendance_score = 0;
        if (expected_days > 0) {
            attendance_score = Math.round((present_days / expected_days) * 100);
            if (attendance_score > 100) attendance_score = 100;
        }

        const taskScoreNum = parseInt(task_score, 10);
        const overall_score = Math.round((attendance_score + taskScoreNum) / 2);

        let rating = 'Average';
        if (overall_score >= 75) rating = 'High';
        else if (overall_score >= 50) rating = 'Average';
        else rating = 'Low';

        await db.execute(`
            INSERT INTO kpis (company_id, employee_id, employee_name, department, attendance_score, task_score, overall_score, rating, review_period)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [company_id, employee_id, employee_name, department, attendance_score, taskScoreNum, overall_score, rating, review_period || 'Current Period']);

        res.status(201).json({ message: 'KPI generated successfully', attendance_score, overall_score, rating });

    } catch (err) {
        console.error('Error creating KPI:', err);
        res.status(500).json({ message: 'Server error creating KPI', error: err.message });
    }
};

exports.deleteKPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { company_id } = req.user;

        const [result] = await db.execute(
            'DELETE FROM kpis WHERE id = ? AND company_id = ?',
            [id, company_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'KPI record not found' });
        }

        res.json({ message: 'KPI deleted successfully' });
    } catch (err) {
        console.error('Error deleting KPI:', err);
        res.status(500).json({ message: 'Server error deleting KPI', error: err.message });
    }
};
