const db = require('../config/db');
const { generatePayslipPDF } = require('../utils/pdfGenerator');

/**
 * Flexible & Country-Independent Contribution Calculation Helper
 * Logic Priority:
 * 1. Employee custom percentage override (if provided and valid)
 * 2. Company default percentage (if company contribution enabled)
 * 3. 0% (if contribution not applicable or disabled)
 */
function calculateContributions(baseSalary, emp, settings) {
    const isCompanyEnabled = settings && (settings.contribution_enabled === 1 || settings.contribution_enabled === true || settings.contribution_enabled === '1');
    const hasEmpSetting = emp && emp.contribution_applicable !== undefined && emp.contribution_applicable !== null;
    const isEmpApplicable = hasEmpSetting && (emp.contribution_applicable === 1 || emp.contribution_applicable === true || emp.contribution_applicable === '1');

    // If employee explicitly disabled/opted-out, or (company disabled AND employee not explicitly enabled)
    if ((hasEmpSetting && !isEmpApplicable) || (!isCompanyEnabled && !isEmpApplicable)) {
        return {
            employeeContribution: 0,
            employerContribution: 0,
            totalContribution: 0,
            employeeRate: 0,
            employerRate: 0
        };
    }

    // Determine Employee Contribution Percentage
    let employeeRate = 0;
    if (emp && emp.employee_contribution_percentage !== null && emp.employee_contribution_percentage !== undefined && emp.employee_contribution_percentage !== '') {
        employeeRate = parseFloat(emp.employee_contribution_percentage) || 0;
    } else if (isCompanyEnabled) {
        employeeRate = parseFloat(settings?.default_employee_contribution_percentage || 0);
    }

    // Determine Employer Contribution Percentage
    let employerRate = 0;
    if (emp && emp.employer_contribution_percentage !== null && emp.employer_contribution_percentage !== undefined && emp.employer_contribution_percentage !== '') {
        employerRate = parseFloat(emp.employer_contribution_percentage) || 0;
    } else if (isCompanyEnabled) {
        employerRate = parseFloat(settings?.default_employer_contribution_percentage || 0);
    }

    const employeeContribution = Math.round(baseSalary * (employeeRate / 100) * 100) / 100;
    const employerContribution = Math.round(baseSalary * (employerRate / 100) * 100) / 100;
    const totalContribution = Math.round((employeeContribution + employerContribution) * 100) / 100;

    return {
        employeeContribution,
        employerContribution,
        totalContribution,
        employeeRate,
        employerRate
    };
}

