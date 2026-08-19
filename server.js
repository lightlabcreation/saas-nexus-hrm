const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // Fixes 30s IPv6 timeout on network environments
process.env.TZ = "Asia/Kolkata";
const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
require('./cron/expiryAlerts');
const emailQueueWorker = require('./utils/emailQueueWorker');

// Start the email queue background worker
emailQueueWorker.startWorker();

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// ─── Security: Helmet HTTP Headers ───
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow uploads to be served cross-origin
    contentSecurityPolicy: false, // Disable CSP for API server (frontend handles its own)
    xFrameOptions: false, // Allow iframing PDFs from the frontend
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false
}));

// ─── CORS: Dynamic from Environment ───
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:5174,http://127.0.0.1:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

const corsOptions = {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true
};

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// IMPORTANT: CORS must be applied before Rate Limiting!
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

// ─── Security: Rate Limiting ───
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // Increased to 2000 requests per 15 min per IP to prevent blocking during normal app usage
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please wait 15 minutes before trying again.' }
});

app.use(generalLimiter);

// ─── Security: Input Sanitization ───
const sanitize = require('./middleware/sanitize');
app.use(sanitize);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log('📁 Created uploads directory');
}

// Dynamic self-healing middleware for missing payslips on ephemeral filesystems
const db = require('./config/db');
const { generatePayslipPDF } = require('./utils/pdfGenerator');

app.use('/uploads/payslips/:filename', async (req, res, next) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', 'payslips', filename);

    if (fs.existsSync(filePath)) {
        return next(); // File exists, let static handler serve it
    }

    // File missing on disk -> Auto-regenerate on the fly!
    try {
        console.log(`⚠️ Missing payslip PDF requested: ${filename}. Auto-regenerating on the fly...`);
        const searchPath = `%${filename}`;
        const [payrollRows] = await db.execute('SELECT * FROM payroll WHERE pdf_path LIKE ? LIMIT 1', [searchPath]);

        if (payrollRows.length === 0) {
            return res.status(404).send('Payslip record not found');
        }

        const payroll = payrollRows[0];
        const [empRows] = await db.execute('SELECT * FROM employees WHERE id = ?', [payroll.employee_id]);
        if (empRows.length === 0) return res.status(404).send('Employee not found');
        const employee = empRows[0];

        let [settingsRows] = await db.execute('SELECT * FROM settings WHERE company_id = ?', [payroll.company_id]);
        let settings = settingsRows[0];
        if (!settings) {
            [settingsRows] = await db.execute('SELECT * FROM settings WHERE id = 1');
            settings = settingsRows[0] || {};
        }

        const newPdfPath = await generatePayslipPDF(payroll, employee, settings);
        const resolvedPath = path.join(__dirname, newPdfPath);
        
        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        } else if (fs.existsSync(resolvedPath)) {
            return res.sendFile(resolvedPath);
        } else {
            return res.status(404).send('Payslip file could not be generated');
        }
    } catch (err) {
        console.error('Error auto-regenerating missing payslip PDF:', err);
        return res.status(500).send('Error generating PDF');
    }
});

app.use('/uploads', express.static('uploads'));

const apiRoutes = require('./routes/api');
const superadminRoutes = require('./routes/superadmin.routes');
const internalRoutes = require('./routes/internal.routes');

// ─── Apply auth rate limiter to login/register routes ───
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

