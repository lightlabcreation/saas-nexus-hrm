const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { decrypt } = require('./cryptoUtils');

async function createTransporter(settings) {
    const password = decrypt(settings.smtp_pass);
    return nodemailer.createTransport({
        host: settings.smtp_host,
        port: parseInt(settings.smtp_port),
        secure: parseInt(settings.smtp_port) === 465, // true for 465, false for other ports
        auth: {
            user: settings.smtp_user,
            pass: password,
        }
    });
}

async function sendPayslipEmail(emailSettings, employeeName, employeeEmail, pdfPath, monthYear) {
    if (!emailSettings || !emailSettings.is_active) {
        throw new Error("Email settings are disabled or not configured.");
    }
    if (!employeeEmail) {
        throw new Error("Employee email is missing.");
    }

    const transporter = await createTransporter(emailSettings);
    const fullPdfPath = path.join(__dirname, '..', pdfPath);

    if (!fs.existsSync(fullPdfPath)) {
        throw new Error(`PDF file not found at ${fullPdfPath}`);
    }

    const mailOptions = {
        from: `"${emailSettings.sender_name}" <${emailSettings.sender_email}>`,
        to: employeeEmail,
        subject: `Your Monthly Payslip - ${monthYear}`,
        html: `
            <p>Hello ${employeeName},</p>
            <p>Your payroll has been processed successfully.</p>
            <p>Please find your monthly payslip attached as a PDF.</p>
            <p>If you have any questions regarding your salary, please contact your administrator.</p>
            <br>
            <p>Regards,</p>
            <p>${emailSettings.sender_name}</p>
        `,
        attachments: [
            {
                filename: `Payslip_${monthYear.replace(' ', '_')}.pdf`,
                path: fullPdfPath,
                contentType: 'application/pdf'
            }
        ]
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
}

module.exports = { sendPayslipEmail, createTransporter };
