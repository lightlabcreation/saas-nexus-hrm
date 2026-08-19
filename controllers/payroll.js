const db = require('../config/db');

// --- CPF Rate Helper ---
const CPF_OW_CEILING = 8000;

function getCpfRates(dateOfBirth) {
    if (!dateOfBirth) return null;
    const today = new Date();
    const dob = new Date(dateOfBirth);
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

    if (age <= 55) return { employee: 0.20, employer: 0.17, total: 0.37, age };
    if (age <= 60) return { employee: 0.18, employer: 0.16, total: 0.34, age };
    if (age <= 65) return { employee: 0.125, employer: 0.125, total: 0.25, age };
    if (age <= 70) return { employee: 0.075, employer: 0.09, total: 0.165, age };
    return { employee: 0.05, employer: 0.075, total: 0.125, age };
}

// Helper: treat 'admin', 'Master Admin', 'hr', and 'hr admin' as admin roles
const isAdmin = (role) => {
    if (!role) return false;
    const r = role.toLowerCase();
    return r === 'admin' || r === 'master admin' || r === 'hr' || r === 'hr admin';
};

exports.generatePayroll = async (req, res) => {
    let { employeeIds, cycleStart, cycleEnd, startDate, endDate } = req.body;
    
    // Normalize field names from frontend
    const start = cycleStart || startDate;
    const end = cycleEnd || endDate;

    try {
        if (!start || !end) return res.status(400).json({ message: 'Start and end dates are required' });

        // Fetch settings for rules (scoped to company with fallback)
        let settingsRows;
        if (req.user && req.user.company_id) {
            [settingsRows] = await db.execute(
                'SELECT * FROM settings WHERE company_id = ? OR (company_id IS NULL AND id = 1) ORDER BY company_id DESC LIMIT 1',
                [req.user.company_id]
            );
        } else {
            [settingsRows] = await db.execute('SELECT * FROM settings WHERE id = 1');
        }
        const settings = settingsRows[0] || { ot_multiplier: 1.5, late_deduction: 1 };

        // 1. If no specific employees provided, get all active employees for this admin
        if (!employeeIds || (Array.isArray(employeeIds) && employeeIds.length === 0)) {
            let allEmpSql = 'SELECT id FROM employees WHERE status = "active"';
            const allEmpParams = [];
            if (isAdmin(req.user.role) && req.user.role !== 'Master Admin') {
                allEmpSql += ' AND created_by = ?';
                allEmpParams.push(req.user.id);
            }
            console.log('📝 Executing SQL:', allEmpSql, 'Params:', allEmpParams);
            const [allEmp] = await db.execute(allEmpSql, allEmpParams);
            employeeIds = allEmp.map(e => e.id);
        }

        if (employeeIds.length === 0) return res.json({ message: 'No employees to process', results: [] });

        const results = [];
        for (const empId of employeeIds) {
            const empSql = 'SELECT created_by, salary_rate, salary_type, is_uif_registered, advance_balance, date_of_birth FROM employees WHERE id = ?';
            console.log('📝 Executing SQL:', empSql, 'Params:', [empId]);
            const [empCheck] = await db.execute(empSql, [empId]);
            
            if (empCheck.length === 0) continue;
            // Skip if regular admin and doesn't own this employee
            if (isAdmin(req.user.role) && req.user.role !== 'Master Admin' && empCheck[0].created_by !== req.user.id) continue;
            
            const employee = empCheck[0];
            const attSql = 'SELECT status, total_hours FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?';
            const attParams = [empId, start, end];
            console.log('📝 Executing SQL:', attSql, 'Params:', attParams);
            const [attendance] = await db.execute(attSql, attParams);

            let totalHours = 0;
            let presentDays = 0;
            let overtimeHours = 0;
            let lateCount = 0;

            attendance.forEach(a => {
                const h = parseFloat(a.total_hours || 0);
                totalHours += h;
                if (a.status === 'present' || a.status === 'late' || a.status === 'half_day') {
                    presentDays++;
                    // Assume 9 hours is standard shift. Anything above is OT.
                    if (h > 9) overtimeHours += (h - 9);
                    if (a.status === 'late') lateCount++;
                }
            });

            const rate = parseFloat(employee.salary_rate || 0);
            let baseEarnings = 0;
            
            if (employee.salary_type === 'hourly') {
                // Base hours (total - overtime) + Overtime hours at multiplier
                const normalHours = totalHours - overtimeHours;
                const otMultiplier = parseFloat(settings.ot_multiplier) || 1.5;
                baseEarnings = (normalHours * rate) + (overtimeHours * rate * otMultiplier);
            } else if (employee.salary_type === 'daily') {
                baseEarnings = presentDays * rate;
                // For daily, maybe OT is still hourly? Let's add it on top if any.
                const otMultiplier = parseFloat(settings.ot_multiplier) || 1.5;
                baseEarnings += (overtimeHours * (rate / 9) * otMultiplier);
            }

            // Deductions logic
            let deductions = 0;
            if (settings.late_deduction && lateCount > 0) {
                const deductionRate = parseFloat(settings.late_deduction_amount || 0);
                deductions = lateCount * deductionRate; 
            }

            const grossEarnings = Math.max(0, baseEarnings);
            // CPF calculation (replaces flat 1% UIF)
            const cpfRates = getCpfRates(employee.date_of_birth);
            let cpfEmployee = 0, cpfEmployer = 0, cpfTotal = 0;
            if (cpfRates && grossEarnings > 750) {
                const cpfBase = Math.min(grossEarnings, CPF_OW_CEILING);
                cpfEmployee = Math.round(cpfBase * cpfRates.employee * 100) / 100;
                cpfEmployer = Math.round(cpfBase * cpfRates.employer * 100) / 100;
                cpfTotal = Math.round(cpfBase * cpfRates.total * 100) / 100;
            }
            const advance = parseFloat(employee.advance_balance || 0);
            const netSalary = Math.max(0, grossEarnings - cpfEmployee - advance - deductions);
            // Delete any existing pending payroll for this employee (prevents duplicates)
            await db.execute('DELETE FROM payroll WHERE employee_id = ? AND status = "pending"', [empId]);

            // Insert fresh payroll record
            const insSql = 'INSERT INTO payroll (employee_id, cycle_start, cycle_end, total_hours, gross_earnings, base_salary, deductions, uif_amount, cpf_employee, cpf_employer, cpf_total, advance_deduction, overtime, net_salary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "pending")';
            const insParams = [empId, start, end, totalHours, grossEarnings, rate, deductions, cpfEmployee, cpfEmployee, cpfEmployer, cpfTotal, advance, (overtimeHours * rate * (parseFloat(settings.ot_multiplier) || 1.5)), netSalary];
            await db.execute(insSql, insParams);
            results.push({ empId, action: 'created' });
        }
        res.json({ message: 'Payroll generation complete', results });
    } catch (err) {
        console.error('❌ SQL Error (generatePayroll):', err);
        res.status(500).json({ message: 'Generation failed', error: err.message });
    }
};

