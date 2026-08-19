const db = require('../config/db');
const { determinePunchStatus } = require('../utils/attendanceHelper');
// Helper: treat 'admin', 'Master Admin', 'hr', and 'hr admin' as admin roles
const isAdmin = (role) => {
    if (!role) return false;
    const r = role.toLowerCase();
    return r === 'admin' || r === 'master admin' || r === 'hr' || r === 'hr admin';
};

// Get attendance logs (Filtered by creator if admin)
exports.getAttendance = async (req, res) => {
    const { date } = req.query;
    let employeeId = req.query.employeeId;

    if (req.user.role === 'employee') {
        employeeId = req.user.employee_id;
    }

    let query = 'SELECT a.*, e.name, e.role, e.photo, e.department, e.shift, e.salary_rate, e.salary_type, e.created_by FROM attendance a JOIN employees e ON a.employee_id = e.id';
    const params = [];
    let whereClauses = [];

    if (date) {
        whereClauses.push('a.date = ?');
        params.push(date);
    }

    if (employeeId) {
        whereClauses.push('a.employee_id = ?');
        params.push(employeeId);
    }

    if (req.query.shift && req.query.shift !== 'All Shifts') {
        whereClauses.push('e.shift = ?');
        params.push(req.query.shift);
    }

    if (req.query.date_from && req.query.date_to) {
        whereClauses.push('a.date BETWEEN ? AND ?');
        params.push(req.query.date_from, req.query.date_to);
    }

    // Data Isolation for Multi-Admin (skip for superadmin)
    if (req.user.role !== 'MasterAdmin') {
        whereClauses.push('a.company_id = ?');
        params.push(req.user.company_id);
    }

    if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += ' ORDER BY a.date DESC, a.in_time DESC';

    try {
        console.log('📝 Executing SQL (getAttendance):', query, 'Params:', params);
        const [rows] = await db.execute(query, params);
        const enhancedRows = rows.map(row => {
            const hours = parseFloat(row.total_hours || 0);
            const rate = parseFloat(row.salary_rate || 0);
            let earning = 0;
            if (row.salary_type === 'hourly') earning = hours * rate;
            else if (row.salary_type === 'monthly') earning = hours > 0 ? (rate / 30) : 0;
            else if (row.salary_type === 'daily') earning = hours > 0 ? rate : 0;
            const uif = earning * 0.01;
            return { ...row, earning: earning.toFixed(2), uif: uif.toFixed(2) };
        });
        res.json(enhancedRows);
    } catch (err) {
        console.error('❌ SQL Error (getAttendance):', err);
        res.status(500).json({ message: 'Error fetching attendance', error: err.message });
    }
};