app.use('/api/superadmin', superadminRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api', apiRoutes);

app.get('/', (req, res) => res.send('🚀 Kiaan HRM Pro Backend is Running...'));

io.on('connection', (socket) => {
    console.log('✅ Dashboard Connected');
    socket.on('disconnect', () => console.log('❌ Dashboard Disconnected'));
});

const PORT = process.env.PORT || 8081;

const initDB = async () => {
    try {
        const mysql = require('mysql2/promise');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
        await connection.end();

        const db = require('./config/db');
        console.log('🔄 Checking database tables...');
        
        // 1. Create Tables if they don't exist
        await db.execute(`
            CREATE TABLE IF NOT EXISTS companies (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                company_name VARCHAR(255),
                owner_name VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(50),
                address TEXT,
                plan VARCHAR(100),
                employee_limit INT DEFAULT 0,
                status ENUM('active','inactive') DEFAULT 'active',
                subscription_start DATE,
                subscription_end DATE,
                created_by BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                company_id BIGINT,
                plan_name VARCHAR(100),
                amount DECIMAL(10,2),
                billing_cycle VARCHAR(50),
                payment_status ENUM('paid','pending','failed') DEFAULT 'pending',
                start_date DATE,
                end_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS system_logs (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                action VARCHAR(255),
                role VARCHAR(50),
                user_id BIGINT,
                ip_address VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS plans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255),
                price VARCHAR(100),
                duration VARCHAR(50),
                employee_limit INT DEFAULT 0,
                description TEXT,
                features JSON,
                buttonText VARCHAR(100),
                isPopular BOOLEAN DEFAULT false,
                created_by BIGINT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 1. Create Tables if they don't exist
        await db.execute(`
            CREATE TABLE IF NOT EXISTS employees (
                id INT AUTO_INCREMENT PRIMARY KEY,
                machine_id VARCHAR(50) UNIQUE,
                name VARCHAR(100) NOT NULL,
                role ENUM('admin','employee') DEFAULT 'employee',
                department VARCHAR(100) DEFAULT 'General',
                email VARCHAR(150) UNIQUE,
                salary_rate DECIMAL(10,2) DEFAULT 0.00,
                salary_type ENUM('hourly','daily','monthly') DEFAULT 'hourly',
                status ENUM('active','on_leave','terminated') DEFAULT 'active',
                joined_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT,
                email VARCHAR(150) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin','employee') NOT NULL,
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                date DATE NOT NULL,
                in_time DATETIME,
                out_time DATETIME,
                total_hours DECIMAL(10,2) DEFAULT 0.00,
                status ENUM('present','absent','late','half_day') DEFAULT 'present',
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS payroll (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                cycle_start DATE NOT NULL,
                cycle_end DATE NOT NULL,
                status ENUM('pending','paid') DEFAULT 'pending',
                pdf_path VARCHAR(255) DEFAULT NULL,
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
            )
        `);


        await db.execute(`
            CREATE TABLE IF NOT EXISTS public_holidays (
                id INT AUTO_INCREMENT PRIMARY KEY,
                holiday_name VARCHAR(150) NOT NULL,
                holiday_date DATE NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                machine_ip VARCHAR(50) DEFAULT NULL,
                machine_port INT DEFAULT 4370,
                machine_alias VARCHAR(100) DEFAULT 'Main Entrance',
                sync_interval INT DEFAULT 30,
                late_deduction TINYINT(1) DEFAULT 1,
                late_deduction_amount DECIMAL(10,2) DEFAULT 50.00,
                salary_cycle VARCHAR(50) DEFAULT '15 Days Cycle',
                ot_multiplier DECIMAL(4,2) DEFAULT 1.50,
                business_name VARCHAR(150) DEFAULT 'Kiaan HRM Pro',
                business_address TEXT,
                business_phone VARCHAR(50) DEFAULT '',
                business_email VARCHAR(150) DEFAULT '',
                standard_start_time TIME DEFAULT '09:00:00',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT,
                action VARCHAR(100) NOT NULL,
                target_id INT,
                details JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS global_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                platform_name VARCHAR(255) DEFAULT 'Nexus HRM Pro',
                support_email VARCHAR(255) DEFAULT 'support@nexushrm.com',
                timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
                currency VARCHAR(20) DEFAULT 'INR',
                date_format VARCHAR(50) DEFAULT 'DD/MM/YYYY',
                language VARCHAR(50) DEFAULT 'English',
                notifications JSON DEFAULT NULL,
                company_name VARCHAR(255) DEFAULT NULL,
                company_logo LONGTEXT DEFAULT NULL,
                company_address TEXT DEFAULT NULL,
                contact_number VARCHAR(50) DEFAULT NULL,
                about_us TEXT DEFAULT NULL,
                social_linkedin VARCHAR(500) DEFAULT NULL,
                social_facebook VARCHAR(500) DEFAULT NULL,
                social_instagram VARCHAR(500) DEFAULT NULL,
                social_twitter VARCHAR(500) DEFAULT NULL,
                social_youtube VARCHAR(500) DEFAULT NULL,
                privacy_policy LONGTEXT DEFAULT NULL,
                terms_conditions LONGTEXT DEFAULT NULL,
                copyright_text VARCHAR(500) DEFAULT NULL,
                whatsapp_number VARCHAR(50) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        const [gsRows] = await db.execute('SELECT id FROM global_settings LIMIT 1');
        if (gsRows.length === 0) {
            await db.execute('INSERT INTO global_settings (platform_name, support_email) VALUES ("Nexus HRM Pro", "support@nexushrm.com")');
        }

        console.log('🔄 Checking database columns...');
        const columns = [
            { table: 'employees', column: 'custom_id', type: 'VARCHAR(100) DEFAULT ""' },
            { table: 'employees', column: 'shift', type: "ENUM('Morning Shift','Evening Shift','Night Shift') DEFAULT 'Morning Shift'" },
            { table: 'employees', column: 'phone', type: 'VARCHAR(30) DEFAULT ""' },
            { table: 'employees', column: 'photo', type: 'TEXT' },
            { table: 'employees', column: 'uif_number', type: 'VARCHAR(100) DEFAULT ""' },
            { table: 'employees', column: 'is_uif_registered', type: 'TINYINT(1) DEFAULT 1' },
            { table: 'employees', column: 'advance_balance', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'employees', column: 'signature', type: 'LONGTEXT' },
            { table: 'employees', column: 'status', type: "ENUM('active','on_leave','terminated') DEFAULT 'active'" },
            { table: 'employees', column: 'joined_date', type: 'DATE' },
            { table: 'employees', column: 'salary_rate', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'employees', column: 'salary_type', type: "ENUM('hourly','daily','monthly') DEFAULT 'hourly'" },
            { table: 'employees', column: 'department', type: 'VARCHAR(100) DEFAULT "General"' },
            { table: 'employees', column: 'email', type: 'VARCHAR(150) UNIQUE' },
            { table: 'employees', column: 'created_by', type: 'INT' },
            
            // Users Table
            { table: 'users', column: 'name', type: 'VARCHAR(100) DEFAULT ""' },
            { table: 'users', column: 'photo', type: 'TEXT' },
            { table: 'users', column: 'created_by', type: 'INT' },

            // Attendance Table
            { table: 'attendance', column: 'marked_by', type: 'INT DEFAULT NULL' },
            
            // Payroll Table
            { table: 'payroll', column: 'total_hours', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'payroll', column: 'pdf_path', type: 'VARCHAR(255) DEFAULT NULL' },
            { table: 'payroll', column: 'gross_earnings', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'payroll', column: 'base_salary', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'payroll', column: 'deductions', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'payroll', column: 'uif_amount', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'payroll', column: 'advance_deduction', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'payroll', column: 'overtime', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'payroll', column: 'net_salary', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'payroll', column: 'shifts_data', type: 'JSON' },

            // Settings Table
            { table: 'settings', column: 'machine_ip', type: 'VARCHAR(50) DEFAULT NULL' },
            { table: 'settings', column: 'machine_port', type: 'INT DEFAULT 4370' },
            { table: 'settings', column: 'machine_alias', type: 'VARCHAR(100) DEFAULT "Main Entrance"' },
            { table: 'settings', column: 'sync_interval', type: 'INT DEFAULT 30' },
            { table: 'settings', column: 'late_deduction', type: 'TINYINT(1) DEFAULT 1' },
            { table: 'settings', column: 'salary_cycle', type: 'VARCHAR(50) DEFAULT "15 Days Cycle"' },
            { table: 'settings', column: 'ot_multiplier', type: 'DECIMAL(4,2) DEFAULT 1.50' },
            { table: 'settings', column: 'business_name', type: 'VARCHAR(150) DEFAULT "Kiaan HRM Pro"' },
            { table: 'settings', column: 'business_address', type: 'TEXT' },
            { table: 'settings', column: 'business_phone', type: 'VARCHAR(50) DEFAULT ""' },
            { table: 'settings', column: 'business_email', type: 'VARCHAR(150) DEFAULT ""' },
            { table: 'settings', column: 'standard_start_time', type: 'TIME DEFAULT "09:00:00"' },
            { table: 'settings', column: 'late_deduction_amount', type: 'DECIMAL(10,2) DEFAULT 50.00' },
            { table: 'settings', column: 'salary_cycle_start_date', type: 'INT DEFAULT 1' },
            { table: 'settings', column: 'notify_leaves', type: 'TINYINT(1) DEFAULT 1' },
            { table: 'settings', column: 'notify_claims', type: 'TINYINT(1) DEFAULT 1' },
            { table: 'settings', column: 'notify_password_resets', type: 'TINYINT(1) DEFAULT 1' },
            { table: 'plans', column: 'employee_limit', type: 'INT DEFAULT 0' },

            // Column Upgrades (Changing TEXT to LONGTEXT for large images)
            { table: 'employees', column: 'photo', type: 'LONGTEXT' },
            { table: 'employees', column: 'signature', type: 'LONGTEXT' },
            { table: 'users', column: 'photo', type: 'LONGTEXT' },
            { table: 'users', column: 'role', type: "ENUM('superadmin','admin','employee','Master Admin') NOT NULL" },

            // Multi-tenancy Company Associations
            { table: 'users', column: 'company_id', type: 'BIGINT DEFAULT NULL' },
            { table: 'employees', column: 'company_id', type: 'BIGINT DEFAULT NULL' },
            { table: 'attendance', column: 'company_id', type: 'BIGINT DEFAULT NULL' },
            { table: 'payroll', column: 'company_id', type: 'BIGINT DEFAULT NULL' },
            { table: 'settings', column: 'company_id', type: 'BIGINT DEFAULT NULL' },

            // Employee Branch Assignment (for GeoFencing)
            { table: 'employees', column: 'assigned_branch', type: 'VARCHAR(150) DEFAULT NULL' },

            // Employee Date of Birth (for CPF age-based calculation)
            { table: 'employees', column: 'date_of_birth', type: 'DATE DEFAULT NULL' },

            // CPF Contribution columns on Payroll
            { table: 'payroll', column: 'cpf_employee', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'payroll', column: 'cpf_employer', type: 'DECIMAL(10,2) DEFAULT 0.00' },
            { table: 'payroll', column: 'cpf_total', type: 'DECIMAL(10,2) DEFAULT 0.00' }
        ];

        for (const col of columns) {
            try {
                // Using INFORMATION_SCHEMA is more reliable with placeholders than SHOW COLUMNS
                const [existingCols] = await db.execute(
                    'SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', 
                    [col.table, col.column]
                );

                if (existingCols.length === 0) {
                    console.log(`➕ Adding missing column: ${col.column} to ${col.table}`);
                    // Identifiers like table/column names cannot be placeholders
                    await db.execute(`ALTER TABLE \`${col.table}\` ADD COLUMN \`${col.column}\` ${col.type}`);
                } else if (col.type.toUpperCase().includes('LONGTEXT') && !existingCols[0].COLUMN_TYPE.toUpperCase().includes('LONGTEXT')) {
                    console.log(`⬆️ Upgrading column type: ${col.column} in ${col.table} to LONGTEXT`);
                    await db.execute(`ALTER TABLE \`${col.table}\` MODIFY COLUMN \`${col.column}\` ${col.type}`);
                } else if (col.type.toUpperCase().includes('ENUM') && existingCols[0].COLUMN_TYPE.toUpperCase().includes('ENUM')) {
                    if (existingCols[0].COLUMN_TYPE.replace(/\s+/g, '') !== col.type.split(' ')[0].toLowerCase()) {
                        console.log(`⬆️ Upgrading ENUM type: ${col.column} in ${col.table}`);
                        await db.execute(`ALTER TABLE \`${col.table}\` MODIFY COLUMN \`${col.column}\` ${col.type}`);
                    }
                }
            } catch (err) {
                console.error(`⚠️ Failed for ${col.column} in ${col.table}:`, err.message);
            }
        }

        // 3. Seed Default Admin if no users exist

        // Ensure company_requests table exists
        await db.execute(`
            CREATE TABLE IF NOT EXISTS company_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_name VARCHAR(255) NOT NULL,
                owner_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                plan VARCHAR(100),
                status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS plan_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id BIGINT NOT NULL,
                requested_plan VARCHAR(255) NOT NULL,
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── New Module Tables ──

        await db.execute(`
            CREATE TABLE IF NOT EXISTS leaves (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id BIGINT,
                employee_id INT NOT NULL,
                employee_name VARCHAR(100),
                leave_type ENUM('Annual Leave','Sick Leave','Unpaid Leave','Emergency Leave') DEFAULT 'Annual Leave',
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                days DECIMAL(4,1) DEFAULT 1,
                half_day TINYINT(1) DEFAULT 0,
                reason TEXT,
                status ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
                applied_date DATE,
                attachment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS leave_balances (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id BIGINT,
                employee_id INT NOT NULL,
                annual INT DEFAULT 15,
                sick INT DEFAULT 10,
                unpaid INT DEFAULT 20,
                emergency INT DEFAULT 5,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS geofences (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id BIGINT,
                name VARCHAR(150) NOT NULL,
                address TEXT,
                latitude DECIMAL(10,7),
                longitude DECIMAL(10,7),
                radius INT DEFAULT 100,
                status ENUM('Active','Inactive') DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS claims (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id BIGINT,
                employee_id INT NOT NULL,
                employee_name VARCHAR(100),
                claim_type ENUM('Travel','Fuel','Food','Accommodation','Other') DEFAULT 'Other',
                amount DECIMAL(10,2) DEFAULT 0,
                expense_date DATE,
                status ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
                receipt TEXT,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS kpis (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id BIGINT,
                employee_id INT NOT NULL,
                employee_name VARCHAR(100),
                department VARCHAR(100),
                attendance_score INT DEFAULT 0,
                task_score INT DEFAULT 0,
                overall_score INT DEFAULT 0,
                rating ENUM('Excellent','Good','Average','Needs Improvement') DEFAULT 'Average',
                review_period VARCHAR(50),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS kiosk_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id BIGINT,
                kiosk_name VARCHAR(150) DEFAULT 'Reception Tablet A',
                branch VARCHAR(150) DEFAULT '',
                status ENUM('Active','Inactive') DEFAULT 'Active',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS email_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                payroll_id INT,
                employee_id INT NOT NULL,
                status ENUM('queued', 'processing', 'failed', 'sent') DEFAULT 'queued',
                priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
                retry_count INT DEFAULT 0,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
            )
        `);

        console.log('✅ New module tables checked/created');


        // Seed Plans if empty
        const [plansCount] = await db.execute('SELECT COUNT(*) as count FROM plans');
        if (plansCount[0].count === 0) {
            const defaultPlans = [
                ['Free Trial', '₹0', '/ 7 days', 'Start your 7-day free trial.', JSON.stringify(['Up to 10 Employees', 'Basic Attendance']), 'Start Free', false],
                ['Standard Plan', '₹499', '/ 1 month', 'Perfect for small teams.', JSON.stringify(['Up to 50 Employees', 'Payroll Management', 'Basic Reports']), 'Get Standard', true],
                ['Premium Plan', '₹999', '/ 2 months', 'Best value for growing companies.', JSON.stringify(['Unlimited Employees', 'GPS & Face Recognition', 'Advanced Analytics', 'Priority Support']), 'Get Premium', false]
            ];
            for (const p of defaultPlans) {
                await db.execute('INSERT INTO plans (name, price, duration, description, features, buttonText, isPopular) VALUES (?,?,?,?,?,?,?)', p);
            }
            console.log('📋 Seeded default plans');
        }

        // Commented out default admin user seeding
        /*
        const [userCount] = await db.execute('SELECT COUNT(*) as count FROM users');
        if (userCount[0].count === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await db.execute(
                'INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)',
                ['admin@biotrack.com', hashedPassword, 'Master Admin', 'System Admin']
            );
            console.log('🎁 Seeded default admin user');
        }
        */

        // Migrate existing Master Admin / admin to a Default Company if no companies exist
        const [companiesCount] = await db.execute('SELECT COUNT(*) as count FROM companies');
        if (companiesCount[0].count === 0) {
            const [masterAdmins] = await db.execute('SELECT id, name, email FROM users WHERE role="Master Admin" OR role="admin" LIMIT 1');
            if (masterAdmins.length > 0) {
                const admin = masterAdmins[0];
                
                // 1. Create a Default Company
                const [compRes] = await db.execute(
                    'INSERT INTO companies (company_name, owner_name, email, plan, status) VALUES (?, ?, ?, ?, ?)',
                    ['BioTrack Pro Default', admin.name, admin.email, 'Pro', 'active']
                );
                const companyId = compRes.insertId;

                // 2. Create Active $299 Subscription
                await db.execute(
                    'INSERT INTO subscriptions (company_id, plan_name, amount, billing_cycle, payment_status, start_date, end_date) VALUES (?, ?, ?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR))',
                    [companyId, 'Pro', 299.00, 'yearly', 'paid']
                );

                // 3. Link Admin to Company
                await db.execute('UPDATE users SET company_id = ? WHERE role="Master Admin" OR role="admin"', [companyId]);
                
                // 4. Link all existing records (since it was single tenant, all go to this company)
                await db.execute('UPDATE employees SET company_id = ? WHERE company_id IS NULL', [companyId]);
                await db.execute('UPDATE attendance SET company_id = ? WHERE company_id IS NULL', [companyId]);
                await db.execute('UPDATE users SET company_id = ? WHERE company_id IS NULL AND role!="superadmin"', [companyId]);
                
                console.log('🏢 Migrated existing admin to a new Default Company with a $299 Active Subscription.');
            }
        }

        // Commented out default SuperAdmin seeding
        /*
        const [superadmins] = await db.execute('SELECT * FROM users WHERE role="superadmin"');
        if (superadmins.length === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('123456', 10);
            await db.execute(
                `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
                ['Super Admin', 'superadmin@kiaanhrm.com', hashedPassword, 'superadmin']
            );
            console.log('👑 Default SuperAdmin seeded: superadmin@kiaanhrm.com');
        }
        */

        // Seed Default Settings if empty
        const [settingsCount] = await db.execute('SELECT COUNT(*) as count FROM settings');
        if (settingsCount[0].count === 0) {
            await db.execute('INSERT INTO settings (id, business_name) VALUES (1, "Kiaan HRM Pro")');
            console.log('⚙️ Seeded default settings');
        }

        console.log('✅ Database schema check complete');
    } catch (err) {
        console.error('❌ DB Init failed:');
        console.error(err);
    }
};

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('❌ Global Error:', err);
    res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error'
    });
});

server.listen(PORT, async () => {
    await initDB();
    console.log(`🚀 Kiaan HRM Pro Backend is running on port ${PORT}`);
    
    // Start Biometric Sync Scheduler after DB is up
    // initBiometricScheduler(); // DISABLED: System is now software-only
});
