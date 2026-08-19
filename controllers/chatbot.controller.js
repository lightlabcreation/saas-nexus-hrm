const { GoogleGenAI } = require('@google/genai');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const NodeCache = require('node-cache');
const chatbotService = require('./chatbot.service');

// Initialize Cache - 5 minutes TTL
const aiCache = new NodeCache({ stdTTL: 300 });

// ─── Helper: Extract user from JWT ───
function extractUser(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return null;
        const token = authHeader.split(' ')[1];
        if (!token) return null;
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// Map Tool names to Service handler functions
const toolHandlers = {
    getEmployeeProfile: chatbotService.getEmployeeProfile,
    getEmployeeAttendance: chatbotService.getEmployeeAttendance,
    getEmployeeSalary: chatbotService.getEmployeeSalary,
    getEmployeeLeaves: chatbotService.getEmployeeLeaves,
    applyLeave: chatbotService.applyLeave,
    getEmployeeClaims: chatbotService.getEmployeeClaims,
    submitClaim: chatbotService.submitClaim,
    getEmployeeKPIs: chatbotService.getEmployeeKPIs,
    getBranchGeofence: chatbotService.getBranchGeofence,
    getCompanyHolidays: chatbotService.getCompanyHolidays,
    getCompanyInfo: chatbotService.getCompanyInfo,
    getEmployeeStats: chatbotService.getEmployeeStats,
    searchEmployees: chatbotService.searchEmployees,
    checkSpecificEmployeeAttendance: chatbotService.checkSpecificEmployeeAttendance,
    getTodayAttendanceSummary: chatbotService.getTodayAttendanceSummary,
    getMonthlyAttendanceSummary: chatbotService.getMonthlyAttendanceSummary,
    getPayrollOverview: chatbotService.getPayrollOverview,
    getPendingLeaves: chatbotService.getPendingLeaves,
    approveRejectLeave: chatbotService.approveRejectLeave,
    getPendingClaims: chatbotService.getPendingClaims,
    approveRejectClaim: chatbotService.approveRejectClaim,
    getKPIScores: chatbotService.getKPIScores,
    getGeofences: chatbotService.getGeofences,
    getCompanySettings: chatbotService.getCompanySettings,
    getSuperAdminStats: chatbotService.getSuperAdminStats,
    getCompaniesList: chatbotService.getCompaniesList,
    getPlanRequests: chatbotService.getPlanRequests,
    handlePlanRequest: chatbotService.handlePlanRequest,
    getPlansList: chatbotService.getPlansList
};

// ─── Gemini Tool / Function Declarations ───
const employeeTools = [
    { name: 'getEmployeeProfile', description: 'Get profile details for the logged-in employee', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getEmployeeAttendance', description: 'Get attendance status for the logged-in employee', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getEmployeeSalary', description: 'Get live current month salary accrual for the logged-in employee', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getEmployeeLeaves', description: 'Get leave balances and history for the logged-in employee', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'applyLeave', description: 'Submit leave request', parameters: { type: 'OBJECT', properties: { leave_type: { type: 'STRING' }, start_date: { type: 'STRING' }, end_date: { type: 'STRING' }, days: { type: 'NUMBER' }, reason: { type: 'STRING' }, isConfirmed: { type: 'BOOLEAN' } }, required: ['leave_type', 'start_date', 'end_date', 'days'] } },
    { name: 'getEmployeeClaims', description: 'Get expense claims history', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'submitClaim', description: 'Submit expense claim', parameters: { type: 'OBJECT', properties: { claim_type: { type: 'STRING' }, amount: { type: 'NUMBER' }, expense_date: { type: 'STRING' }, description: { type: 'STRING' }, isConfirmed: { type: 'BOOLEAN' } }, required: ['claim_type', 'amount', 'expense_date'] } },
    { name: 'getEmployeeKPIs', description: 'Get KPI scores', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getBranchGeofence', description: 'Get assigned geofence', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getCompanyHolidays', description: 'Get list of holidays', parameters: { type: 'OBJECT', properties: {} } }
];

const adminTools = [
    { name: 'getCompanyInfo', description: 'Get company basic details', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getEmployeeStats', description: 'Get employee counts', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'searchEmployees', description: 'Search employees or list all employees if no query is provided', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } } } },
    { name: 'checkSpecificEmployeeAttendance', description: 'Check if a specific employee is present today', parameters: { type: 'OBJECT', properties: { employee_identifier: { type: 'STRING', description: 'The name or ID of the employee to check' } }, required: ['employee_identifier'] } },
    { name: 'getTodayAttendanceSummary', description: 'Get today\'s present/absent/late counts', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getMonthlyAttendanceSummary', description: 'Get aggregated attendance records for current month', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getPayrollOverview', description: 'Get total payroll count', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getPendingLeaves', description: 'Get list of all pending leave requests', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'approveRejectLeave', description: 'Approve or Reject leave request', parameters: { type: 'OBJECT', properties: { leave_id: { type: 'NUMBER' }, action: { type: 'STRING' }, isConfirmed: { type: 'BOOLEAN' } }, required: ['leave_id', 'action'] } },
    { name: 'getPendingClaims', description: 'Get list of pending expense claims', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'approveRejectClaim', description: 'Approve or Reject claim request', parameters: { type: 'OBJECT', properties: { claim_id: { type: 'NUMBER' }, action: { type: 'STRING' }, isConfirmed: { type: 'BOOLEAN' } }, required: ['claim_id', 'action'] } },
    { name: 'getKPIScores', description: 'Get top employee KPI scores', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getGeofences', description: 'Get office geofences', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getCompanySettings', description: 'Get company settings', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getCompanyHolidays', description: 'Get upcoming company public holidays', parameters: { type: 'OBJECT', properties: {} } }
];

const superadminTools = [
    { name: 'getSuperAdminStats', description: 'Get platform-wide overview', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getCompaniesList', description: 'Get list of recently registered tenant companies', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'getPlanRequests', description: 'Get pending plan renewal requests', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'handlePlanRequest', description: 'Accept or Reject plan request', parameters: { type: 'OBJECT', properties: { request_id: { type: 'NUMBER' }, action: { type: 'STRING' }, isConfirmed: { type: 'BOOLEAN' } }, required: ['request_id', 'action'] } },
    { name: 'getPlansList', description: 'Get available subscription plans', parameters: { type: 'OBJECT', properties: {} } }
];

async function generateContentFast(ai, params) {
    const modelsToTry = [
        params.model,
        'gemini-2.5-flash',
        'gemini-1.5-flash',
        'gemini-2.0-flash'
    ].filter((m, i, arr) => m && arr.indexOf(m) === i);

    let lastError = null;
    for (const modelCandidate of modelsToTry) {
        try {
            const res = await ai.models.generateContent({
                ...params,
                model: modelCandidate
            });
            return res;
        } catch (err) {
            lastError = err;
            const errMsg = err.message || JSON.stringify(err);
            console.warn(`[Gemini API Warning] Model '${modelCandidate}' failed: ${errMsg.slice(0, 150)}. Trying next fallback model...`);
            if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
                await new Promise(r => setTimeout(r, 300));
                continue;
            } else {
                throw err;
            }
        }
    }
    throw lastError;
}

function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
    const num = amount ?? 0;
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(num);
    } catch(e) {
        return `${currency} ${num}`;
    }
}

// ─── LOCAL RESPONSE FORMATTER (ANTI-HALLUCINATION & INSTANT RENDERING) ───
function formatLocalResponse(toolName, result, context = {}) {
    if (!result) return "No records found for your request.";
    if (result.error) return `Error: ${result.error}`;
    if (result.status === 'CONFIRMATION_REQUIRED') return result.message;
    if (result.status === 'SUCCESS') return `Success: ${result.message}`;
    
    const currency = context.currency || 'USD';
    const locale = context.locale || 'en-US';
    const curr = (amt) => formatCurrency(amt, currency, locale);

    try {
        switch(toolName) {
            // -- Employee Tools --
            case 'getEmployeeProfile':
                const userMsgProf = (context.userMessage || '').toLowerCase();
                if (/\bid\b|custom\s*id|employee\s*id/i.test(userMsgProf)) {
                    return `Your Employee Custom ID is **${result.custom_id ?? 'N/A'}**.`;
                }
                if (/name|my name|who am i|tell my name/i.test(userMsgProf)) {
                    return `Your name is **${result.name ?? 'Not Available'}**.`;
                }
                if (/join|joined|when did i/i.test(userMsgProf)) {
                    return `You joined the company on **${result.joined_date ? String(result.joined_date).slice(0, 10) : 'N/A'}**.`;
                }
                if (/manager|owner|boss|head/i.test(userMsgProf)) {
                    return `Your manager / company admin is **${result.manager_name ?? 'Admin'}**.`;
                }
                if (/status/i.test(userMsgProf)) {
                    return `Your employment status is **${result.status ?? 'Active'}**.`;
                }

                const profLines = [
                    `**Employee Profile**`,
                    `- **Name:** ${result.name ?? 'Not Available'}`,
                    `- **Custom ID:** ${result.custom_id ?? 'N/A'}`
                ];
                if (result.department && result.department !== 'General' && result.department !== 'Not Available') {
                    profLines.push(`- **Department:** ${result.department}`);
                }
                if (result.assigned_branch && result.assigned_branch !== 'Not Available' && result.assigned_branch !== 'General') {
                    profLines.push(`- **Branch:** ${result.assigned_branch}`);
                }
                profLines.push(`- **Status:** ${result.status ?? 'Active'}`);
                profLines.push(`- **Joined Date:** ${result.joined_date ? String(result.joined_date).slice(0, 10) : 'N/A'}`);
                return profLines.join('\n');

            case 'getEmployeeAttendance':
                const userMsgAtt = (context.userMessage || '').toLowerCase();
                const todayStatus = result.today?.status ? result.today.status.toUpperCase() : 'No clock-in record today';
                const todayIn = result.today?.in_time ?? '--';
                const todayOut = result.today?.out_time ?? '--';
                const m = result.monthSummary || {};

                if (/check(ed)?\s*out|out\s*time|checkout|gaya|nikla/i.test(userMsgAtt)) {
                    if (todayOut && todayOut !== '--') {
                        return `Yes, you have checked out today at **${todayOut}** (Clocked in: ${todayIn}, Total: ${result.today?.total_hours ?? 0} hrs).`;
                    } else if (todayIn && todayIn !== '--') {
                        return `No, you are currently clocked in (since **${todayIn}**), but you have NOT checked out yet today (Total hours logged so far: ${result.today?.total_hours ?? 0} hrs).`;
                    } else {
                        return `No, you have not clocked in or checked out today.`;
                    }
                }

                if (/check\s*in|in\s*time|checkin|aaya|clock\s*in|login\s*time/i.test(userMsgAtt)) {
                    if (todayIn && todayIn !== '--') {
                        return `You clocked in today at **${todayIn}** (Status: ${todayStatus}).`;
                    } else {
                        return `You have not clocked in today.`;
                    }
                }

                if (/today|aaj/i.test(userMsgAtt)) {
                    return `**Today's Attendance:**\n- **Status:** ${todayStatus}\n- **In Time:** ${todayIn} | **Out Time:** ${todayOut}`;
                }

                return `**Today's Attendance Status:**\n- **Status:** ${todayStatus}\n- **In Time:** ${todayIn} | **Out Time:** ${todayOut}\n\n**This Month's Summary:**\n- **Present:** ${m.present ?? 0} days\n- **Absent:** ${m.absent ?? 0} days\n- **Late:** ${m.late ?? 0} days\n- **Total Hours:** ${m.total_hours ?? 0} hrs`;

            case 'getEmployeeSalary':
                const userMsgSal = (context.userMessage || '').toLowerCase();
                const calc = result.calculation || {};
                const netSal = calc.netSalarySoFar ?? 0;
                const grossEar = calc.grossEarningsSoFar ?? 0;
                const advDed = calc.advanceDeduction ?? 0;
                const uifDed = calc.uifDeduction ?? 0;

                if (/net|kitna milega|hath me|hand|payout/i.test(userMsgSal)) {
                    return `Your net salary accrued so far this month is **${curr(netSal)}** (after deductions).`;
                }

                return `**Salary Accrual (Current Month):**\n- **Gross Earnings:** ${curr(grossEar)}\n- **Advance Deductions:** ${curr(advDed)}\n- **CPF Employee Deduction:** ${curr(uifDed)}\n- **Net Salary So Far:** ${curr(netSal)}`;

            case 'getEmployeeLeaves':
                const userMsgLeave = (context.userMessage || '').toLowerCase();
                const bal = result.balances;
                const hist = Array.isArray(result.history) ? result.history : [];

                if (/chutti\s*m[aa]*r|chutti\s*le|take\s*leave|apply|chutti\s*apply|aaj\s*chutti|leave\s*today/i.test(userMsgLeave)) {
                    return `Aap portal me **Leave Request** apply kar sakte hain! Dashboard me jaakar Leave Request submit kar dijiye (Annual, Sick, Emergency, ya Unpaid select karke). Submit hone ke baad aapka Admin/Manager use review karke approve kar dega.`;
                }

                if (/balance|remaining|left|kitni chutti|kitna leave|available/i.test(userMsgLeave)) {
                    if (bal && (bal.annual != null || bal.sick != null)) {
                        return `**Your Current Leave Balances:**\n- **Annual:** ${bal.annual ?? 0} days\n- **Sick:** ${bal.sick ?? 0} days\n- **Emergency:** ${bal.emergency ?? 0} days\n- **Unpaid:** ${bal.unpaid ?? 0} days`;
                    } else {
                        return `Aapki company me leaves direct application & Admin approval model par chalti hain. Aap Portal par jaakar kisbhi tarah ki chutti apply kar sakte hain, jise Admin approve karega.`;
                    }
                }

                const histStr = hist.length === 0 ? "No recent leave applications found." : hist.map(h => `- ${h.leave_type}: ${h.days ?? 0} days (${h.status ?? 'N/A'})`).join('\n');

                if (bal && (bal.annual != null || bal.sick != null)) {
                    return `**Leave Balance:**\n- **Annual:** ${bal.annual ?? 0} days\n- **Sick:** ${bal.sick ?? 0} days\n- **Emergency:** ${bal.emergency ?? 0} days\n- **Unpaid:** ${bal.unpaid ?? 0} days\n\n**Recent Leave Applications:**\n${histStr}`;
                } else {
                    return `**Leave Applications & History:**\nAap Portal se kisi bhi time leave apply kar sakte hain (Admin approval ke sath).\n\n**Recent Leave Applications:**\n${histStr}`;
                }

            case 'getEmployeeClaims':
                const claims = Array.isArray(result) ? result : [];
                if (claims.length === 0) return "**Expense Claims:** No expense claims found.";
                return `**Expense Claims:**\n` + claims.map(c => `- **${c.claim_type}**: ${curr(c.amount)} on ${c.expense_date ? String(c.expense_date).slice(0, 10) : 'N/A'} [Status: ${c.status}]`).join('\n');

            case 'getEmployeeKPIs':
                return `**KPI Scores:**\n- **Overall Score:** ${result.overall_score ?? 0}%\n- **Attendance Score:** ${result.attendance_score ?? 0}%\n- **Task Performance:** ${result.task_score ?? 0}%\n- **Rating:** ${result.rating ?? 'Not Available'}`;

            case 'getBranchGeofence':
                return `**Assigned Office Geofence:**\n- **Branch Name:** ${result.name ?? 'Not Assigned'}\n- **Address:** ${result.address ?? 'Not Available'}\n- **Radius:** ${result.radius ?? 0} meters`;

            case 'getCompanyHolidays':
                const hols = Array.isArray(result) ? result : [];
                if (hols.length === 0) return "**Company Holidays:** No upcoming holidays found.";
                return `**Upcoming Company Holidays:**\n` + hols.map(h => `- **${h.holiday_name}**: ${h.holiday_date ? String(h.holiday_date).slice(0, 10) : 'N/A'}`).join('\n');
                
            // -- Admin Tools --
            case 'getCompanyInfo':
                return `**Company Information:**\n- **Company Name:** ${result.company_name ?? 'Not Available'}\n- **Owner:** ${result.owner_name ?? 'Not Available'}\n- **Plan:** ${result.plan ?? 'Not Available'}\n- **Status:** ${result.status ?? 'Active'}\n- **Employee Limit:** ${result.employee_limit ?? 'Unlimited'}`;

            case 'getEmployeeStats':
                const userMsgStats = (context.userMessage || '').toLowerCase();
                if (/active\s*employee|how many active/i.test(userMsgStats)) {
                    return `There are **${result.active ?? 0}** active employees in your company (out of ${result.total ?? 0} total).`;
                }
                if (/inactive|on\s*leave/i.test(userMsgStats)) {
                    return `There are **${result.on_leave ?? 0}** employees currently on leave / inactive.`;
                }
                if (/how many employee|total employee|count/i.test(userMsgStats)) {
                    return `Your company currently has **${result.total ?? 0}** total employees (${result.active ?? 0} active, ${result.on_leave ?? 0} on leave).`;
                }
                return `**Company Employee Statistics:**\n- **Total Employees:** ${result.total ?? 0}\n- **Active Employees:** ${result.active ?? 0}\n- **On Leave:** ${result.on_leave ?? 0}`;

            case 'searchEmployees':
                const userMsgSearch = (context.userMessage || '').toLowerCase();
                const emps = Array.isArray(result) ? result : [];
                if (emps.length === 0) return "**Search Results:** No matching employees found.";
                
                if (/join|joined|when did/i.test(userMsgSearch)) {
                    return `` + emps.map(e => `**${e.name}** joined on **${e.joined_date ? String(e.joined_date).slice(0, 10) : 'N/A'}**`).join('\n');
                }

                return `**Employee Search Results:**\n` + emps.map(e => {
                    const deptStr = (e.department && e.department !== 'General' && e.department !== 'Not Available') ? ` - Dept: ${e.department}` : '';
                    return `- **${e.name}** (ID: ${e.custom_id ?? 'N/A'})${deptStr} [Status: ${e.status ?? 'Active'}]`;
                }).join('\n');

            case 'checkSpecificEmployeeAttendance':
                if (result.error) return `Notice: ${result.error}`;
                const userMsgEmpAtt = (context.userMessage || '').toLowerCase();
                const empName = result.employee_name || 'Employee';
                const todayAtt = result.today_attendance;
                const mStats = result.monthly_stats || {};
                const statusStr = todayAtt?.status ? todayAtt.status.toUpperCase() : 'ABSENT / NOT CLOCKED IN';
                const inT = todayAtt?.in_time ?? '--';
                const outT = todayAtt?.out_time ?? '--';

                if (/check(ed)?\s*out|out\s*time|checkout|gaya|nikla/i.test(userMsgEmpAtt)) {
                    if (outT && outT !== '--') {
                        return `Yes, **${empName}** checked out today at **${outT}**.`;
                    } else if (inT && inT !== '--') {
                        return `No, **${empName}** is clocked in (since **${inT}**), but has NOT checked out yet today.`;
                    } else {
                        return `**${empName}** has not clocked in or checked out today.`;
                    }
                }

                if (/present|check(ed)?\s*in|in\s*time|checkin|aaya|present today/i.test(userMsgEmpAtt) && !/absent|late|monthly/i.test(userMsgEmpAtt)) {
                    if (todayAtt && (todayAtt.status === 'present' || todayAtt.status === 'late' || todayAtt.status === 'half_day')) {
                        return `Yes, **${empName}** is present today (Clocked in at **${inT}**, Status: ${todayAtt.status.toUpperCase()}).`;
                    } else {
                        return `No, **${empName}** is absent / has not clocked in today.`;
                    }
                }

                if (/absent/i.test(userMsgEmpAtt) && !/monthly|summary/i.test(userMsgEmpAtt)) {
                    if (/how many|days|count/i.test(userMsgEmpAtt)) {
                        return `**${empName}** has been absent for **${mStats.absent ?? 0}** days this month.`;
                    }
                    if (todayAtt && todayAtt.status === 'present') {
                        return `No, **${empName}** is present today (Clocked in at **${inT}**).`;
                    } else {
                        return `Yes, **${empName}** is absent / has not clocked in today.`;
                    }
                }

                if (/late/i.test(userMsgEmpAtt) && !/monthly|summary/i.test(userMsgEmpAtt)) {
                    return `**${empName}** has **${mStats.late ?? 0}** late check-ins this month (Today's status: ${statusStr}).`;
                }

                if (/monthly|month|history|summary/i.test(userMsgEmpAtt)) {
                    return `**Monthly Attendance for ${empName}:**\n- **Present:** ${mStats.present ?? 0} days\n- **Absent:** ${mStats.absent ?? 0} days\n- **Late:** ${mStats.late ?? 0} days\n- **Total Hours:** ${mStats.total_hours ?? 0} hrs`;
                }

                return `**Attendance Status for ${empName}:**\n- **Today's Status:** ${statusStr}\n- **Clock In:** ${inT} | **Clock Out:** ${outT}\n- **Monthly Present:** ${mStats.present ?? 0} days | **Absent:** ${mStats.absent ?? 0} days | **Late:** ${mStats.late ?? 0} days`;

            case 'getTodayAttendanceSummary':
                const userMsgSum = (context.userMessage || '').toLowerCase();
                const st = result.stats || {};
                const list = Array.isArray(result.lateAbsentList) ? result.lateAbsentList : [];
                const listStr = list.length === 0 ? "None (All present)" : list.map(e => `${e.name} (${e.status || 'Absent'})`).join(', ');

                if (/who is absent|who came late|late coming|who is late/i.test(userMsgSum)) {
                    return `**Late / Absent Employees Today:** ${listStr}`;
                }
                if (/how many present|present count|present today/i.test(userMsgSum)) {
                    return `**${st.present ?? 0}** employees are present today (out of ${st.total ?? 0} total).`;
                }
                if (/how many absent|absent count/i.test(userMsgSum)) {
                    return `**${st.absent ?? 0}** employees are absent today.`;
                }

                return `**Today's Attendance Overview:**\n- **Total Employees:** ${st.total ?? 0}\n- **Present:** ${st.present ?? 0}\n- **Absent:** ${st.absent ?? 0}\n- **Late:** ${st.late ?? 0}\n\n**Late/Absent Employee List:**\n${listStr}`;

            case 'getMonthlyAttendanceSummary':
                return `**Monthly Attendance Overview:**\n- **Total Attendance Records:** ${result.total_records ?? 0}\n- **Unique Employees Active:** ${result.unique_employees ?? 0}\n- **Total Hours Logged:** ${result.total_hours ?? 0} hrs`;

            case 'getPayrollOverview':
                const curP = result.current || {};
                const allP = result.allTime || {};
                const curTotal = curP.total_records ?? 0;
                
                if (curTotal > 0) {
                    const cycleStr = curP.cycle_start && curP.cycle_end ? `${String(curP.cycle_start).slice(0, 10)} to ${String(curP.cycle_end).slice(0, 10)}` : 'Current Month';
                    return `**Payroll Overview (${cycleStr}):**\n- **Total Net Payout:** ${curr(curP.total_payout ?? 0)}\n- **Paid Count:** ${curP.paid_count ?? 0}\n- **Pending Count:** ${curP.pending_count ?? 0}\n\n**All-Time History:** ${allP.total_records ?? 0} records (${curr(allP.total_payout ?? 0)} total payout).`;
                } else {
                    return `**Current Month Payroll Overview:**\n- **Total Net Payout:** ${curr(0)}\n- **Status:** No payroll generated for current month cycle yet.\n\n**All-Time History:** ${allP.total_records ?? 0} records (${curr(allP.total_payout ?? 0)} total historical payout, ${allP.paid_count ?? 0} paid, ${allP.pending_count ?? 0} pending).`;
                }

            case 'getPendingLeaves':
                const pleaves = Array.isArray(result) ? result : [];
                if (pleaves.length === 0) return "**Pending Leave Requests:** No pending leave requests found.";
                return `**Pending Leave Requests (${pleaves.length}):**\n` + pleaves.map(l => `- **ID ${l.id}**: **${l.employee_name}** | Type: ${l.leave_type} | Duration: ${l.days ?? 0} days (${l.start_date ? String(l.start_date).slice(0, 10) : ''} to ${l.end_date ? String(l.end_date).slice(0, 10) : ''}) [Reason: ${l.reason || 'None'}]`).join('\n');

            case 'getPendingClaims':
                const pclaims = Array.isArray(result) ? result : [];
                if (pclaims.length === 0) return "**Pending Expense Claims:** No pending expense claims found.";
                return `**Pending Expense Claims (${pclaims.length}):**\n` + pclaims.map(c => `- **ID ${c.id}**: **${c.employee_name}** | Type: ${c.claim_type} | Amount: ${curr(c.amount ?? 0)} (${c.expense_date ? String(c.expense_date).slice(0, 10) : ''}) [Desc: ${c.description || 'None'}]`).join('\n');

            case 'getKPIScores':
                const kpis = Array.isArray(result) ? result : [];
                if (kpis.length === 0) return "**Top KPI Scores:** No KPI records found.";
                return `**Top KPI Scores:**\n` + kpis.map(k => `- **${k.employee_name}** (${k.department ?? 'N/A'}): ${k.overall_score ?? 0}% [Rating: ${k.rating ?? 'N/A'}]`).join('\n');

            case 'getGeofences':
                const geos = Array.isArray(result) ? result : [];
                if (geos.length === 0) return "**Office Geofences:** No office geofences configured.";
                return `**Office Geofences:**\n` + geos.map(g => `- **${g.name}** (Radius: ${g.radius ?? 0}m) - Address: ${g.address ?? 'N/A'} [Status: ${g.status}]`).join('\n');

            case 'getCompanySettings':
                return `**Company Settings:**\n- **Business Name:** ${result.business_name ?? 'Not Available'}\n- **Business Email:** ${result.business_email ?? 'N/A'}\n- **Salary Cycle:** ${result.salary_cycle ?? 'Monthly'}\n- **Working Hours:** ${result.standard_start_time ?? '09:00'} to ${result.standard_end_time ?? '17:00'}\n- **Currency:** ${result.currency ?? 'USD'}\n- **Timezone:** ${result.timezone ?? 'UTC'}`;

            // -- Superadmin Tools --
            case 'getSuperAdminStats':
                return `**Platform Overview:**\n- **Total Companies:** ${result.totalCompanies ?? 0}\n- **Active Subscriptions:** ${result.activeSubscriptions ?? 0}\n- **Total Revenue:** ${curr(result.totalRevenue ?? 0)}\n- **Pending Plan Requests:** ${result.pendingPlanRequests ?? 0}`;

            case 'getCompaniesList':
                const userMsgComp = (context.userMessage || '').toLowerCase();
                const comps = Array.isArray(result) ? result : [];
                if (comps.length === 0) return "**Registered Companies:** No tenant companies found.";

                if (/name|naam|karmchari|list employee|who work/i.test(userMsgComp)) {
                    return `**Tenant Data Privacy Notice:** As a SuperAdmin, you oversee platform operations and tenant management. Individual employee names and internal confidential records of a tenant company are isolated to that company's own HR Admin to protect data privacy.\n\n**Company Employee Count:**\n` + comps.map(c => `- **${c.company_name}**: ${c.employee_count ?? 0} total employees`).join('\n');
                }

                if (/kitne|kine|how many|count|kitna/i.test(userMsgComp)) {
                    return `**Tenant Company Employee Counts:**\n` + comps.map(c => `- **${c.company_name}**: **${c.employee_count ?? 0}** total employees [Plan: ${c.plan ?? 'N/A'}, Status: ${c.status ?? 'Active'}]`).join('\n');
                }

                return `**Recent Registered Companies:**\n` + comps.map(c => `- **${c.company_name}** (${c.employee_count ?? 0} employees) | Plan: ${c.plan ?? 'N/A'} | Status: ${c.status ?? 'Active'}`).join('\n');

            case 'getPlanRequests':
                const reqs = Array.isArray(result) ? result : [];
                if (reqs.length === 0) return "**Pending Plan Requests:** No pending plan requests.";
                return `**Pending Plan Requests:**\n` + reqs.map(r => `- **ID ${r.id}**: Company: ${r.company_name} requested ${r.requested_plan}`).join('\n');

            case 'getPlansList':
                const plans = Array.isArray(result) ? result : [];
                if (plans.length === 0) return "**Subscription Plans:** No plans available.";
                return `**Available Subscription Plans:**\n` + plans.map(p => `- **${p.name}**: ${curr(p.price ?? 0)} / ${p.duration ?? 'monthly'}`).join('\n');

            case 'applyLeave':
            case 'submitClaim':
            case 'approveRejectLeave':
            case 'approveRejectClaim':
            case 'handlePlanRequest':
                return `ℹ️ **Read-Only Mode:** To perform actions (apply leaves, submit claims, approve/reject requests), please use the dedicated buttons in the HRM portal.`;

            default:
                console.warn(`[FormatLocalResponse] Tool '${toolName}' defaulted.`);
                return "I found the requested information, but no detailed template was available. Please try again.";
        }
    } catch (err) {
        console.error(`[FormatLocalResponse] Error formatting tool ${toolName}:`, err);
        return "Unable to format requested information at this time. Please try again.";
    }
}

// Export for unit tests
exports.formatLocalResponse = formatLocalResponse;

// ─── MAIN HANDLER ───
exports.handleMessage = async (req, res) => {
    const requestStartTime = Date.now();
    try {
        const { message, context, history } = req.body;
        
        if (!message || !context) {
            return res.status(400).json({ error: 'Message and context are required' });
        }

        const { userRole } = context;
        const normalizedRole = userRole ? userRole.toLowerCase() : 'guest';

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Gemini API key is missing.' });
        }

        const authUser = extractUser(req);
        
        // ── Fetch Company Context for Formatting ──
        let companySettings = { currency: 'USD', locale: 'en-US', userMessage: message };
        if (authUser && authUser.company_id) {
            try {
                const [settingsRows] = await db.execute('SELECT currency FROM settings WHERE company_id = ? LIMIT 1', [authUser.company_id]);
                if (settingsRows.length > 0 && settingsRows[0].currency) {
                    companySettings.currency = settingsRows[0].currency;
                    if (companySettings.currency === 'INR') companySettings.locale = 'en-IN';
                    if (companySettings.currency === 'EUR') companySettings.locale = 'en-GB';
                    if (companySettings.currency === 'SGD') companySettings.locale = 'en-SG';
                }
            } catch (err) {
                console.error("Failed to fetch company context", err.message);
            }
        }

        const isActionQuery = /apply|submit|approve|reject|confirm|yes|accept/i.test(message);
        const cacheKey = `${normalizedRole}_${authUser?.id || 'guest'}_${message.trim().toLowerCase()}`;
        
        if (!isActionQuery) {
            const cachedVal = aiCache.get(cacheKey);
            if (cachedVal) {
                return res.json({ response: cachedVal, cached: true });
            }
        }

        // ── Direct User Profile / Identity Handler for all Roles ──
        if (/mera\s*name|mera\s*naam|my\s*name|who\s*am\s*i|tell\s*my\s*name|my\s*profile/i.test(message)) {
            const uName = authUser?.name || 'User';
            const uRole = authUser?.role || 'User';
            const uEmail = authUser?.email || 'N/A';
            const uId = authUser?.custom_id || authUser?.employee_id || authUser?.id || 'N/A';
            const replyText = `Your name is **${uName}** (Role: ${uRole}, Email: ${uEmail}, ID: ${uId}).`;
            return res.json({
                response: replyText,
                text: replyText,
                toolsUsed: ['getUserProfile'],
                tokensUsed: 0,
                responseTimeMs: Date.now() - requestStartTime
            });
        }

        // ── ULTRA FAST PATH: Instant 0.1s Local Dispatcher for Pills & Standard Queries ──
        const lowerMsg = message.trim().toLowerCase();
        let directTool = null;

        if (normalizedRole === 'employee') {
            if (/my profile/i.test(lowerMsg)) directTool = 'getEmployeeProfile';
            else if (/today attendance|aaj ki hajri/i.test(lowerMsg)) directTool = 'getEmployeeAttendance';
            else if (/month salary|my salary|net salary/i.test(lowerMsg)) directTool = 'getEmployeeSalary';
            else if (/leave balance|remaining leave/i.test(lowerMsg)) directTool = 'getEmployeeLeaves';
            else if (/expense claims|my claims/i.test(lowerMsg)) directTool = 'getEmployeeClaims';
            else if (/my kpi|kpi score/i.test(lowerMsg)) directTool = 'getEmployeeKPIs';
            else if (/branch location|geofence/i.test(lowerMsg)) directTool = 'getBranchGeofence';
            else if (/company holiday|holidays/i.test(lowerMsg)) directTool = 'getCompanyHolidays';
        } else if (normalizedRole === 'admin' || normalizedRole === 'hr admin') {
            if (/today attendance overview|attendance summary|today attendance/i.test(lowerMsg)) directTool = 'getTodayAttendanceSummary';
            else if (/who is absent|absent today|late coming/i.test(lowerMsg)) directTool = 'getTodayAttendanceSummary';
            else if (/present today count|present count|how many present/i.test(lowerMsg)) directTool = 'getTodayAttendanceSummary';
            else if (/monthly attendance summary|monthly summary/i.test(lowerMsg)) directTool = 'getMonthlyAttendanceSummary';
            else if (/employee list|total employees count|employee stats|company stats/i.test(lowerMsg)) directTool = 'getEmployeeStats';
            else if (/top kpi leaders|kpi leader|top kpi/i.test(lowerMsg)) directTool = 'getKPIScores';
            else if (/pending leave requests|pending leaves|pending leave/i.test(lowerMsg)) directTool = 'getPendingLeaves';
            else if (/pending expense claims|pending claims|pending claim/i.test(lowerMsg)) directTool = 'getPendingClaims';
            else if (/payroll overview|payroll summary/i.test(lowerMsg)) directTool = 'getPayrollOverview';
            else if (/company info|company settings|settings/i.test(lowerMsg)) directTool = 'getCompanySettings';
        } else if (normalizedRole === 'superadmin' || normalizedRole.includes('master')) {
            if (/platform overview|platform stats|total revenue/i.test(lowerMsg)) directTool = 'getSuperAdminStats';
            else if (/registered companies|list companies/i.test(lowerMsg)) directTool = 'getCompaniesList';
            else if (/pending plan requests|plan requests/i.test(lowerMsg)) directTool = 'getPlanRequests';
            else if (/subscription plans|available plans/i.test(lowerMsg)) directTool = 'getPlansList';
        }

        if (directTool && toolHandlers[directTool]) {
            try {
                const dbRes = await toolHandlers[directTool](authUser, {});
                const replyText = formatLocalResponse(directTool, dbRes, companySettings);
                aiCache.set(cacheKey, replyText);
                return res.json({
                    response: replyText,
                    text: replyText,
                    toolsUsed: [directTool],
                    tokensUsed: 0,
                    responseTimeMs: Date.now() - requestStartTime
                });
            } catch (err) {
                console.warn(`Ultra Fast Path failed for tool ${directTool}:`, err.message);
            }
        }

        let systemPrompt = '';
        try {
            const path = require('path');
            if (normalizedRole === 'employee') {
                systemPrompt = require(path.join(__dirname, '../prompts/employee.prompt.js'));
            } else if (normalizedRole === 'admin' || normalizedRole === 'hr admin') {
                systemPrompt = require(path.join(__dirname, '../prompts/admin.prompt.js'));
            } else if (normalizedRole === 'superadmin' || normalizedRole.includes('master')) {
                systemPrompt = require(path.join(__dirname, '../prompts/superadmin.prompt.js'));
            } else {
                systemPrompt = 'You are a helpful assistant for Kiaan HRM.';
            }
        } catch (e) {
            systemPrompt = 'You are a helpful assistant for Kiaan HRM.';
        }

        if (/policy|rules|handbook/i.test(message) && (normalizedRole === 'employee' || normalizedRole === 'admin' || normalizedRole === 'hr admin')) {
            const policies = chatbotService.getCompanyPolicies();
            systemPrompt += `\n\nKNOWLEDGE BASE (Company Policies):\n${policies}`;
        }

        const contents = [];
        
        function appendTurn(role, text) {
            if (!text) return;
            const lastTurn = contents[contents.length - 1];
            if (lastTurn && lastTurn.role === role) {
                lastTurn.parts[0].text += `\n\n${text}`;
            } else {
                contents.push({ role: role, parts: [{ text: text }] });
            }
        }

        appendTurn('user', `[SYSTEM ARCHITECTURE & PERSONAL PERSONA/RULES]\n${systemPrompt}`);
        appendTurn('model', "Understood. I will act as the virtual assistant according to these instructions, persona rules, and tools.");

        if (Array.isArray(history)) {
            history.slice(-4).forEach(msg => {
                const role = msg.role === 'model' ? 'model' : 'user';
                appendTurn(role, msg.content);
            });
        }

        appendTurn('user', message);

        let allowedTools = [];
        if (normalizedRole === 'employee') {
            allowedTools = employeeTools;
        } else if (normalizedRole === 'admin' || normalizedRole === 'hr admin') {
            allowedTools = adminTools;
        } else if (normalizedRole === 'superadmin' || normalizedRole.includes('master')) {
            allowedTools = superadminTools;
        }

        const ai = new GoogleGenAI({ apiKey });
        const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

        // ── Gemini Call Step 1 (Intent & Tool Selection) ──
        let response = await generateContentFast(ai, {
            model: modelName,
            contents: contents,
            config: {
                tools: allowedTools.length > 0 ? [{ functionDeclarations: allowedTools }] : undefined
            }
        });

        let functionCalls = response.functionCalls || [];
        const toolsUsed = [];
        let aiText = "I'm sorry, I couldn't process that.";

        if (functionCalls.length > 0) {
            contents.push({
                role: 'model',
                parts: response.candidates[0].content.parts
            });

            const functionResponseParts = [];
            let lastToolResult = null;
            let lastToolName = null;

            for (const call of functionCalls) {
                const { name, args } = call;
                toolsUsed.push(name);
                lastToolName = name;
                
                let result;
                const dbStartTime = Date.now();
                try {
                    const handler = toolHandlers[name];
                    if (handler) {
                        result = await handler(authUser, args);
                    } else {
                        result = { error: `Tool handler '${name}' not implemented.` };
                    }
                } catch (err) {
                    result = { error: err.message };
                }
                const dbTime = Date.now() - dbStartTime;
                console.log(`[Database Query] Tool '${name}' executed in ${dbTime}ms`);
                lastToolResult = result;

                functionResponseParts.push({
                    functionResponse: {
                        name: name,
                        response: (typeof result === 'object' && result !== null && !Array.isArray(result)) ? result : { data: result }
                    }
                });
            }

            // Determine if user explicitly requested complex reasoning/analysis
            const isComplexQuery = /analyze|analysis|why|insight|explain|recommend|trend|reason/i.test(message);

            if (!isComplexQuery && functionCalls.length === 1 && lastToolName) {
                // ── FAST PATH: Local Response Formatter (1.5 - 2.5s Latency) ──
                aiText = formatLocalResponse(lastToolName, lastToolResult, companySettings);
            } else {
                // ── REASONING PATH: Gemini Step 2 Call for Analytical Queries ──
                contents.push({
                    role: 'user',
                    parts: functionResponseParts
                });

                response = await generateContentFast(ai, {
                    model: modelName,
                    contents: contents,
                    config: {
                        tools: allowedTools.length > 0 ? [{ functionDeclarations: allowedTools }] : undefined
                    }
                });

                if (response.candidates && response.candidates[0] && response.candidates[0].content) {
                    aiText = response.candidates[0].content.parts.map(p => p.text || '').join('');
                }
            }
        } else if (response.candidates && response.candidates[0] && response.candidates[0].content) {
            aiText = response.candidates[0].content.parts.map(p => p.text || '').join('');
        }

        const responseTime = Date.now() - requestStartTime;
        console.log(`[Total Request] Chatbot request handled in ${responseTime}ms using tools: ${toolsUsed.join(', ') || 'none'}`);
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

        if (!isActionQuery && aiText) {
            aiCache.set(cacheKey, aiText);
        }

        try {
            await db.execute(
                `INSERT INTO ai_logs (user_id, company_id, role, prompt, response, tools_used, tokens_used, response_time_ms) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    authUser?.id || null,
                    authUser?.company_id || null,
                    normalizedRole,
                    message,
                    aiText,
                    toolsUsed.join(', ') || null,
                    tokensUsed,
                    responseTime
                ]
            );
        } catch (logErr) {
            console.error("AI Logging Failed:", logErr.message);
        }

        res.json({ response: aiText, text: aiText });
    } catch (err) {
        console.error("Chatbot Error:", err.message || err);
        const errMsg = typeof err === 'object' ? JSON.stringify(err) : String(err);
        if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand')) {
            return res.status(429).json({ 
                error: "AI Engine is temporarily experiencing high demand on Google servers. Please try again in a few seconds.",
                retryAfter: 5
            });
        }
        res.status(500).json({ error: "AI Engine encountered an error.", details: errMsg });
    }
};
