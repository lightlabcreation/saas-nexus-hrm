const db = require('../config/db');
const { EventEmitter } = require('events');
const queueEvents = new EventEmitter();

// Helper to broadcast progress updates
async function getProgressStats(companyId) {
    const [realStats] = await db.execute(`
        SELECT el.status, COUNT(DISTINCT el.payroll_id) as count 
        FROM email_logs el
        JOIN payroll p ON el.payroll_id = p.id
        WHERE p.company_id = ? AND DATE(el.created_at) = CURDATE()
          AND el.id = (SELECT MAX(id) FROM email_logs WHERE payroll_id = el.payroll_id)
        GROUP BY el.status
    `, [companyId]);

    const result = { queued: 0, processing: 0, sent: 0, failed: 0, cancelled: 0, total: 0 };
    realStats.forEach(row => {
        result[row.status] = row.count;
        result.total += row.count;
    });
    
    return result;
}

exports.queueEmails = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const { payrollIds } = req.body;

        if (!payrollIds || payrollIds.length === 0) {
            return res.status(400).json({ error: 'No payroll records selected.' });
        }

        // Fetch payroll records to ensure they belong to this company and have a PDF
        const [payrolls] = await db.query(`
            SELECT p.id, p.employee_id, e.email as employee_email 
            FROM payroll p
            JOIN employees e ON p.employee_id = e.id
            WHERE p.id IN (?) AND p.company_id = ?
        `, [payrollIds, companyId]);

        if (payrolls.length === 0) {
            return res.status(400).json({ error: 'Invalid payroll records.' });
        }

        let queuedCount = 0;
        for (const p of payrolls) {
            if (!p.employee_email) continue; // Skip employees without email
            
            // Check if already pending or sent to prevent duplicates
            const [existing] = await db.execute(
                'SELECT id FROM email_logs WHERE payroll_id = ? AND status IN ("queued", "processing", "sent")', 
                [p.id]
            );
            
            if (existing.length === 0) {
                await db.execute(
                    `INSERT INTO email_logs (payroll_id, employee_id, employee_email, status, priority) 
                     VALUES (?, ?, ?, 'queued', 'medium')`,
                    [p.id, p.employee_id, p.employee_email]
                );
                await db.execute('UPDATE payroll SET email_status = "pending" WHERE id = ?', [p.id]);
                queuedCount++;
            }
        }

        res.json({ success: true, message: `Successfully queued ${queuedCount} emails for sending.` });
        
        // Emit an event if anyone is listening via SSE
        const stats = await getProgressStats(companyId);
        queueEvents.emit(`progress_${companyId}`, stats);

    } catch (err) {
        console.error('Error queuing emails:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.emailProgressStream = (req, res) => {
    const companyId = req.user.company_id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial stats
    getProgressStats(companyId).then(stats => {
        res.write(`data: ${JSON.stringify(stats)}\n\n`);
    });

    const listener = (stats) => {
        res.write(`data: ${JSON.stringify(stats)}\n\n`);
    };

    queueEvents.on(`progress_${companyId}`, listener);

    // Also poll every 3 seconds to push updates (since the worker updates DB directly)
    const intervalId = setInterval(async () => {
        const stats = await getProgressStats(companyId);
        res.write(`data: ${JSON.stringify(stats)}\n\n`);
    }, 3000);

    req.on('close', () => {
        queueEvents.removeListener(`progress_${companyId}`, listener);
        clearInterval(intervalId);
    });
};

exports.getEmailLogs = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [logs] = await db.execute(`
            SELECT el.*, e.name as employee_name, p.cycle_start 
            FROM email_logs el
            JOIN payroll p ON el.payroll_id = p.id
            JOIN employees e ON el.employee_id = e.id
            WHERE p.company_id = ?
            ORDER BY el.created_at DESC
            LIMIT 200
        `, [companyId]);
        
        res.json(logs);
    } catch (err) {
        console.error('Error fetching email logs:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.retryEmails = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const { logIds } = req.body;

        if (!logIds || logIds.length === 0) {
            return res.status(400).json({ error: 'No logs selected for retry.' });
        }

        // Verify logs belong to company and update them
        const [result] = await db.query(`
            UPDATE email_logs el
            JOIN payroll p ON el.payroll_id = p.id
            SET el.status = 'queued', el.retry_count = 0, el.last_error = NULL
            WHERE el.id IN (?) AND p.company_id = ? AND el.status IN ('failed', 'cancelled')
        `, [logIds, companyId]);

        res.json({ success: true, message: `Successfully re-queued ${result.affectedRows} emails.` });
        
        // Emit progress update
        const stats = await getProgressStats(companyId);
        queueEvents.emit(`progress_${companyId}`, stats);

    } catch (err) {
        console.error('Error retrying emails:', err);
        res.status(500).json({ error: err.message });
    }
};
