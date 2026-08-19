const db = require('../config/db');
const fs = require('fs');
const path = require('path');

// Helper to check user role permissions
function enforceRole(user, allowedRoles) {
    if (!user || !user.role) {
        throw new Error("UNAUTHORIZED_ACCESS: Authentication required.");
    }
    const role = user.role.toLowerCase();
    const hasRole = allowedRoles.some(r => role.includes(r.toLowerCase()));
    if (!hasRole) {
        throw new Error(`UNAUTHORIZED_ACCESS: Role '${user.role}' is not allowed to access this tool.`);
    }
}

// Helper to handle confirmation flow
function requireConfirmation(actionName, details, isConfirmed) {
    if (!isConfirmed) {
        return {
            status: "CONFIRMATION_REQUIRED",
            message: `ACTION_REQUIRED: Please ask the user to explicitly confirm that they want to proceed with: "${actionName}". Show them the details: ${JSON.stringify(details)}.`,
            details
        };
    }
    return null;
}

// ─── 1. EMPLOYEE TOOLS ───

async function getEmployeeProfile(user) {
    enforceRole(user, ['employee']);
    const [rows] = await db.execute(
        `SELECT e.name, e.custom_id, e.department, e.salary_rate, e.salary_type, e.status, e.joined_date, e.shift, e.assigned_branch, e.phone, e.email, e.advance_balance, c.owner_name as manager_name, c.company_name
         FROM employees e
         LEFT JOIN companies c ON e.company_id = c.id
         WHERE e.id = ? AND e.company_id = ?`,
        [user.employee_id, user.company_id]
    );
    return rows.length > 0 ? rows[0] : { error: "Profile not found." };
}

async function getEmployeeAttendance(user) {
    enforceRole(user, ['employee']);
    // Today
    const [todayRows] = await db.execute(
        `SELECT in_time, out_time, total_hours, status FROM attendance 
         WHERE employee_id = ? AND company_id = ? AND date = CURDATE()`,
        [user.employee_id, user.company_id]
    );
    // Month Summary
    const [monthRows] = await db.execute(
        `SELECT COUNT(*) as total_days,
                COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0) as present,
                COALESCE(SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END), 0) as absent,
                COALESCE(SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END), 0) as late,
                ROUND(COALESCE(SUM(total_hours), 0), 2) as total_hours
         FROM attendance 
         WHERE employee_id = ? AND company_id = ? 
         AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())`,
        [user.employee_id, user.company_id]
    );
    return {
        today: todayRows.length > 0 ? todayRows[0] : null,
        monthSummary: monthRows.length > 0 ? monthRows[0] : null
    };
}

async function getEmployeeSalary(user) {
    enforceRole(user, ['employee']);
    // Profile for rates
    const [empRows] = await db.execute(
        `SELECT salary_rate, salary_type, advance_balance FROM employees WHERE id = ? AND company_id = ?`,
        [user.employee_id, user.company_id]
    );
    if (empRows.length === 0) return { error: "Salary details not found." };
    const emp = empRows[0];
    const rate = parseFloat(emp.salary_rate || 0);

    // Calculate live accruals for current month
    const [attHours] = await db.execute(
        `SELECT COALESCE(SUM(total_hours), 0) as th, COUNT(CASE WHEN status IN ('present', 'late') THEN 1 END) as work_days 
         FROM attendance WHERE employee_id = ? AND company_id = ? 
         AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())`,
        [user.employee_id, user.company_id]
    );
    const totalHours = parseFloat(attHours[0].th || 0);
    const workDays = parseInt(attHours[0].work_days || 0);

    let liveEarnings = emp.salary_type === 'hourly' ? totalHours * rate : workDays * rate;
    const uif = liveEarnings * 0.01;
    const advance = parseFloat(emp.advance_balance || 0);
    const net = Math.max(0, liveEarnings - uif - advance);

    // Payroll history
    const [history] = await db.execute(
        `SELECT cycle_start, cycle_end, gross_earnings, deductions, net_salary, status 
         FROM payroll WHERE employee_id = ? AND company_id = ? ORDER BY cycle_end DESC LIMIT 3`,
        [user.employee_id, user.company_id]
    );

    return {
        calculation: {
            salaryRate: rate,
            salaryType: emp.salary_type,
            hoursWorkedThisMonth: totalHours,
            daysWorkedThisMonth: workDays,
            grossEarningsSoFar: liveEarnings,
            uifDeduction: uif,
            advanceDeduction: advance,
            netSalarySoFar: net
        },
        payrollHistory: history
    };
}

