const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const payslipsDir = path.join(__dirname, '..', 'uploads', 'payslips');

// Ensure the directory exists
if (!fs.existsSync(payslipsDir)) {
    fs.mkdirSync(payslipsDir, { recursive: true });
}

async function generatePayslipPDF(payroll, employee, companySettings) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--no-first-run',
                '--disable-extensions'
            ]
        });
        const page = await browser.newPage();

        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        const payrollDate = new Date(payroll.cycle_start);
        const payrollMonth = `${monthNames[payrollDate.getMonth()]} ${payrollDate.getFullYear()}`;

        // Fallback logo if missing
        const logoUrl = companySettings.logo ? companySettings.logo : '';
        const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="Company Logo" style="max-height: 80px;" />` : '';

        // Safe numbers
        const baseSalary = Number(payroll.base_salary || 0).toFixed(2);
        const grossEarnings = Number(payroll.gross_earnings || payroll.base_salary || 0).toFixed(2);
        const employeeContribution = Number(payroll.employee_contribution || payroll.cpf_employee || payroll.uif_amount || 0);
        const employerContribution = Number(payroll.employer_contribution || payroll.cpf_employer || 0);
        const advanceDeduction = Number(payroll.advance_deduction || 0);
        const deductions = Number(payroll.deductions || 0).toFixed(2);
        const netSalary = Number(payroll.net_salary || 0).toFixed(2);
        const salaryRate = Number(employee.salary_rate || 0).toFixed(2);
        const advanceBalance = Number(employee.advance_balance || 0).toFixed(2);
        const overtimePay = Number(payroll.overtime || 0);
        const otherDeductions = Math.max(0, Number(deductions) - employeeContribution - advanceDeduction);

        const currencySymbolMap = {
            'INR': '₹',
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'AED': 'AED ',
            'ZAR': 'R ',
            'SGD': 'S$'
        };
        const currSymbol = currencySymbolMap[companySettings.currency] || companySettings.currency || '₹';

        const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; font-size: 13px; }
                .container { max-width: 800px; margin: 0 auto; padding: 30px 40px; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
                .company-info { text-align: right; }
                .company-name { font-size: 22px; font-weight: bold; color: #0f172a; margin: 0; }
                .payslip-title { font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-top: 6px; }
                
                .emp-details { display: flex; justify-content: space-between; background: #f8fafc; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0; }
                .emp-col { width: 48%; }
                .detail-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
                .label { font-weight: bold; color: #64748b; font-size: 13px; }
                .value { font-weight: 600; font-size: 13px; color: #0f172a; }

                .salary-section { margin-bottom: 20px; }
                .table { width: 100%; border-collapse: collapse; }
                .table th { background: #0f172a; color: white; padding: 10px 14px; text-align: left; font-size: 13px; font-weight: bold; }
                .table td { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
                .amount { text-align: right; font-weight: 600; }

                .employer-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                .employer-title { font-weight: bold; color: #166534; font-size: 13px; }
                .employer-note { font-size: 11px; color: #15803d; margin-left: 6px; font-weight: normal; }
                .employer-amt { font-weight: bold; color: #166534; font-size: 13px; }

                .summary { background: #f8fafc; padding: 16px 20px; border-radius: 8px; margin-top: 16px; border: 1px solid #e2e8f0; }
                .net-pay-row { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #cbd5e1; padding-top: 12px; margin-top: 10px; }
                .net-pay-label { font-size: 16px; font-weight: 800; color: #0f172a; text-transform: uppercase; }
                .net-pay { font-size: 22px; font-weight: 900; color: #10b981; }
                
                .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div>
                        ${logoHtml}
                        <div class="payslip-title">PAYSLIP</div>
                    </div>
                    <div class="company-info">
                        <h1 class="company-name">${companySettings.business_name || companySettings.company_name || 'Our Company'}</h1>
                        <p style="margin:0; font-size:13px; color:#64748b;">${payrollMonth}</p>
                    </div>
                </div>

                <div class="emp-details">
                    <div class="emp-col">
                        <div class="detail-row"><span class="label">Employee Name:</span> <span class="value">${employee.name}</span></div>
                        <div class="detail-row"><span class="label">Employee ID:</span> <span class="value">${employee.custom_id || employee.id}</span></div>
                        <div class="detail-row"><span class="label">Email:</span> <span class="value">${employee.email || 'N/A'}</span></div>
                    </div>
                    <div class="emp-col">
                        <div class="detail-row"><span class="label">Pay Period:</span> <span class="value">${new Date(payroll.cycle_start).toLocaleDateString()} - ${new Date(payroll.cycle_end).toLocaleDateString()}</span></div>
                        <div class="detail-row"><span class="label">Salary Type:</span> <span class="value" style="text-transform: capitalize;">${employee.salary_type || 'Hourly'}</span></div>
                        <div class="detail-row"><span class="label">Salary Rate:</span> <span class="value">${currSymbol}${salaryRate}</span></div>
                    </div>
                </div>

                <!-- Earnings -->
                <div class="salary-section">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Earnings Description</th>
                                <th class="amount">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Basic Salary / Wages</td>
                                <td class="amount">${currSymbol}${baseSalary}</td>
                            </tr>
                            ${overtimePay > 0 ? `
                            <tr>
                                <td>Overtime Pay</td>
                                <td class="amount">${currSymbol}${overtimePay.toFixed(2)}</td>
                            </tr>` : ''}
                        </tbody>
                    </table>
                </div>

                <!-- Deductions -->
                <div class="salary-section">
                    <table class="table">
                        <thead>
                            <tr>
                                <th style="background:#dc2626;">Deductions Description</th>
                                <th class="amount" style="background:#dc2626;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${employeeContribution > 0 ? `
                            <tr>
                                <td>Employee Contribution (PF / Deduction)</td>
                                <td class="amount" style="color:#dc2626;">${currSymbol}${employeeContribution.toFixed(2)}</td>
                            </tr>` : ''}
                            ${advanceDeduction > 0 ? `
                            <tr>
                                <td>
                                    <strong>Advance Deduction (EMI / Installment)</strong>
                                    ${advanceBalance > 0 ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">Remaining Advance Balance: ${currSymbol}${advanceBalance}</div>` : ''}
                                </td>
                                <td class="amount" style="color:#dc2626; font-weight:bold;">${currSymbol}${advanceDeduction.toFixed(2)}</td>
                            </tr>` : ''}
                            ${otherDeductions > 0.01 ? `
                            <tr>
                                <td>Other Deductions / Unpaid Leave</td>
                                <td class="amount" style="color:#dc2626;">${currSymbol}${otherDeductions.toFixed(2)}</td>
                            </tr>` : ''}
                            ${Number(deductions) === 0 ? `
                            <tr>
                                <td colspan="2" style="text-align:center; color:#94a3b8;">No deductions applied</td>
                            </tr>` : ''}
                        </tbody>
                    </table>
                </div>

                <!-- Employer Contribution (Company Paid - Not a deduction from employee) -->
                ${employerContribution > 0 ? `
                <div class="employer-box">
                    <div>
                        <span class="employer-title">Employer Contribution (Company Paid):</span>
                        <span class="employer-note">(Paid by company, not deducted from net pay)</span>
                    </div>
                    <span class="employer-amt">${currSymbol}${employerContribution.toFixed(2)}</span>
                </div>` : ''}

                <!-- Summary -->
                <div class="summary">
                    <div class="detail-row"><span class="label">Gross Earnings:</span> <span class="value">${currSymbol}${grossEarnings}</span></div>
                    <div class="detail-row"><span class="label">Total Employee Deductions:</span> <span class="value" style="color:#dc2626;">-${currSymbol}${deductions}</span></div>
                    <div class="net-pay-row">
                        <span class="net-pay-label">Net Salary (Take Home):</span>
                        <span class="net-pay">${currSymbol}${netSalary}</span>
                    </div>
                </div>

                <div class="footer">
                    <p>This is a system generated e-payslip and does not require a signature.</p>
                    <p>Generated on ${new Date().toLocaleDateString()}</p>
                </div>
            </div>
        </body>
        </html>
        `;

        const fileName = `EMP_${employee.id}_${payrollMonth.replace(' ', '_')}.pdf`;
        const filePath = path.join(payslipsDir, fileName);

        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.pdf({
            path: filePath,
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px' }
        });

        return `/uploads/payslips/${fileName}`;
    } catch (error) {
        console.error('Error generating PDF with Puppeteer:', error.message);
        throw error;
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}

module.exports = { generatePayslipPDF };
