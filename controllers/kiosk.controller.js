const db = require('../config/db');
const moment = require('moment-timezone');
const { determinePunchStatus } = require('../utils/attendanceHelper');

const euclideanDistance = (desc1, desc2) => {
    if (desc1.length !== desc2.length) return Infinity;
    return Math.sqrt(
        desc1.reduce((sum, val, i) => sum + Math.pow(val - desc2[i], 2), 0)
    );
};

const FACE_MATCH_THRESHOLD = 0.45;

exports.getKioskSettings = async (req, res) => {
    try {
        const { company_id } = req.user;
        const [settings] = await db.execute(
            'SELECT * FROM kiosk_settings WHERE company_id = ?',
            [company_id]
        );

        if (settings.length === 0) {
            return res.json({
                kiosk_name: 'Reception Tablet A',
                branch: '',
                status: 'Active'
            });
        }

        res.json(settings[0]);
    } catch (err) {
        console.error('Error fetching kiosk settings:', err);
        res.status(500).json({ message: 'Server error fetching kiosk settings', error: err.message });
    }
};

exports.updateKioskSettings = async (req, res) => {
    try {
        const { company_id } = req.user;
        const { kiosk_name, branch, status } = req.body;

        const [settings] = await db.execute(
            'SELECT id FROM kiosk_settings WHERE company_id = ?',
            [company_id]
        );

        if (settings.length === 0) {
            await db.execute(
                'INSERT INTO kiosk_settings (company_id, kiosk_name, branch, status) VALUES (?, ?, ?, ?)',
                [company_id, kiosk_name, branch, status]
            );
        } else {
            await db.execute(
                'UPDATE kiosk_settings SET kiosk_name = ?, branch = ?, status = ? WHERE company_id = ?',
                [kiosk_name, branch, status, company_id]
            );
        }

        res.json({ message: 'Kiosk settings updated successfully' });
    } catch (err) {
        console.error('Error updating kiosk settings:', err);
        res.status(500).json({ message: 'Server error updating kiosk settings', error: err.message });
    }
};

exports.kioskPunch = async (req, res) => {
    try {
        const { employeeId, type } = req.body;

        if (!employeeId || !type) {
             return res.status(400).json({ message: 'Employee ID and punch type are required' });
        }

        // Validate employee exists
        const [employees] = await db.execute(
            'SELECT * FROM employees WHERE custom_id = ? OR machine_id = ? OR id = ?',
            [employeeId, employeeId, employeeId]
        );

        if (employees.length === 0) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        const employee = employees[0];
        const date = new Date().toISOString().split('T')[0];
        const now = new Date();

        // Find existing attendance record for today
        const [attendance] = await db.execute(
            'SELECT * FROM attendance WHERE employee_id = ? AND date = ?',
            [employee.id, date]
        );

        let uiStatus = 'On Time';

        if (type === 'Punch In') {
            if (attendance.length > 0 && attendance[0].in_time) {
                return res.status(400).json({ message: 'Already punched in today' });
            }

            if (attendance.length === 0) {
                const status = await determinePunchStatus(employee.company_id, now.toISOString());
                uiStatus = status === 'late' ? 'Late' : 'On Time';
                await db.execute(
                    'INSERT INTO attendance (company_id, employee_id, date, in_time, status) VALUES (?, ?, ?, ?, ?)',
                    [employee.company_id, employee.id, date, now, status]
                );
            } else {
                 const status = await determinePunchStatus(employee.company_id, now.toISOString());
                 uiStatus = status === 'late' ? 'Late' : 'On Time';
                 await db.execute(
                    'UPDATE attendance SET in_time = ?, status = ? WHERE id = ?',
                    [now, status, attendance[0].id]
                );
            }
        } else if (type === 'Punch Out') {
            if (attendance.length === 0 || !attendance[0].in_time) {
                 return res.status(400).json({ message: 'Cannot punch out without punching in first' });
            }
            
            if (attendance[0].out_time) {
                 return res.status(400).json({ message: 'Already punched out today' });
            }

            const inTime = new Date(attendance[0].in_time);
            const diffHours = (now - inTime) / (1000 * 60 * 60);

            await db.execute(
                'UPDATE attendance SET out_time = ?, total_hours = ? WHERE id = ?',
                [now, diffHours.toFixed(2), attendance[0].id]
            );
            uiStatus = `${diffHours.toFixed(1)} hrs worked`;
        } else {
            return res.status(400).json({ message: 'Invalid punch type' });
        }

        res.json({ 
            success: true,
            message: `${type} successful for ${employee.name}`,
            employee: { name: employee.name, custom_id: employee.custom_id, department: employee.department || 'N/A' },
            log: { action: type, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status: uiStatus, device: 'Kiosk Mode' }
        });

    } catch (err) {
        console.error('Error processing kiosk punch:', err);
        res.status(500).json({ message: 'Server error processing punch', error: err.message });
    }
};