async function getEmployeeLeaves(user) {
    enforceRole(user, ['employee']);
    const [balances] = await db.execute(
        `SELECT annual, sick, unpaid, emergency FROM leave_balances WHERE employee_id = ? AND company_id = ?`,
        [user.employee_id, user.company_id]
    );
    const [history] = await db.execute(
        `SELECT leave_type, start_date, end_date, days, status, reason FROM leaves 
         WHERE employee_id = ? AND company_id = ? ORDER BY created_at DESC LIMIT 5`,
        [user.employee_id, user.company_id]
    );
    return {
        balances: balances.length > 0 ? balances[0] : null,
        history
    };
}

async function applyLeave(user, { leave_type, start_date, end_date, days, reason, isConfirmed }) {
    enforceRole(user, ['employee']);
    
    // Check parameters
    if (!leave_type || !start_date || !end_date || !days) {
        return { error: "Missing parameters. Required: leave_type, start_date, end_date, days" };
    }

    const actionDetails = { leave_type, start_date, end_date, days, reason };
    const confirmation = requireConfirmation("Apply Leave Request", actionDetails, isConfirmed);
    if (confirmation) return confirmation;

    // Fetch employee name
    const [emp] = await db.execute('SELECT name FROM employees WHERE id = ?', [user.employee_id]);
    const empName = emp.length > 0 ? emp[0].name : 'Employee';

    // Insert request
    await db.execute(
        `INSERT INTO leaves (company_id, employee_id, employee_name, leave_type, start_date, end_date, days, reason, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
        [user.company_id, user.employee_id, empName, leave_type, start_date, end_date, days, reason || '']
    );

    return { status: "SUCCESS", message: "Leave request applied successfully. Status is Pending." };
}

async function getEmployeeClaims(user) {
    enforceRole(user, ['employee']);
    const [claims] = await db.execute(
        `SELECT claim_type, amount, expense_date, status, description FROM claims 
         WHERE employee_id = ? AND company_id = ? ORDER BY created_at DESC LIMIT 5`,
        [user.employee_id, user.company_id]
    );
    return claims;
}

async function submitClaim(user, { claim_type, amount, expense_date, description, isConfirmed }) {
    enforceRole(user, ['employee']);

    if (!claim_type || !amount || !expense_date) {
        return { error: "Missing parameters. Required: claim_type, amount, expense_date" };
    }

    const actionDetails = { claim_type, amount, expense_date, description };
    const confirmation = requireConfirmation("Submit Expense Claim", actionDetails, isConfirmed);
    if (confirmation) return confirmation;

    const [emp] = await db.execute('SELECT name FROM employees WHERE id = ?', [user.employee_id]);
    const empName = emp.length > 0 ? emp[0].name : 'Employee';

    await db.execute(
        `INSERT INTO claims (company_id, employee_id, employee_name, claim_type, amount, expense_date, status, description) 
         VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`,
        [user.company_id, user.employee_id, empName, claim_type, amount, expense_date, description || '']
    );

    return { status: "SUCCESS", message: "Expense claim submitted successfully. Status is Pending." };
}

async function getEmployeeKPIs(user) {
    enforceRole(user, ['employee']);
    const [kpis] = await db.execute(
        `SELECT attendance_score, task_score, overall_score, rating, review_period 
         FROM kpis WHERE employee_id = ? AND company_id = ? ORDER BY updated_at DESC LIMIT 1`,
        [user.employee_id, user.company_id]
    );
    return kpis.length > 0 ? kpis[0] : { error: "KPI records not found." };
}

async function getBranchGeofence(user) {
    enforceRole(user, ['employee']);
    const [emp] = await db.execute('SELECT assigned_branch FROM employees WHERE id = ?', [user.employee_id]);
    if (emp.length === 0 || !emp[0].assigned_branch) return { error: "No branch assigned." };
    const [geo] = await db.execute(
        'SELECT name, address, latitude, longitude, radius FROM geofences WHERE company_id = ? AND name = ? AND status = "Active"',
        [user.company_id, emp[0].assigned_branch]
    );
    return geo.length > 0 ? geo[0] : { error: "Geofence config not found for assigned branch." };
}

async function getCompanyHolidays(user) {
    enforceRole(user, ['employee', 'admin']);
    const [holidays] = await db.execute(
        'SELECT holiday_name, holiday_date, description FROM public_holidays WHERE company_id = ? AND holiday_date >= CURDATE() ORDER BY holiday_date ASC LIMIT 5',
        [user.company_id]
    );
    return holidays;
}

// ─── 2. ADMIN TOOLS ───

async function getCompanyInfo(user) {
    enforceRole(user, ['admin', 'hr admin']);
    const [company] = await db.execute(
        'SELECT company_name, owner_name, email, phone, plan, status, subscription_end, employee_limit FROM companies WHERE id = ?',
        [user.company_id]
    );
    return company.length > 0 ? company[0] : { error: "Company not found." };
}

async function getEmployeeStats(user) {
    enforceRole(user, ['admin', 'hr admin']);
    const [stats] = await db.execute(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status='active' THEN 1 ELSE 0 END), 0) as active,
                COALESCE(SUM(CASE WHEN status='on_leave' THEN 1 ELSE 0 END), 0) as on_leave 
         FROM employees WHERE company_id = ?`,
        [user.company_id]
    );
    return stats[0];
}