exports.getPayroll = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        
        let query = `
            SELECT p.*, 
                   COALESCE(p.employee_contribution, p.cpf_employee, p.uif_amount, 0) as employee_contribution,
                   COALESCE(p.employer_contribution, p.cpf_employer, 0) as employer_contribution,
                   COALESCE(p.total_contribution, p.cpf_total, COALESCE(p.employee_contribution, p.cpf_employee, p.uif_amount, 0) + COALESCE(p.employer_contribution, p.cpf_employer, 0), 0) as total_contribution,
                   e.name, e.custom_id as custom_employee_id, e.photo, e.salary_rate
            FROM payroll p
            JOIN employees e ON p.employee_id = e.id
        `;
        let params = [];
        
        if (req.user.role !== 'MasterAdmin') {
            query += ' WHERE e.company_id = ? ';
            params.push(companyId);
        }

        if (req.user.role === 'employee') {
            query += ' AND e.id = ? ';
            params.push(req.user.employee_id);
        }

        query += ' ORDER BY p.id DESC';

        const [rows] = await db.execute(query, params);
        
        // Map db fields to UI expected fields
        const formatted = rows.map(r => ({
            ...r,
            employee_id: r.custom_employee_id || r.employee_id,
            // Backwards compatibility mappings for older frontend widgets
            cpf_employee: r.employee_contribution,
            cpf_employer: r.employer_contribution,
            cpf_total: r.total_contribution,
            uif_amount: r.employee_contribution
        }));
        res.json(formatted);
    } catch (err) {
        console.error('Error fetching payroll:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.generatePayroll = async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        const companyId = req.user.company_id;

        // Fetch settings for this specific company
        let [settingsRows] = await db.execute('SELECT * FROM settings WHERE company_id = ?', [companyId]);
        let settings = settingsRows[0];
        
        if (!settings) {
            // Fallback to default if no settings configured yet
            [settingsRows] = await db.execute('SELECT * FROM settings WHERE id = 1');
            settings = settingsRows[0] || {};
        }

        const lateDeductionAmount = parseFloat(settings.late_deduction_amount || 0);
        const isLateDeductionActive = settings.late_deduction === 1;

        // Fetch employees specifically for this company
        let empQuery = 'SELECT * FROM employees WHERE status = "active"';
        let empParams = [];
        if (req.user.role !== 'MasterAdmin') {
            empQuery += ' AND company_id = ?';
            empParams.push(companyId);
        }
        const [employees] = await db.execute(empQuery, empParams);

        let generated = 0;
        let skipped = 0;

        for (let emp of employees) {
            // Get attendance stats
            const [attRows] = await db.execute(`
                SELECT 
                    SUM(total_hours) as th,
                    COUNT(CASE WHEN status = 'late' THEN 1 END) as late_count
                FROM attendance 
                WHERE employee_id = ? AND date BETWEEN ? AND ?
            `, [emp.id, startDate, endDate]);

            const stats = attRows[0];
            const totalHours = parseFloat(stats.th || 0);
            let lateCount = stats.late_count || 0;

            if (lateCount > 0) {
                // Check if any of these 'late' days have an approved half_day leave
                const [halfDayLeaves] = await db.execute(`
                    SELECT COUNT(DISTINCT a.date) as protected_lates
                    FROM attendance a
                    JOIN leaves l ON l.employee_id = a.employee_id 
                                 AND a.date >= l.start_date 
                                 AND a.date <= l.end_date
                    WHERE a.employee_id = ? 
                      AND a.date BETWEEN ? AND ?
                      AND a.status = 'late'
                      AND l.status = 'Approved'
                      AND l.half_day = 1
                `, [emp.id, startDate, endDate]);
                
                const protectedLates = halfDayLeaves[0].protected_lates || 0;
                lateCount = Math.max(0, lateCount - protectedLates);
            }

            const salaryRate = parseFloat(emp.salary_rate || 0);
            
            // Calculate base salary
            let baseSalary = 0;
            if (emp.salary_type === 'hourly') {
                baseSalary = totalHours * salaryRate;
            } else if (emp.salary_type === 'monthly') {
                const [dayRows] = await db.execute(`
                    SELECT COUNT(*) as days FROM attendance 
                    WHERE employee_id = ? AND date BETWEEN ? AND ? AND status IN ('present', 'late')
                `, [emp.id, startDate, endDate]);
                baseSalary = (dayRows[0].days || 0) * (salaryRate / 30);
            } else {
                // Daily
                const [dayRows] = await db.execute(`
                    SELECT COUNT(*) as days FROM attendance 
                    WHERE employee_id = ? AND date BETWEEN ? AND ? AND status IN ('present', 'late')
                `, [emp.id, startDate, endDate]);
                baseSalary = (dayRows[0].days || 0) * salaryRate;
            }

            let deductions = 0;
            if (isLateDeductionActive && lateDeductionAmount > 0) {
                deductions = lateCount * lateDeductionAmount;
            }

            // Configurable Multi-Country Employee & Employer Contributions
            const { employeeContribution, employerContribution, totalContribution } = calculateContributions(baseSalary, emp, settings);
            
            // Employee contribution is a deduction from salary
            deductions += employeeContribution;

            let advanceDeduction = 0;
            const advanceBalance = parseFloat(emp.advance_balance || 0);
            const advanceInstallment = emp.advance_installment !== null ? parseFloat(emp.advance_installment) : null;
            
            let provisionalNet = baseSalary - deductions;

            if (advanceBalance > 0 && provisionalNet > 0) {
                // Deduct configured installment or default to 10% per cycle
                let maxPossible = Math.min(advanceBalance, provisionalNet);
                if (advanceInstallment !== null && advanceInstallment > 0) {
                    advanceDeduction = Math.min(advanceInstallment, maxPossible);
                } else {
                    const default10Percent = Math.max(1, Math.round(advanceBalance * 0.10 * 100) / 100);
                    advanceDeduction = Math.min(default10Percent, maxPossible);
                }
            }

            deductions += advanceDeduction;
            const netSalary = Math.max(0, baseSalary - deductions);

            // Check if a PAID record already exists for this cycle to prevent duplicate entry error
            const [paidCheck] = await db.execute(
                'SELECT id FROM payroll WHERE employee_id = ? AND cycle_start = ? AND cycle_end = ? AND status = "paid" AND company_id = ?',
                [emp.id, startDate, endDate, companyId]
            );

            if (paidCheck.length > 0) {
                // Skip this employee as they are already paid for this cycle
                skipped++;
                continue;
            }

            // Delete any existing PENDING payroll for this employee (prevents duplicates)
            await db.execute(
                'DELETE FROM payroll WHERE employee_id = ? AND cycle_start = ? AND cycle_end = ? AND status = "pending" AND company_id = ?',
                [emp.id, startDate, endDate, companyId]
            );

            const [insertResult] = await db.execute(`
                INSERT INTO payroll (
                    company_id, employee_id, cycle_start, cycle_end, 
                    total_hours, base_salary, deductions, 
                    employee_contribution, employer_contribution, total_contribution,
                    uif_amount, cpf_employee, cpf_employer, cpf_total,
                    advance_deduction, net_salary, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `, [
                companyId, emp.id, startDate, endDate, 
                totalHours, baseSalary, deductions, 
                employeeContribution, employerContribution, totalContribution,
                employeeContribution, employeeContribution, employerContribution, totalContribution,
                advanceDeduction, netSalary
            ]);
            
            const payrollId = insertResult.insertId;

            // Generate PDF Resiliently
            try {
                const payrollData = {
                    id: payrollId,
                    cycle_start: startDate,
                    cycle_end: endDate,
                    base_salary: baseSalary,
                    deductions: deductions,
                    employee_contribution: employeeContribution,
                    employer_contribution: employerContribution,
                    total_contribution: totalContribution,
                    cpf_employee: employeeContribution,
                    cpf_employer: employerContribution,
                    cpf_total: totalContribution,
                    uif_amount: employeeContribution,
                    advance_deduction: advanceDeduction,
                    net_salary: netSalary
                };
                
                const pdfPath = await generatePayslipPDF(payrollData, emp, settings);
                
                await db.execute('UPDATE payroll SET pdf_path = ? WHERE id = ?', [pdfPath, payrollId]);
            } catch (pdfError) {
                console.error(`Failed to generate PDF for employee ${emp.id}:`, pdfError);
            }

            generated++;
        }

        res.json({ 
            success: true, 
            message: `Payroll cycle generated successfully. ${generated} processed, ${skipped} already existed.`,
            generated,
            skipped
        });
    } catch (err) {
        console.error('Error generating payroll:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (status === 'paid') {
            const [payrollRows] = await db.execute('SELECT employee_id, advance_deduction, status FROM payroll WHERE id = ?', [id]);
            if (payrollRows.length > 0 && payrollRows[0].status !== 'paid') {
                const advanceDed = parseFloat(payrollRows[0].advance_deduction || 0);
                if (advanceDed > 0) {
                    await db.execute('UPDATE employees SET advance_balance = GREATEST(0, advance_balance - ?) WHERE id = ?', [advanceDed, payrollRows[0].employee_id]);
                }
            }
        }
        
        await db.execute('UPDATE payroll SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating payroll status:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.deletePayroll = async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await db.execute('SELECT company_id FROM payroll WHERE id = ?', [id]);
        if (existing.length === 0) return res.status(404).json({ error: 'Payroll record not found' });
        
        if (req.user.role !== 'MasterAdmin' && existing[0].company_id !== req.user.company_id) {
            return res.status(403).json({ error: 'Unauthorized to delete this record' });
        }

        await db.execute('DELETE FROM payroll WHERE id = ?', [id]);
        res.json({ success: true, message: 'Payroll record deleted' });
    } catch (err) {
        console.error('Error deleting payroll record:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.generateSinglePdf = async (req, res) => {
    try {
        const { id } = req.params;
        const [payrollRows] = await db.execute('SELECT * FROM payroll WHERE id = ?', [id]);
        if (payrollRows.length === 0) return res.status(404).json({ error: 'Payroll record not found' });
        
        const payrollData = {
            ...payrollRows[0],
            employee_contribution: payrollRows[0].employee_contribution || payrollRows[0].cpf_employee || payrollRows[0].uif_amount || 0,
            employer_contribution: payrollRows[0].employer_contribution || payrollRows[0].cpf_employer || 0,
            total_contribution: payrollRows[0].total_contribution || payrollRows[0].cpf_total || (parseFloat(payrollRows[0].employee_contribution || payrollRows[0].cpf_employee || 0) + parseFloat(payrollRows[0].employer_contribution || payrollRows[0].cpf_employer || 0))
        };

        if (req.user.role !== 'MasterAdmin' && req.user.company_id !== payrollData.company_id) {
            return res.status(403).json({ error: 'Unauthorized to access this record' });
        }
        if (req.user.role === 'employee' && req.user.employee_id !== payrollData.employee_id) {
            return res.status(403).json({ error: 'Unauthorized to access this record' });
        }

        const [empRows] = await db.execute('SELECT * FROM employees WHERE id = ?', [payrollData.employee_id]);
        if (empRows.length === 0) return res.status(404).json({ error: 'Employee not found' });
        
        const emp = empRows[0];
        let [settingsRows] = await db.execute('SELECT * FROM settings WHERE company_id = ?', [payrollData.company_id]);
        let settings = settingsRows[0];
        if (!settings) {
            [settingsRows] = await db.execute('SELECT * FROM settings WHERE id = 1');
            settings = settingsRows[0] || {};
        }

        const pdfPath = await generatePayslipPDF(payrollData, emp, settings);
        await db.execute('UPDATE payroll SET pdf_path = ? WHERE id = ?', [pdfPath, id]);

        res.json({ success: true, pdf_path: pdfPath });
    } catch (err) {
        console.error('Error generating single PDF:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.getLiveAccrual = async (req, res) => {
    try {
        const employeeId = req.user.employee_id;
        if (!employeeId) return res.status(400).json({ error: 'Employee ID missing' });

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${month}-01`;
        const endDate = `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`;

        // Get Employee Details
        const [empRows] = await db.execute('SELECT salary_rate, salary_type, advance_balance, date_of_birth, company_id, contribution_applicable, employee_contribution_percentage, employer_contribution_percentage FROM employees WHERE id = ?', [employeeId]);
        if (empRows.length === 0) return res.json({ liveEarnings: 0, startDate, endDate, totalHours: 0 });
        const emp = empRows[0];
        const salaryRate = parseFloat(emp.salary_rate || 0);

        let [settingsRows] = await db.execute('SELECT * FROM settings WHERE company_id = ?', [emp.company_id || req.user.company_id]);
        let settings = settingsRows[0] || {};

        // Get Attendance Stats
        const [attRows] = await db.execute(`
            SELECT SUM(total_hours) as th
            FROM attendance 
            WHERE employee_id = ? AND date BETWEEN ? AND ?
        `, [employeeId, startDate, endDate]);

        const totalHours = parseFloat(attRows[0].th || 0);
        let liveEarnings = 0;

        if (emp.salary_type === 'hourly') {
            liveEarnings = totalHours * salaryRate;
        } else {
            const [dayRows] = await db.execute(`
                SELECT COUNT(*) as days FROM attendance 
                WHERE employee_id = ? AND date BETWEEN ? AND ? AND status IN ('present', 'late')
            `, [employeeId, startDate, endDate]);
            liveEarnings = (dayRows[0].days || 0) * salaryRate;
        }

        // Configurable Contribution Calculation
        const { employeeContribution, employerContribution, totalContribution, employeeRate, employerRate } = calculateContributions(liveEarnings, emp, settings);
        const advanceDeduction = parseFloat(emp.advance_balance || 0);
        const netSalary = Math.max(0, liveEarnings - employeeContribution - advanceDeduction);

        res.json({
            startDate,
            endDate,
            grossEarnings: liveEarnings,
            totalHours,
            salaryRate,
            salaryType: emp.salary_type,
            employeeContribution,
            employerContribution,
            totalContribution,
            employeeRate,
            employerRate,
            // Backwards compatibility keys
            cpfEmployee: employeeContribution,
            cpfEmployer: employerContribution,
            cpfTotal: totalContribution,
            advanceDeduction,
            netSalary
        });
    } catch (err) {
        console.error('Error fetching live accrual:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.calculateContributions = calculateContributions;

