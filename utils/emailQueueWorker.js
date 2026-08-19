const db = require('../config/db');
const { sendPayslipEmail } = require('./emailService');
const notificationsUtil = require('./notifications');

let isProcessing = false;

async function processEmailQueue() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        // Fetch up to 10 pending or queued emails ordered by priority and created_at
        const [logs] = await db.execute(`
            SELECT el.*, p.company_id, p.pdf_path, p.cycle_start, e.name as employee_name
            FROM email_logs el
            JOIN payroll p ON el.payroll_id = p.id
            JOIN employees e ON el.employee_id = e.id
            WHERE el.status IN ('queued', 'failed') AND el.retry_count < 3
            ORDER BY 
                FIELD(el.priority, 'high', 'medium', 'low'), 
                el.created_at ASC
            LIMIT 10
        `);

        if (logs.length === 0) {
            isProcessing = false;
            return; // Nothing to process
        }

        // Pre-fetch settings for these companies to avoid multiple queries
        const companyIds = [...new Set(logs.map(l => l.company_id))];
        const [settingsRows] = await db.query(`SELECT * FROM company_email_settings WHERE company_id IN (?)`, [companyIds]);
        const settingsMap = {};
        settingsRows.forEach(row => settingsMap[row.company_id] = row);

        for (const log of logs) {
            try {
                // Mark as processing
                await db.execute('UPDATE email_logs SET status = "processing" WHERE id = ?', [log.id]);

                const settings = settingsMap[log.company_id];
                if (!settings || !settings.is_active) {
                    throw new Error("SMTP settings not configured or disabled for this company.");
                }

                if (!log.pdf_path) {
                    throw new Error("PDF path is missing for this payroll record.");
                }

                const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                const payrollDate = new Date(log.cycle_start);
                const monthYear = `${monthNames[payrollDate.getMonth()]} ${payrollDate.getFullYear()}`;

                // Attempt to send email
                await sendPayslipEmail(settings, log.employee_name, log.employee_email, log.pdf_path, monthYear);

                // Success
                await db.execute('UPDATE email_logs SET status = "sent", sent_time = NOW() WHERE id = ?', [log.id]);
                await db.execute('UPDATE payroll SET email_status = "sent" WHERE id = ?', [log.payroll_id]);

                // Send Dashboard Notification
                notificationsUtil.checkAndNotify('emailNewEnquiry', { // Using generic or we can create a new notification type
                    company_id: log.company_id,
                    user_id: log.employee_id, // Map to user_id correctly (or null if it's strictly for admin)
                    title: `Your ${monthYear} Payslip is available`,
                    message: `Your payslip has been generated and sent to your email.`,
                    type: 'info'
                }); // Note: in production, ensure the notification handler exists for employees.

            } catch (error) {
                console.error(`Failed to process email log ${log.id}:`, error.message);
                const newRetryCount = log.retry_count + 1;
                const newStatus = newRetryCount >= 3 ? 'failed' : 'queued';
                
                await db.execute(
                    'UPDATE email_logs SET status = ?, retry_count = ?, last_error = ? WHERE id = ?', 
                    [newStatus, newRetryCount, error.message, log.id]
                );
                await db.execute('UPDATE payroll SET email_status = "failed" WHERE id = ?', [log.payroll_id]);
            }
        }
    } catch (err) {
        console.error('Error in email queue worker:', err);
    } finally {
        isProcessing = false;
    }
}

// Start the worker to poll every 5 seconds
let intervalId = null;

function startWorker() {
    if (!intervalId) {
        // Reset any stuck "processing" logs from a previous server crash
        db.execute('UPDATE email_logs SET status = "queued" WHERE status = "processing"')
          .catch(err => console.error('Failed to reset stuck processing logs:', err));

        intervalId = setInterval(processEmailQueue, 5000);
        console.log('📧 Email Queue Worker started');
    }
}

function stopWorker() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('📧 Email Queue Worker stopped');
    }
}

module.exports = { startWorker, stopWorker, processEmailQueue };
