const db = require('./config/db');
const chatbotController = require('./controllers/chatbot.controller');
const chatbotService = require('./controllers/chatbot.service');

async function runTests() {
    console.log("=== RUNNING CHATBOT COMPREHENSIVE REGRESSION & SPEED TESTS ===\n");
    let passed = 0;
    let failed = 0;

    const assert = (condition, msg) => {
        if (condition) {
            console.log(`✅ PASS: ${msg}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${msg}`);
            failed++;
        }
    };

    const formatLocalResponse = chatbotController.formatLocalResponse;

    console.log("--- 1. All 30 Tools Formatting & Anti-Hallucination Audit ---");

    // Employee Tools
    let t1 = formatLocalResponse('getEmployeeProfile', { name: "John Doe", department: "IT", status: "Active" }, {});
    assert(t1.includes("John Doe") && t1.includes("IT"), "getEmployeeProfile formats correctly");

    let t2 = formatLocalResponse('getEmployeeAttendance', { monthSummary: { present: null, absent: null, late: 0, total_hours: null } }, {});
    assert(t2.includes("Present:") && t2.includes("0 days") && t2.includes("0 hrs"), "getEmployeeAttendance converts null numeric to 0");

    let tCheckout1 = formatLocalResponse('getEmployeeAttendance', { today: { in_time: "09:00:00", out_time: "--", total_hours: 2.44 } }, { userMessage: "ami checked out today ?" });
    assert(tCheckout1.includes("No, you are currently clocked in") && tCheckout1.includes("09:00:00"), "getEmployeeAttendance smart check-out query answers directly");

    let tCheckout2 = formatLocalResponse('getEmployeeAttendance', { today: { in_time: "09:00:00", out_time: "17:30:00", total_hours: 8.5 } }, { userMessage: "am i checked out?" });
    assert(tCheckout2.includes("Yes, you have checked out today at **17:30:00**"), "getEmployeeAttendance smart checked-out positive answer");

    let t3 = formatLocalResponse('getEmployeeSalary', { calculation: { netSalarySoFar: 1500 } }, { currency: 'INR' });
    assert(t3.includes("1,500"), "getEmployeeSalary formats currency correctly");

    let t4 = formatLocalResponse('getEmployeeLeaves', { balances: null, history: [] }, {});
    assert(t4.includes("Leave Applications") && t4.includes("No recent leave applications found"), "getEmployeeLeaves handles empty state");

    let t5 = formatLocalResponse('getEmployeeClaims', [], {});
    assert(t5.includes("No expense claims found"), "getEmployeeClaims anti-hallucination empty state");

    let t6 = formatLocalResponse('getEmployeeKPIs', { overall_score: 95 }, {});
    assert(t6.includes("95%"), "getEmployeeKPIs formats percentage");

    let t7 = formatLocalResponse('getBranchGeofence', { name: "Headquarters", radius: 100 }, {});
    assert(t7.includes("Headquarters") && t7.includes("100 meters"), "getBranchGeofence formats branch name");

    let t8 = formatLocalResponse('getCompanyHolidays', [], {});
    assert(t8.includes("No upcoming holidays found"), "getCompanyHolidays anti-hallucination empty state");

    // Admin Tools
    let t9 = formatLocalResponse('getCompanyInfo', { company_name: "Acme Corp" }, {});
    assert(t9.includes("Acme Corp"), "getCompanyInfo formats company name");

    let t10 = formatLocalResponse('getEmployeeStats', { total: 50, active: 45, on_leave: 5 }, {});
    assert(t10.includes("Total Employees:") && t10.includes("50"), "getEmployeeStats formats employee counts");

    let t11 = formatLocalResponse('searchEmployees', [], {});
    assert(t11.includes("No matching employees found"), "searchEmployees anti-hallucination empty state");

    let t12 = formatLocalResponse('checkSpecificEmployeeAttendance', { employee_name: "Alice", today_attendance: { status: "present", in_time: "09:00:00" }, monthly_stats: { present: 20 } }, {});
    assert(t12.includes("Alice") && t12.includes("PRESENT"), "checkSpecificEmployeeAttendance formats correctly");

    let t13 = formatLocalResponse('checkSpecificEmployeeAttendance', { error: "Employee not found matching: Bob" }, {});
    assert(t13.includes("Employee not found matching: Bob"), "checkSpecificEmployeeAttendance error state");

    let t14 = formatLocalResponse('getTodayAttendanceSummary', { stats: { total: 20, present: 18, absent: 2 }, lateAbsentList: [] }, {});
    assert(t14.includes("Present:") && t14.includes("18") && t14.includes("None (All present)"), "getTodayAttendanceSummary formats correctly");

    let t15 = formatLocalResponse('getMonthlyAttendanceSummary', { total_records: 400, total_hours: 1600 }, {});
    assert(t15.includes("400") && t15.includes("1600 hrs"), "getMonthlyAttendanceSummary formats hours");

    let t16 = formatLocalResponse('getPayrollOverview', { current: { total_records: 0 }, allTime: { total_records: 4, total_payout: 50000 } }, { currency: 'USD' });
    assert(t16.includes("All-Time History:") && t16.includes("$50,000.00"), "getPayrollOverview handles null total_records gracefully");

    let t17 = formatLocalResponse('getPendingLeaves', [], {});
    assert(t17.includes("No pending leave requests found"), "getPendingLeaves anti-hallucination empty state");

    let t18 = formatLocalResponse('getPendingClaims', [], {});
    assert(t18.includes("No pending expense claims found"), "getPendingClaims anti-hallucination empty state");

    let t19 = formatLocalResponse('getKPIScores', [], {});
    assert(t19.includes("No KPI records found"), "getKPIScores anti-hallucination empty state");

    let t20 = formatLocalResponse('getGeofences', [], {});
    assert(t20.includes("No office geofences configured"), "getGeofences anti-hallucination empty state");

    let t21 = formatLocalResponse('getCompanySettings', { business_name: "Kiaan Tech" }, {});
    assert(t21.includes("Kiaan Tech"), "getCompanySettings formats business name");

    // SuperAdmin Tools
    let t22 = formatLocalResponse('getSuperAdminStats', { totalCompanies: 10, totalRevenue: 10000 }, { currency: 'USD' });
    assert(t22.includes("Total Companies:") && t22.includes("10") && t22.includes("$10,000.00"), "getSuperAdminStats formats stats");

    let t23 = formatLocalResponse('getCompaniesList', [], {});
    assert(t23.includes("No tenant companies found"), "getCompaniesList anti-hallucination empty state");

    let t24 = formatLocalResponse('getPlanRequests', [], {});
    assert(t24.includes("No pending plan requests"), "getPlanRequests anti-hallucination empty state");

    let t25 = formatLocalResponse('getPlansList', [], {});
    assert(t25.includes("No plans available"), "getPlansList anti-hallucination empty state");

    // Read-Only Action Tools
    let t26 = formatLocalResponse('applyLeave', {}, {});
    assert(t26.includes("Read-Only Mode"), "applyLeave returns Read-Only notice");

    let t27 = formatLocalResponse('unknownToolThatDoesNotExist', {}, {});
    assert(t27.includes("I found the requested information, but no detailed template was available."), "Unknown tool fallback message");

    console.log("\n--- 2. Role Security Isolation Audit ---");
    const serviceSource = require('fs').readFileSync('./controllers/chatbot.service.js', 'utf8');
    assert(serviceSource.includes("WHERE employee_id = ? AND company_id = ?"), "Employee isolation uses employee_id AND company_id");
    assert(serviceSource.match(/getEmployeeAttendance[\s\S]*?enforceRole\(user, \['employee'\]\)/), "Employee tools enforce 'employee' role");
    assert(serviceSource.match(/getCompanyInfo[\s\S]*?enforceRole\(user, \['admin', 'hr admin'\]\)/), "Admin tools enforce 'admin' role");
    assert(serviceSource.match(/getSuperAdminStats[\s\S]*?enforceRole\(user, \['superadmin'/), "SuperAdmin tools enforce 'superadmin' role");

    console.log("\n--- 3. Fast Path & Controller Registration Audit ---");
    const ctrlSource = require('fs').readFileSync('./controllers/chatbot.controller.js', 'utf8');
    assert(ctrlSource.includes("checkSpecificEmployeeAttendance: chatbotService.checkSpecificEmployeeAttendance"), "checkSpecificEmployeeAttendance registered in toolHandlers");
    assert(ctrlSource.includes("const isComplexQuery = /analyze|analysis|why|insight|explain|recommend|trend|reason/i.test(message);"), "Fast Path query classifier present");
    assert(ctrlSource.includes("formatLocalResponse(lastToolName, lastToolResult, companySettings)"), "Fast Path calls local response formatter for standard queries");

    console.log(`\n==========================================`);
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log(`==========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