exports.kioskFacePunch = async (req, res) => {
    try {
        const { company_id } = req.user;
        const { descriptor, livenessPassed, livenessScore } = req.body;

        if (!descriptor || !Array.isArray(descriptor)) {
            return res.status(400).json({ message: 'Invalid face descriptor.' });
        }
        
        if (!livenessPassed || livenessScore < 0.80) {
            return res.status(403).json({ message: 'Anti-spoofing triggered. Real face not detected.' });
        }

        let query = `
            SELECT fe.employee_id, fe.descriptor, e.name, e.custom_id, e.company_id
            FROM face_embeddings fe
            JOIN employees e ON fe.employee_id = e.id
            WHERE e.status = 'active'
        `;
        let params = [];

        if (req.user.role !== 'MasterAdmin') {
            query += ' AND e.company_id = ?';
            params.push(company_id);
        }

        // Fetch all face embeddings for the company (or all if MasterAdmin)
        const [embeddings] = await db.execute(query, params);

        if (embeddings.length === 0) {
            return res.status(400).json({ message: 'No registered faces found for this company.' });
        }

        let bestMatch = null;
        let minDistance = Infinity;

        for (const row of embeddings) {
            const storedDescriptor = typeof row.descriptor === 'string' ? JSON.parse(row.descriptor) : row.descriptor;
            const distance = euclideanDistance(descriptor, storedDescriptor);
            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = row;
            }
        }

        if (minDistance <= FACE_MATCH_THRESHOLD && bestMatch) {
            const employeeId = bestMatch.employee_id;
            const date = new Date().toISOString().split('T')[0];
            const now = new Date();
            const nowFormatted = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
            const todayFormatted = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");

            await db.execute('INSERT INTO face_logs (employee_id, status, confidence) VALUES (?, ?, ?)', [employeeId, 'success', minDistance]);

            // Find existing attendance record for today
            const [attendance] = await db.execute(
                'SELECT * FROM attendance WHERE employee_id = ? AND date = ?',
                [employeeId, todayFormatted]
            );

            let action = 'Punch In';

            let uiStatus = 'On Time';

            if (attendance.length === 0) {
                // Punch In
                const status = await determinePunchStatus(bestMatch.company_id, nowFormatted);
                uiStatus = status === 'late' ? 'Late' : 'On Time';
                await db.execute(
                    'INSERT INTO attendance (company_id, employee_id, date, in_time, status) VALUES (?, ?, ?, ?, ?)',
                    [bestMatch.company_id, employeeId, todayFormatted, nowFormatted, status]
                );
            } else if (!attendance[0].out_time) {
                // Punch Out
                action = 'Punch Out';
                
                const inTimeStr = attendance[0].in_time; 
                const inTime = moment.tz(inTimeStr, "YYYY-MM-DD HH:mm:ss", "Asia/Kolkata");
                const outTime = moment.tz(nowFormatted, "YYYY-MM-DD HH:mm:ss", "Asia/Kolkata");
                
                const diffMs = outTime.diff(inTime);
                const totalHours = (diffMs / (1000 * 60 * 60)).toFixed(2);

                await db.execute(
                    'UPDATE attendance SET out_time = ?, total_hours = ? WHERE id = ?',
                    [nowFormatted, totalHours, attendance[0].id]
                );
            } else {
                return res.status(400).json({ message: 'Already punched out for today.' });
            }

            return res.json({ 
                success: true, 
                message: `${action} successful for ${bestMatch.name}`,
                employee: { name: bestMatch.name, custom_id: bestMatch.custom_id, department: 'N/A' },
                log: { action, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status: uiStatus, device: 'Kiosk Face Scanner' }
            });
        } else {
            await db.execute('INSERT INTO unknown_attempts (confidence) VALUES (?)', [minDistance]);
            return res.status(400).json({ message: 'Face match failed. Please try again.' });
        }
    } catch (err) {
        console.error('Error processing kiosk face punch:', err);
        res.status(500).json({ message: 'Server error processing face punch', error: err.message });
    }
};