async function searchEmployees(user, args) {
    enforceRole(user, ['admin', 'hr admin']);
    const query = args?.query || '';
    if (!query) {
        const [list] = await db.execute(
            `SELECT custom_id, name, department, status, email, phone, joined_date, role FROM employees 
             WHERE company_id = ? LIMIT 50`,
            [user.company_id]
        );
        return list;
    }
    const searchVal = `%${query}%`;
    const [list] = await db.execute(
        `SELECT custom_id, name, department, status, email, phone, joined_date, role FROM employees 
         WHERE company_id = ? AND (name LIKE ? OR custom_id LIKE ? OR department LIKE ?) LIMIT 20`,
        [user.company_id, searchVal, searchVal, searchVal]
    );
    return list;
}

async function checkSpecificEmployeeAttendance(user, args) {
    enforceRole(user, ['admin', 'hr admin']);
    const query = args?.employee_identifier;
    if (!query) return { error: "Missing parameter: employee_identifier" };

    const searchVal = `%${query}%`;
    const [emps] = await db.execute(
        `SELECT id, name, custom_id, department FROM employees WHERE company_id = ? AND (name LIKE ? OR custom_id LIKE ?) LIMIT 1`,
        [user.company_id, searchVal, searchVal]
    );

    if (emps.length === 0) return { error: `Employee not found matching: ${query}` };
    const emp = emps[0];

    const [att] = await db.execute(
        `SELECT in_time, out_time, total_hours, status FROM attendance WHERE employee_id = ? AND date = CURDATE() LIMIT 1`,
        [emp.id]
    );

    const [monthly] = await db.execute(
        `SELECT 
            COALESCE(SUM(CASE WHEN status='present' THEN 1 ELSE 0 END), 0) as present,
            COALESCE(SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END), 0) as absent,
            COALESCE(SUM(CASE WHEN status='late' THEN 1 ELSE 0 END), 0) as late,
            ROUND(COALESCE(SUM(total_hours), 0), 2) as total_hours
         FROM attendance WHERE employee_id = ? AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())`,
        [emp.id]
    );

    return {
        employee_name: emp.name,
        employee_id: emp.custom_id,
        today_attendance: att.length > 0 ? att[0] : null,
        monthly_stats: monthly.length > 0 ? monthly[0] : { present: 0, absent: 0, late: 0, total_hours: 0 }
    };
}

async function getTodayAttendanceSummary(user) {
    enforceRole(user, ['admin', 'hr admin']);
    
    // Fetch all active employees
    const [employees] = await db.execute(
        `SELECT id, name, custom_id FROM employees WHERE company_id = ? AND status = 'active'`,
        [user.company_id]
    );

    // Fetch today's logged attendance
    const [todayRecords] = await db.execute(
        `SELECT employee_id, status, in_time FROM attendance WHERE company_id = ? AND date = CURDATE()`,
        [user.company_id]
    );

    const recordMap = new Map();
    todayRecords.forEach(r => recordMap.set(r.employee_id, r));

    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    const lateAbsentList = [];

    employees.forEach(emp => {
        const att = recordMap.get(emp.id);
        const st = att ? (att.status || '').toLowerCase() : 'absent';
        
        if (st === 'present') {
            presentCount++;
        } else if (st === 'late') {
            presentCount++;
            lateCount++;
            lateAbsentList.push({ name: emp.name, status: 'Late', in_time: att.in_time });
        } else if (st === 'half_day') {
            presentCount++;
            lateAbsentList.push({ name: emp.name, status: 'Half Day', in_time: att.in_time });
        } else {
            absentCount++;
            lateAbsentList.push({ name: emp.name, status: 'Absent', in_time: null });
        }
    });

    return {
        stats: {
            total: employees.length,
            present: presentCount,
            absent: absentCount,
            late: lateCount
        },
        lateAbsentList
    };
}