// Internal helper for background processing
const processAllRawLogs = async () => {
    const [settingsRows] = await db.execute('SELECT standard_start_time FROM settings WHERE id = 1');
    const stdStart = settingsRows[0]?.standard_start_time || '09:00:00';

    let count = 0;
    for (let log of rawLogs) {
        const dateTimeStr = log.punch_time;
        const date = dateTimeStr.split(' ')[0];
        const time = dateTimeStr.split(' ')[1];

        const [emps] = await db.execute('SELECT id FROM employees WHERE machine_id = ?', [log.machine_user_id]);

        if (emps.length > 0) {
            const employeeId = emps[0].id;
            const [existing] = await db.execute('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [employeeId, date]);

            if (existing.length === 0) {
                // Determine if late dynamically based on company settings
                const employeeCompanyId = emps[0].company_id || null;
                const status = await determinePunchStatus(employeeCompanyId, log.punch_time);
                
                await db.execute('INSERT INTO attendance (employee_id, date, in_time, status) VALUES (?, ?, ?, ?)', [employeeId, date, log.punch_time, status]);
            } else {
                const inTime = new Date(existing[0].in_time);
                const outTime = new Date(log.punch_time);
                const diffMs = outTime - inTime;

                if (diffMs > 0) {
                    const hours = (diffMs / (1000 * 60 * 60)).toFixed(2);
                    await db.execute('UPDATE attendance SET out_time = ?, total_hours = ? WHERE id = ?', [log.punch_time, hours, existing[0].id]);
                }
            }
            count++;
        }
        await db.execute('UPDATE raw_logs SET is_processed = TRUE WHERE id = ?', [log.id]);
    }
    return { success: true, count };
};

exports.processAllRawLogs = processAllRawLogs;

// Process Raw Logs (API Route)
exports.processLogs = async (req, res) => {
    try {
        const result = await processAllRawLogs();
        res.json({ message: result.count > 0 ? 'Logs processed' : 'No new logs', count: result.count });
    } catch (err) {
        console.error('Processing failed:', err);
        res.status(500).json({ message: 'Processing failed', error: err.message });
    }
};

exports.addManualAttendance = async (req, res) => {
    const { employeeId, date, inTime, outTime, status } = req.body;
    try {
        // Safety: Verify admin owns this employee
        const [emp] = await db.execute('SELECT company_id FROM employees WHERE id = ?', [employeeId]);
        if (emp.length > 0 && req.user.role !== 'MasterAdmin' && emp[0].company_id !== req.user.company_id) {
            return res.status(403).json({ message: 'Cannot mark attendance for staff from another company' });
        }

        let totalHours = 0;
        let fIn = inTime ? `${date} ${inTime}:00` : null;
        let fOut = outTime ? `${date} ${outTime}:00` : null;
        if (fIn && fOut) {
            totalHours = ((new Date(fOut) - new Date(fIn)) / (1000 * 60 * 60)).toFixed(2);
        }
        let finalStatus = status;
        if (!finalStatus && fIn) {
            finalStatus = await determinePunchStatus(req.user.company_id, fIn);
        } else if (!finalStatus) {
            finalStatus = 'present';
        }

        const [existing] = await db.execute('SELECT id FROM attendance WHERE employee_id = ? AND date = ?', [employeeId, date]);

        if (existing.length > 0) {
            const sql = 'UPDATE attendance SET in_time = ?, out_time = ?, total_hours = ?, status = ? WHERE id = ?';
            const values = [fIn, fOut, totalHours, finalStatus, existing[0].id];
            console.log('📝 Executing SQL (Update Manual Attendance):', sql, 'Params:', values);
            await db.execute(sql, values);
        } else {
            const sql = 'INSERT INTO attendance (employee_id, date, in_time, out_time, total_hours, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
            const values = [employeeId, date, fIn, fOut, totalHours, finalStatus, req.user.company_id];
            console.log('📝 Executing SQL (Add Manual Attendance):', sql, 'Params:', values);
            await db.execute(sql, values);
        }

        await logAudit(req.user.id, 'ADD_MANUAL_ATTENDANCE', employeeId, { date, status });
        res.json({ message: 'Added successfully' });
    } catch (err) {
        console.error('❌ SQL Error (addManualAttendance):', err);
        res.status(500).json({ message: 'Failed', error: err.message });
    }
};

exports.updateAttendance = async (req, res) => {
    const { id } = req.params;
    const { in_time, out_time, status } = req.body;
    try {
        // Safety: Verify admin ownership
        const [existing] = await db.execute('SELECT a.company_id FROM attendance a WHERE a.id = ?', [id]);
        if (existing.length > 0 && req.user.role !== 'MasterAdmin' && existing[0].company_id !== req.user.company_id) {
            return res.status(403).json({ message: 'Cannot update record from another company' });
        }

        const normalize = (dt) => {
            if (!dt) return null;
            return dt.replace('T', ' ').replace(/\.\d+Z$/, '').substring(0, 19);
        };
        const fIn = normalize(in_time);
        const fOut = normalize(out_time);

        let totalHours = 0;
        if (fIn && fOut) {
            const diff = new Date(fOut.replace(' ', 'T')) - new Date(fIn.replace(' ', 'T'));
            totalHours = Math.max(0, (diff / (1000 * 60 * 60))).toFixed(2);
        }

        const finalStatus = status ? status.toLowerCase() : 'present';
        const finalDate = fIn ? fIn.split(' ')[0] : null;

        const sql = 'UPDATE attendance SET in_time = ?, out_time = ?, status = ?, total_hours = ?, date = ? WHERE id = ?';
        const values = [fIn, fOut, finalStatus, totalHours, finalDate, id];

        console.log('📝 Executing SQL (Update Attendance):', sql, 'Params:', values);
        await db.execute(sql, values);
        res.json({ message: 'Updated' });
    } catch (err) {
        console.error('❌ SQL Error (updateAttendance):', err);
        res.status(500).json({ message: 'Failed', error: err.message });
    }
};

exports.bulkMarkAttendance = async (req, res) => {
    const { employeeIds, date, status, inTime, outTime } = req.body;
    try {
        const finalIn = inTime || '08:00';
        const fIn = `${date} ${finalIn}:00`;
        const fOut = outTime ? `${date} ${outTime}:00` : null;

        let totalHours = 0.00;
        if (fOut) {
            const diff = new Date(fOut.replace(' ', 'T')) - new Date(fIn.replace(' ', 'T'));
            totalHours = Math.max(0, (diff / (1000 * 60 * 60))).toFixed(2);
        }

        for (let empId of employeeIds) {
            // Safety: Verify admin ownership
            const [emp] = await db.execute('SELECT company_id FROM employees WHERE id = ?', [empId]);
            if (emp.length > 0 && req.user.role !== 'MasterAdmin' && emp[0].company_id !== req.user.company_id) continue;

            const [existing] = await db.execute('SELECT id FROM attendance WHERE employee_id = ? AND date = ?', [empId, date]);
            if (existing.length > 0) {
                await db.execute(
                    'UPDATE attendance SET status = ?, in_time = ?, out_time = ?, total_hours = ?, marked_by = ? WHERE id = ?',
                    [status, fIn, fOut, totalHours, req.user.id, existing[0].id]
                );
            } else {
                await db.execute(
                    'INSERT INTO attendance (employee_id, date, status, in_time, out_time, total_hours, marked_by, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [empId, date, status, fIn, fOut, totalHours, req.user.id, req.user.company_id]
                );
            }
        }
        res.json({ message: 'Bulk updated' });
    } catch (err) {
        res.status(500).json({ message: 'Failed', error: err.message });
    }
};

const moment = require('moment-timezone');

exports.getDashboardStats = async (req, res) => {
    try {
        const now = moment().tz("Asia/Kolkata");
        const localToday = now.format("YYYY-MM-DD");

        const today = req.query.date || localToday;
        const yesterday = moment(today).subtract(1, 'days').format('YYYY-MM-DD');
        
        // 0. Fetch Settings for Salary Cycle
        let settingsQuery = 'SELECT salary_cycle, salary_cycle_start_date FROM settings WHERE company_id = ?';
        let settingsParams = [req.user.company_id];
        if (req.user.role === 'MasterAdmin') {
            settingsQuery = 'SELECT salary_cycle, salary_cycle_start_date FROM settings WHERE id = 1';
            settingsParams = [];
        }
        const [settingsRows] = await db.execute(settingsQuery, settingsParams);
        const settings = settingsRows[0] || { salary_cycle: '15 Days Cycle', salary_cycle_start_date: 1 };
        const salaryCycle = settings.salary_cycle || '15 Days Cycle';
        const startDay = parseInt(settings.salary_cycle_start_date) || 1;

        let cycleStart, cycleEnd;
        let cycleStartDateMoment, cycleEndDateMoment;
        const lastDayOfMonth = now.clone().endOf('month').date();
        const currentDay = now.date();

        if (salaryCycle === '15 Days Cycle') {
            const start1 = startDay;
            const end1 = Math.min(start1 + 14, lastDayOfMonth);
            const start2 = end1 >= lastDayOfMonth ? 1 : end1 + 1;
            const end2 = start1 === 1 ? lastDayOfMonth : start1 - 1;

            if (currentDay >= start1 && currentDay <= end1) {
                cycleStart = start1;
                cycleEnd = end1;
                cycleStartDateMoment = now.clone().date(cycleStart);
                cycleEndDateMoment = now.clone().date(cycleEnd);
            } else {
                cycleStart = start2;
                cycleEnd = end2;
                if (cycleStart > cycleEnd) {
                    if (currentDay >= cycleStart) {
                        cycleStartDateMoment = now.clone().date(cycleStart);
                        cycleEndDateMoment = now.clone().add(1, 'month').date(cycleEnd);
                    } else {
                        cycleStartDateMoment = now.clone().subtract(1, 'month').date(cycleStart);
                        cycleEndDateMoment = now.clone().date(cycleEnd);
                    }
                } else {
                    cycleStartDateMoment = now.clone().date(cycleStart);
                    cycleEndDateMoment = now.clone().date(cycleEnd);
                }
            }
        } else if (salaryCycle.includes('Monthly')) {
            cycleStart = startDay;
            cycleEnd = startDay === 1 ? lastDayOfMonth : startDay - 1;
            
            if (cycleStart > cycleEnd) {
                if (currentDay >= cycleStart) {
                    cycleStartDateMoment = now.clone().date(cycleStart);
                    cycleEndDateMoment = now.clone().add(1, 'month').date(cycleEnd);
                } else {
                    cycleStartDateMoment = now.clone().subtract(1, 'month').date(cycleStart);
                    cycleEndDateMoment = now.clone().date(cycleEnd);
                }
            } else {
                cycleStartDateMoment = now.clone().date(cycleStart);
                cycleEndDateMoment = now.clone().date(cycleEnd);
            }
        } else if (salaryCycle === 'Weekly Payout') {
            cycleStartDateMoment = now.clone().startOf('week');
            cycleEndDateMoment = now.clone().endOf('week');
            cycleStart = cycleStartDateMoment.date();
            cycleEnd = cycleEndDateMoment.date();
        } else {
            cycleStart = 1;
            cycleEnd = lastDayOfMonth;
            cycleStartDateMoment = now.clone().date(1);
            cycleEndDateMoment = now.clone().date(lastDayOfMonth);
        }

        const cycleStartDate = cycleStartDateMoment.format('YYYY-MM-DD');

        // 1. Fetch All Active Employees
        let empQuery = 'SELECT id, name, department, photo, role, salary_rate, salary_type, joined_date FROM employees WHERE status = "active"';
        let empParams = [];
        if (req.user.role !== 'MasterAdmin') {
            empQuery += ' AND company_id = ?';
            empParams.push(req.user.company_id);
        }
        const [employees] = await db.execute(empQuery, empParams);

        // 2. Fetch Today's and Yesterday's Attendance
        let attQuery = `
            SELECT a.status, a.employee_id 
            FROM attendance a 
            JOIN employees e ON a.employee_id = e.id 
            WHERE a.date = ?
        `;
        let attParams = [today];
        if (req.user.role !== 'MasterAdmin') {
            attQuery += ' AND a.company_id = ?';
            attParams.push(req.user.company_id);
        }
        const [attendance] = await db.execute(attQuery, attParams);

        let attYestQuery = `
            SELECT a.status, a.employee_id 
            FROM attendance a 
            JOIN employees e ON a.employee_id = e.id 
            WHERE a.date = ?
        `;
        let attYestParams = [yesterday];
        if (req.user.role !== 'MasterAdmin') {
            attYestQuery += ' AND a.company_id = ?';
            attYestParams.push(req.user.company_id);
        }
        const [attendanceYesterday] = await db.execute(attYestQuery, attYestParams);

        // Identify Present and Absent IDs for Today
        const presentIds = attendance.filter(a =>
            ['present', 'late', 'half_day'].includes(a.status?.toLowerCase())
        ).map(a => a.employee_id);

        const absentStaff = employees.filter(e => !presentIds.includes(e.id));

        // Identify Present and Absent counts for Yesterday
        const presentYesterdayIds = attendanceYesterday.filter(a =>
            ['present', 'late', 'half_day'].includes(a.status?.toLowerCase())
        ).map(a => a.employee_id);

        const presentYesterdayCount = presentYesterdayIds.length;
        const absentYesterdayCount = employees.filter(e => !presentYesterdayIds.includes(e.id)).length;
        const lateYesterdayCount = attendanceYesterday.filter(a => a.status?.toLowerCase() === 'late').length;
        const totalStaffYesterdayCount = employees.filter(e => !e.joined_date || e.joined_date <= yesterday).length;

        // Calculate Trends (Today vs Yesterday)
        const calculateTrend = (todayVal, yesterdayVal) => {
            if (yesterdayVal === 0) {
                return todayVal > 0 ? { trend: 'up', value: '+100%' } : { trend: 'up', value: '0%' };
            }
            const diff = todayVal - yesterdayVal;
            const pct = Math.round((diff / yesterdayVal) * 100);
            return {
                trend: pct >= 0 ? 'up' : 'down',
                value: `${pct >= 0 ? '+' : '-'}${Math.abs(pct)}%`
            };
        };

        const totalStaffTrend = calculateTrend(employees.length, totalStaffYesterdayCount);
        const presentTodayCount = attendance.filter(a => a.status?.toLowerCase() === 'present' || a.status?.toLowerCase() === 'late').length;
        const presentTrend = calculateTrend(presentTodayCount, presentYesterdayCount);
        const absentTrend = calculateTrend(absentStaff.length, absentYesterdayCount);
        const lateTodayCount = attendance.filter(a => a.status?.toLowerCase() === 'late').length;
        const lateTrend = calculateTrend(lateTodayCount, lateYesterdayCount);

        // 3. Fetch Cycle Attendance for Payout Calculation
        let cycleAttQuery = `
            SELECT a.employee_id, COUNT(*) as days, SUM(a.total_hours) as hours 
            FROM attendance a 
            JOIN employees e ON a.employee_id = e.id 
            WHERE a.date BETWEEN ? AND ? 
            AND (a.status = 'present' OR a.status = 'late')
        `;
        let cycleParams = [cycleStartDate, today];
        if (req.user.role !== 'MasterAdmin') {
            cycleAttQuery += ' AND a.company_id = ?';
            cycleParams.push(req.user.company_id);
        }
        cycleAttQuery += ' GROUP BY a.employee_id';
        const [cycleAttendance] = await db.execute(cycleAttQuery, cycleParams);

        // 4. Calculate Estimated Payout
        let totalPayout = 0;
        cycleAttendance.forEach(att => {
            const emp = employees.find(e => e.id === att.employee_id);
            if (emp) {
                const rate = parseFloat(emp.salary_rate || 0);
                if (emp.salary_type === 'hourly') {
                    totalPayout += (parseFloat(att.hours) || 0) * rate;
                } else if (emp.salary_type === 'monthly') {
                    totalPayout += (parseInt(att.days) || 0) * (rate / 30);
                } else {
                    totalPayout += (parseInt(att.days) || 0) * rate;
                }
            }
        });

        // 4.5 Calculate Total Accumulated CPF (for Admin)
        let cpfQuery = 'SELECT SUM(COALESCE(cpf_employee, uif_amount)) as total_cpf FROM payroll';
        let cpfParams = [];
        if (req.user.role !== 'MasterAdmin') {
            cpfQuery += ' WHERE company_id = ?';
            cpfParams.push(req.user.company_id);
        }
        const [cpfResult] = await db.execute(cpfQuery, cpfParams);
        const totalCpfCollected = cpfResult[0].total_cpf || 0;

        // 5. Generate Trend Data (Dynamic Range)
        const range = parseInt(req.query.range) || 7;
        const startDate = now.clone().subtract(range - 1, 'days').format('YYYY-MM-DD');
        
        let trendQuery = `
            SELECT a.date, COUNT(*) as count 
            FROM attendance a 
            JOIN employees e ON a.employee_id = e.id 
            WHERE a.date BETWEEN ? AND ? AND (a.status = 'present' OR a.status = 'late')
        `;
        let trendParams = [startDate, today];
        if (req.user.role !== 'MasterAdmin') {
            trendQuery += ' AND a.company_id = ?';
            trendParams.push(req.user.company_id);
        }
        trendQuery += ' GROUP BY a.date';
        
        const [trendRows] = await db.execute(trendQuery, trendParams);
        
        const trendMap = {};
        trendRows.forEach(row => {
            const dateStr = moment(row.date).format('YYYY-MM-DD');
            trendMap[dateStr] = row.count;
        });

        const trendData = [];
        const nameFormat = range > 7 ? 'DD MMM' : 'ddd';
        for (let i = range - 1; i >= 0; i--) {
            const dateObj = now.clone().subtract(i, 'days');
            const dStr = dateObj.format('YYYY-MM-DD');
            const presentCount = trendMap[dStr] || 0;
            
            const staffCount = employees.filter(e => !e.joined_date || e.joined_date <= dStr).length;
            
            trendData.push({
                name: dateObj.format(nameFormat),
                present: presentCount,
                absent: Math.max(0, staffCount - presentCount)
            });
        }

        res.json({
            totalStaff: employees.length,
            totalStaffTrend,
            presentToday: presentTodayCount,
            presentTrend,
            absentToday: absentStaff.length,
            absentTrend,
            lateToday: lateTodayCount,
            lateTrend,
            absentStaff: absentStaff, // Full list for the UI
            trend: trendData,
            totalCpfCollected: totalCpfCollected,
            salaryCycle: {
                progress: Math.min(Math.round(((now.diff(cycleStartDateMoment, 'days') + 1) / (cycleEndDateMoment.diff(cycleStartDateMoment, 'days') + 1)) * 100), 100),
                day: now.diff(cycleStartDateMoment, 'days') + 1,
                totalDays: cycleEndDateMoment.diff(cycleStartDateMoment, 'days') + 1,
                estimatedPayout: totalPayout
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Stats error', error: err.message });
    }
};

exports.getPublicHolidays = async (req, res) => {
    try { const [rows] = await db.execute('SELECT * FROM public_holidays ORDER BY holiday_date ASC'); res.json(rows); }
    catch (err) { res.status(500).json({ message: 'Error', error: err.message }); }
};

exports.addPublicHoliday = async (req, res) => {
    const { name, date } = req.body;
    if (!name || !date) return res.status(400).json({ message: 'Name and date are required' });
    try {
        await db.execute('INSERT INTO public_holidays (holiday_name, holiday_date) VALUES (?, ?)', [name, date]);
        res.json({ message: 'Holiday added' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to add holiday', error: err.message });
    }
};

exports.deletePublicHoliday = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM public_holidays WHERE id = ?', [id]);
        res.json({ message: 'Holiday deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete holiday', error: err.message });
    }
};

const logAudit = async (adminId, action, targetId, details) => {
    try { await db.execute('INSERT INTO audit_logs (admin_id, action, target_id, details) VALUES (?, ?, ?, ?)', [adminId, action, targetId, JSON.stringify(details)]); }
    catch (err) { console.error('Audit failed:', err); }
};

exports.resetAttendance = async (req, res) => {
    try {
        if (req.user.role === 'MasterAdmin') {
            await db.execute('TRUNCATE TABLE attendance');
        } else {
            await db.execute('DELETE FROM attendance WHERE company_id = ?', [req.user.company_id]);
        }
        res.json({ message: 'All attendance records have been reset successfully for testing.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to reset attendance', error: err.message });
    }
};

exports.deleteAttendance = async (req, res) => {
    const { id } = req.params;
    try {
        if (req.user.role !== 'MasterAdmin') {
            const [existing] = await db.execute('SELECT company_id FROM attendance WHERE id = ?', [id]);
            if (existing.length > 0 && existing[0].company_id !== req.user.company_id) {
                return res.status(403).json({ message: 'Cannot delete attendance from another company' });
            }
        }
        await db.execute('DELETE FROM attendance WHERE id = ?', [id]);
        res.json({ message: 'Attendance record deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete attendance', error: err.message });
    }
};