exports.getPayrollHistory = async (req, res) => {
    try {
        let query = 'SELECT p.*, e.name, e.photo, e.salary_rate, e.salary_type FROM payroll p JOIN employees e ON p.employee_id = e.id';
        const params = [];

        if (req.user.role === 'employee') {
            query += ' WHERE p.employee_id = ?';
            params.push(req.user.employee_id);
        } else if (isAdmin(req.user.role) && req.user.role !== 'Master Admin') {
            query += ' WHERE e.created_by = ?';
            params.push(req.user.id);
        }

        query += ' ORDER BY p.cycle_end DESC';
        console.log('📝 Executing SQL (getPayrollHistory):', query, 'Params:', params);
        const [rows] = await db.execute(query, params);

        const enhancedRows = await Promise.all(rows.map(async (p) => {
            const start = p.cycle_start || null;
            const end = p.cycle_end || null;
            
            let shifts = [];
            if (start && end) {
                const shiftSql = 'SELECT date, total_hours FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?';
                const shiftParams = [p.employee_id, start, end];
                console.log('📝 Executing SQL (Fetch Shifts):', shiftSql, 'Params:', shiftParams);
                const [shiftRows] = await db.execute(shiftSql, shiftParams);
                shifts = shiftRows;
            }

            return {
                ...p,
                shifts_data: shifts,
                totalEarnings: p.gross_earnings || 0,
                totalCPF: p.cpf_employee || p.uif_amount || 0,
                cpfEmployee: p.cpf_employee || 0,
                cpfEmployer: p.cpf_employer || 0,
                cpfTotal: p.cpf_total || 0,
                netSalary: p.net_salary || 0
            };
        }));

        res.json(enhancedRows);
    } catch (err) {
        console.error('❌ SQL Error (getPayrollHistory):', err);
        res.status(500).json({ message: 'Error fetching payroll', error: err.message });
    }
};

exports.getPayrollById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute(
            'SELECT p.*, e.name, e.photo, e.role, e.department, e.salary_rate, e.salary_type FROM payroll p JOIN employees e ON p.employee_id = e.id WHERE p.id = ?',
            [id]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
        
        const p = rows[0];
        const start = p.cycle_start || null;
        const end = p.cycle_end || null;
        let shifts = [];
        
        if (start && end) {
            const [shiftRows] = await db.execute(
                'SELECT date, total_hours, in_time, out_time, status FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?',
                [p.employee_id, start, end]
            );
            shifts = shiftRows;
        }
        
        res.json({ ...p, shifts_data: shifts });
    } catch (err) {
        res.status(500).json({ message: 'Error', error: err.message });
    }
};

exports.updatePayrollStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        if (status === 'paid') {
            const [rows] = await db.execute('SELECT employee_id, advance_deduction FROM payroll WHERE id = ?', [id]);
            if (rows.length > 0) {
                const p = rows[0];
                await db.execute('UPDATE employees SET advance_balance = advance_balance - ? WHERE id = ?', [p.advance_deduction || 0, p.employee_id]);
            }
        }
        await db.execute('UPDATE payroll SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ message: 'Update failed', error: err.message });
    }
};