async function getMonthlyAttendanceSummary(user) {
    enforceRole(user, ['admin', 'hr admin']);
    const [stats] = await db.execute(
        `SELECT COUNT(*) as total_records, COUNT(DISTINCT employee_id) as unique_employees, ROUND(COALESCE(SUM(total_hours), 0), 2) as total_hours
         FROM attendance WHERE company_id = ? AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())`,
        [user.company_id]
    );
    return stats[0];
}

async function getPayrollOverview(user) {
    enforceRole(user, ['admin', 'hr admin']);
    
    // 1. Current Month / Active Cycle Payroll
    const [currentCycle] = await db.execute(
        `SELECT COUNT(*) as total_records,
                COALESCE(SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END), 0) as paid_count,
                COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END), 0) as pending_count,
                ROUND(COALESCE(SUM(net_salary), 0), 2) as total_payout,
                MIN(cycle_start) as cycle_start,
                MAX(cycle_end) as cycle_end
         FROM payroll 
         WHERE company_id = ? AND MONTH(generated_at) = MONTH(CURDATE()) AND YEAR(generated_at) = YEAR(CURDATE())`,
        [user.company_id]
    );

    // 2. All-Time Historical Payroll
    const [allTime] = await db.execute(
        `SELECT COUNT(*) as total_records,
                COALESCE(SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END), 0) as paid_count,
                COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END), 0) as pending_count,
                ROUND(COALESCE(SUM(net_salary), 0), 2) as total_payout
         FROM payroll WHERE company_id = ?`,
        [user.company_id]
    );

    return {
        current: currentCycle[0],
        allTime: allTime[0]
    };
}

async function getPendingLeaves(user) {
    enforceRole(user, ['admin', 'hr admin']);
    const [leaves] = await db.execute(
        `SELECT l.id, COALESCE(e.name, l.employee_name) as employee_name, l.leave_type, l.start_date, l.end_date, l.days, l.reason 
         FROM leaves l 
         LEFT JOIN employees e ON l.employee_id = e.id 
         WHERE l.company_id = ? AND l.status = 'Pending' ORDER BY l.created_at DESC`,
        [user.company_id]
    );
    return leaves;
}

async function approveRejectLeave(user, { leave_id, action, isConfirmed }) {
    enforceRole(user, ['admin', 'hr admin']);
    if (!leave_id || !action) return { error: "Missing parameters: leave_id, action (approve/reject)" };
    
    const targetStatus = action.toLowerCase() === 'approve' ? 'Approved' : 'Rejected';
    const actionDetails = { leave_id, action: targetStatus };

    const confirmation = requireConfirmation(`${targetStatus} Leave Request`, actionDetails, isConfirmed);
    if (confirmation) return confirmation;

    await db.execute(
        'UPDATE leaves SET status = ? WHERE id = ? AND company_id = ?',
        [targetStatus, leave_id, user.company_id]
    );
    return { status: "SUCCESS", message: `Leave request ${leave_id} has been successfully ${targetStatus}.` };
}

async function getPendingClaims(user) {
    enforceRole(user, ['admin', 'hr admin']);
    const [claims] = await db.execute(
        `SELECT c.id, COALESCE(e.name, c.employee_name) as employee_name, c.claim_type, c.amount, c.expense_date, c.description 
         FROM claims c 
         LEFT JOIN employees e ON c.employee_id = e.id 
         WHERE c.company_id = ? AND c.status = 'Pending' ORDER BY c.created_at DESC`,
        [user.company_id]
    );
    return claims;
}

