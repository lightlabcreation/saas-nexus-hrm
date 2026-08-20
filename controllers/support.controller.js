const db = require('../config/db');
const notificationsUtil = require('../utils/notifications');

// ─── Company Admin: Create Support Ticket ───
exports.createTicket = async (req, res) => {
    try {
        const { title, message } = req.body;
        const companyId = req.user.company_id;
        const createdBy = req.user.id;

        if (!title || !message) {
            return res.status(400).json({ message: 'Title and message are required' });
        }

        // Generate ticket number
        const [[lastTicket]] = await db.execute(
            "SELECT ticket_number FROM support_tickets ORDER BY id DESC LIMIT 1"
        );
        let nextNum = 10001;
        if (lastTicket && lastTicket.ticket_number) {
            const num = parseInt(lastTicket.ticket_number.replace('TICKET-', ''));
            if (!isNaN(num)) nextNum = num + 1;
        }
        const ticketNumber = `TICKET-${nextNum}`;

        // Handle attachment
        let attachmentUrl = null;
        if (req.file) {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            attachmentUrl = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        }

        await db.execute(
            `INSERT INTO support_tickets (ticket_number, company_id, created_by, title, message, attachment_url, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [ticketNumber, companyId, createdBy, title, message, attachmentUrl]
        );

        // Notify Super Admin using existing notification system
        await notificationsUtil.createNotification({
            company_id: null, // null = SuperAdmin notification
            user_id: null,
            title: 'New Support Issue Raised',
            message: `${ticketNumber}: ${title}`,
            type: 'info'
        });

        res.json({ success: true, message: 'Support ticket created successfully', ticketNumber });
    } catch (err) {
        console.error('Error creating support ticket:', err);
        res.status(500).json({ message: 'Error creating ticket', error: err.message });
    }
};

// ─── Company Admin: Get Own Tickets (Tenant Isolated) ───
exports.getMyTickets = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [tickets] = await db.execute(
            `SELECT st.*, u.name as created_by_name
             FROM support_tickets st
             LEFT JOIN users u ON st.created_by = u.id
             WHERE st.company_id = ?
             ORDER BY st.created_at DESC`,
            [companyId]
        );
        res.json(tickets);
    } catch (err) {
        console.error('Error fetching tickets:', err);
        res.status(500).json({ message: 'Error fetching tickets', error: err.message });
    }
};

// ─── Super Admin: Get ALL Tickets ───
exports.getAllTickets = async (req, res) => {
    try {
        const [tickets] = await db.execute(
            `SELECT st.*, c.company_name, u.name as created_by_name
             FROM support_tickets st
             LEFT JOIN companies c ON st.company_id = c.id
             LEFT JOIN users u ON st.created_by = u.id
             ORDER BY st.created_at DESC`
        );
        res.json(tickets);
    } catch (err) {
        console.error('Error fetching all tickets:', err);
        res.status(500).json({ message: 'Error fetching tickets', error: err.message });
    }
};

// ─── Super Admin: Get Single Ticket Detail ───
exports.getTicketDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const [[ticket]] = await db.execute(
            `SELECT st.*, c.company_name, c.owner_name, c.email as company_email, c.phone as company_phone, u.name as created_by_name
             FROM support_tickets st
             LEFT JOIN companies c ON st.company_id = c.id
             LEFT JOIN users u ON st.created_by = u.id
             WHERE st.id = ?`,
            [id]
        );
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        res.json(ticket);
    } catch (err) {
        console.error('Error fetching ticket detail:', err);
        res.status(500).json({ message: 'Error fetching ticket', error: err.message });
    }
};

// ─── Super Admin: Update Ticket Status ───
exports.updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'seen', 'solved'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Must be: pending, seen, or solved' });
        }

        // Get ticket info for notification
        const [[ticket]] = await db.execute(
            'SELECT ticket_number, company_id, created_by, title FROM support_tickets WHERE id = ?',
            [id]
        );
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        await db.execute(
            'UPDATE support_tickets SET status = ? WHERE id = ?',
            [status, id]
        );

        // Notify the company admin who created the ticket
        const statusLabel = status === 'seen' ? 'Seen' : status === 'solved' ? 'Resolved' : 'Pending';
        await notificationsUtil.createNotification({
            company_id: ticket.company_id,
            user_id: ticket.created_by,
            title: 'Support Ticket Updated',
            message: `Your ticket ${ticket.ticket_number} status: ${statusLabel}`,
            type: status === 'solved' ? 'success' : 'info'
        });

        res.json({ success: true, message: `Ticket marked as ${status}` });
    } catch (err) {
        console.error('Error updating ticket status:', err);
        res.status(500).json({ message: 'Error updating ticket', error: err.message });
    }
};

// ─── Get Messages for a Ticket ───
exports.getTicketMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const isSuperAdmin = req.user.role === 'superadmin' || (req.user.role && req.user.role.toLowerCase().includes('master'));

        // Validate ticket access
        const [[ticket]] = await db.execute('SELECT * FROM support_tickets WHERE id = ?', [id]);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        // Tenant isolation: Company Admin can only access their own company ticket
        if (!isSuperAdmin && ticket.company_id !== req.user.company_id) {
            return res.status(403).json({ message: 'Access denied to this ticket' });
        }

        const [messages] = await db.execute(
            'SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC',
            [id]
        );

        res.json({
            ticket,
            messages
        });
    } catch (err) {
        console.error('Error fetching ticket messages:', err);
        res.status(500).json({ message: 'Error fetching messages', error: err.message });
    }
};

// ─── Company Admin: Send Message on Ticket ───
exports.sendAdminMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        const companyId = req.user.company_id;

        if (!message || message.trim() === '') {
            return res.status(400).json({ message: 'Message cannot be empty' });
        }

        // 1. Fetch ticket and verify tenant
        const [[ticket]] = await db.execute(
            `SELECT st.*, c.company_name 
             FROM support_tickets st 
             LEFT JOIN companies c ON st.company_id = c.id 
             WHERE st.id = ? AND st.company_id = ?`,
            [id, companyId]
        );

        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found or access denied' });
        }

        // 2. Gating: Super Admin must accept (mark as seen/in-progress) before admin can chat
        if (ticket.status === 'pending') {
            return res.status(400).json({ 
                message: 'Discussion is locked. Super Admin must accept/review your issue first before messages can be sent.' 
            });
        }

        // 3. Read-only on Solved
        if (ticket.status === 'solved') {
            return res.status(400).json({ 
                message: 'This ticket has been resolved. The conversation is now read-only.' 
            });
        }

        // 4. Handle optional attachment
        let attachmentUrl = null;
        if (req.file) {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            attachmentUrl = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        }

        // 5. Insert message
        const senderName = req.user.name || 'Company Admin';
        const [result] = await db.execute(
            `INSERT INTO support_ticket_messages (ticket_id, sender_id, sender_role, sender_name, message, attachment_url)
             VALUES (?, ?, 'admin', ?, ?, ?)`,
            [id, req.user.id, senderName, message.trim(), attachmentUrl]
        );

        // 6. Notify SuperAdmin
        await notificationsUtil.createNotification({
            company_id: null,
            user_id: null,
            title: `New Message: ${ticket.ticket_number}`,
            message: `${senderName} (${ticket.company_name || 'Company'}): ${message.slice(0, 80)}`,
            type: 'info'
        });

        const [[newMessage]] = await db.execute('SELECT * FROM support_ticket_messages WHERE id = ?', [result.insertId]);

        res.json({ success: true, message: newMessage });
    } catch (err) {
        console.error('Error sending admin message:', err);
        res.status(500).json({ message: 'Error sending message', error: err.message });
    }
};

// ─── Super Admin: Send Message on Ticket ───
exports.sendSuperAdminMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        if (!message || message.trim() === '') {
            return res.status(400).json({ message: 'Message cannot be empty' });
        }

        // 1. Fetch ticket
        const [[ticket]] = await db.execute('SELECT * FROM support_tickets WHERE id = ?', [id]);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        // 2. Read-only on Solved
        if (ticket.status === 'solved') {
            return res.status(400).json({ 
                message: 'This ticket has been resolved. The conversation is now read-only.' 
            });
        }

        // 3. If ticket is pending, auto-advance to 'seen' when Super Admin replies!
        if (ticket.status === 'pending') {
            await db.execute('UPDATE support_tickets SET status = "seen" WHERE id = ?', [id]);
            await notificationsUtil.createNotification({
                company_id: ticket.company_id,
                user_id: ticket.created_by,
                title: 'Support Ticket Accepted',
                message: `Your ticket ${ticket.ticket_number} has been reviewed and accepted by Super Admin.`,
                type: 'info'
            });
        }

        // 4. Handle optional attachment
        let attachmentUrl = null;
        if (req.file) {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            attachmentUrl = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        }

        // 5. Insert message
        const senderName = 'Super Admin';
        const [result] = await db.execute(
            `INSERT INTO support_ticket_messages (ticket_id, sender_id, sender_role, sender_name, message, attachment_url)
             VALUES (?, ?, 'superadmin', ?, ?, ?)`,
            [id, req.user.id, senderName, message.trim(), attachmentUrl]
        );

        // 6. Notify Company Admin
        await notificationsUtil.createNotification({
            company_id: ticket.company_id,
            user_id: ticket.created_by,
            title: `New Message on ${ticket.ticket_number}`,
            message: `Super Admin: ${message.slice(0, 80)}`,
            type: 'info'
        });

        const [[newMessage]] = await db.execute('SELECT * FROM support_ticket_messages WHERE id = ?', [result.insertId]);

        res.json({ success: true, message: newMessage, statusUpdated: ticket.status === 'pending' ? 'seen' : null });
    } catch (err) {
        console.error('Error sending superadmin message:', err);
        res.status(500).json({ message: 'Error sending message', error: err.message });
    }
};