async function approveRejectClaim(user, { claim_id, action, isConfirmed }) {
    enforceRole(user, ['admin', 'hr admin']);
    if (!claim_id || !action) return { error: "Missing parameters: claim_id, action (approve/reject)" };

    const targetStatus = action.toLowerCase() === 'approve' ? 'Approved' : 'Rejected';
    const actionDetails = { claim_id, action: targetStatus };

    const confirmation = requireConfirmation(`${targetStatus} Expense Claim`, actionDetails, isConfirmed);
    if (confirmation) return confirmation;

    await db.execute(
        'UPDATE claims SET status = ? WHERE id = ? AND company_id = ?',
        [targetStatus, claim_id, user.company_id]
    );
    return { status: "SUCCESS", message: `Expense claim ${claim_id} has been successfully ${targetStatus}.` };
}

async function getKPIScores(user) {
    enforceRole(user, ['admin', 'hr admin']);
    const [kpis] = await db.execute(
        `SELECT COALESCE(e.name, k.employee_name) as employee_name, k.department, k.overall_score, k.rating 
         FROM kpis k 
         LEFT JOIN employees e ON k.employee_id = e.id 
         WHERE k.company_id = ? ORDER BY k.overall_score DESC LIMIT 15`,
        [user.company_id]
    );
    return kpis;
}

async function getGeofences(user) {
    enforceRole(user, ['admin', 'hr admin']);
    const [geofences] = await db.execute(
        'SELECT name, address, latitude, longitude, radius, status FROM geofences WHERE company_id = ?',
        [user.company_id]
    );
    return geofences;
}

async function getCompanySettings(user) {
    enforceRole(user, ['admin', 'hr admin']);
    const [settings] = await db.execute(
        `SELECT business_name, business_email, salary_cycle, standard_start_time, standard_end_time, currency, timezone 
         FROM settings WHERE company_id = ? LIMIT 1`,
        [user.company_id]
    );
    return settings.length > 0 ? settings[0] : { error: "Settings not found." };
}

// ─── 3. SUPERADMIN TOOLS ───

async function getSuperAdminStats(user) {
    enforceRole(user, ['superadmin', 'master']);
    const isMaster = user.role.toLowerCase().includes('master');
    const companyFilter = isMaster ? '' : `WHERE created_by = ${db.escape(user.id)}`;

    const [totalComps] = await db.execute(`SELECT COUNT(*) as total FROM companies ${companyFilter}`);
    const [activeComps] = await db.execute(`SELECT COUNT(*) as active FROM companies WHERE status = "active" ${isMaster ? '' : `AND created_by = ${db.escape(user.id)}`}`);
    const [revenue] = await db.execute(`SELECT COALESCE(SUM(s.amount), 0) as total FROM subscriptions s LEFT JOIN companies c ON s.company_id = c.id WHERE s.payment_status = "paid" ${isMaster ? '' : `AND c.created_by = ${db.escape(user.id)}`}`);
    const [activePlans] = await db.execute(`SELECT COUNT(*) as active FROM subscriptions s LEFT JOIN companies c ON s.company_id = c.id WHERE s.payment_status = "paid" AND s.end_date >= CURDATE() ${isMaster ? '' : `AND c.created_by = ${db.escape(user.id)}`}`);
    const [pendingRequests] = await db.execute(`SELECT COUNT(*) as pending FROM plan_requests pr LEFT JOIN companies c ON pr.company_id = c.id WHERE pr.status = 'pending' ${isMaster ? '' : `AND c.created_by = ${db.escape(user.id)}`}`);

    return {
        totalCompanies: totalComps[0].total || 0,
        activeCompanies: activeComps[0].active || 0,
        totalRevenue: revenue[0].total || 0,
        activeSubscriptions: activePlans[0].active || 0,
        pendingPlanRequests: pendingRequests[0].pending || 0
    };
}

async function getCompaniesList(user) {
    enforceRole(user, ['superadmin', 'master']);
    const isMaster = user.role.toLowerCase().includes('master');
    const [rows] = await db.execute(`
        SELECT c.id, c.company_name, c.owner_name, c.email, c.plan, c.status, c.created_at,
               (SELECT COUNT(*) FROM employees e WHERE e.company_id = c.id) as employee_count
        FROM companies c
        ${isMaster ? '' : `WHERE c.created_by = ${db.escape(user.id)}`}
        ORDER BY c.created_at DESC LIMIT 20
    `);
    return rows;
}

async function getPlanRequests(user) {
    enforceRole(user, ['superadmin', 'master']);
    const isMaster = user.role.toLowerCase().includes('master');
    const [rows] = await db.execute(`
        SELECT pr.id, pr.company_id, pr.requested_plan, pr.status, pr.created_at, c.company_name 
        FROM plan_requests pr
        LEFT JOIN companies c ON pr.company_id = c.id
        WHERE pr.status = 'pending'
        ${isMaster ? '' : `AND c.created_by = ${db.escape(user.id)}`}
        ORDER BY pr.created_at DESC
    `);
    return rows;
}

async function handlePlanRequest(user, { request_id, action, isConfirmed }) {
    enforceRole(user, ['superadmin', 'master']);
    if (!request_id || !action) return { error: "Missing parameters: request_id, action (accept/reject)" };

    const status = action.toLowerCase() === 'accept' ? 'approved' : 'rejected';
    const actionDetails = { request_id, action: status };

    const confirmation = requireConfirmation(`${status} Plan Upgrade Request`, actionDetails, isConfirmed);
    if (confirmation) return confirmation;

    const [reqs] = await db.execute('SELECT * FROM plan_requests WHERE id = ?', [request_id]);
    if (reqs.length === 0) return { error: 'Request not found' };
    const request = reqs[0];
    const { company_id, requested_plan } = request;

    if (status === 'approved') {
        const [planRows] = await db.execute('SELECT duration, price FROM plans WHERE name = ?', [requested_plan]);
        const planDuration = planRows.length > 0 ? planRows[0].duration : 'monthly';
        const amount = planRows.length > 0 ? planRows[0].price : 0;

        let daysToAdd = 30;
        if (planDuration === 'quarterly') daysToAdd = 90;
        if (planDuration === 'half-yearly') daysToAdd = 180;
        if (planDuration === 'annually') daysToAdd = 365;

        const startStr = new Date().toISOString().slice(0, 10);
        const endStr = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        await db.execute(
            'INSERT INTO subscriptions (company_id, plan_name, billing_cycle, amount, payment_status, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, \'paid\', ?, ?, NOW(), NOW())',
            [company_id, requested_plan, planDuration, amount || 0, startStr, endStr]
        );

        await db.execute(
            'UPDATE companies SET plan = ?, status = "active" WHERE id = ?',
            [requested_plan, company_id]
        );
    }

    await db.execute('UPDATE plan_requests SET status = ? WHERE id = ?', [status, request_id]);
    return { status: "SUCCESS", message: `Plan request ${request_id} has been successfully ${status}.` };
}

async function getPlansList(user) {
    enforceRole(user, ['superadmin', 'master']);
    const [rows] = await db.execute(`SELECT id, name, price, duration, description FROM plans ORDER BY price ASC`);
    if (rows.length === 0) {
        return [
            { name: "Basic Plan", price: 29, duration: "monthly", description: "Standard HRM for small teams" },
            { name: "Pro SaaS Plan", price: 99, duration: "monthly", description: "Advanced attendance & geofencing" },
            { name: "Enterprise Plan", price: 299, duration: "annually", description: "Unlimited employees & dedicated support" }
        ];
    }
    return rows;
}

// ─── 4. GENERAL POLICY (KNOWLEDGE BASE) ───

function getCompanyPolicies() {
    try {
        const filePath = path.join(__dirname, '../policies/company_policy.md');
        return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
        console.error("Failed to read policies handbook:", err.message);
        return "Company policies handbook is currently unavailable.";
    }
}

// Export tool functions mapping
module.exports = {
    getEmployeeProfile,
    getEmployeeAttendance,
    getEmployeeSalary,
    getEmployeeLeaves,
    applyLeave,
    getEmployeeClaims,
    submitClaim,
    getEmployeeKPIs,
    getBranchGeofence,
    getCompanyHolidays,
    getCompanyInfo,
    getEmployeeStats,
    searchEmployees,
    checkSpecificEmployeeAttendance,
    getTodayAttendanceSummary,
    getMonthlyAttendanceSummary,
    getPayrollOverview,
    getPendingLeaves,
    approveRejectLeave,
    getPendingClaims,
    approveRejectClaim,
    getKPIScores,
    getGeofences,
    getCompanySettings,
    getSuperAdminStats,
    getCompaniesList,
    getPlanRequests,
    handlePlanRequest,
    getPlansList,
    getCompanyPolicies
};
