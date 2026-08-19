const db = require('./config/db');

async function alterDatabase() {
    try {
        console.log('Starting Payslip Database Migration...');

        // 1. Alter Payroll Table
        try {
            await db.execute("ALTER TABLE payroll ADD COLUMN pdf_path VARCHAR(255) DEFAULT NULL AFTER status");
            await db.execute("ALTER TABLE payroll ADD COLUMN email_status ENUM('pending', 'sent', 'failed') DEFAULT 'pending' AFTER pdf_path");
            console.log('✅ Altered `payroll` table successfully.');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('⚠️ `payroll` table already has the new columns.');
            } else {
                throw e;
            }
        }

        // 2. Create Company Email Settings Table
        const emailSettingsQuery = `
            CREATE TABLE IF NOT EXISTS company_email_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT NOT NULL,
                smtp_host VARCHAR(255) NOT NULL,
                smtp_port INT NOT NULL,
                smtp_user VARCHAR(255) NOT NULL,
                smtp_pass TEXT NOT NULL,
                sender_email VARCHAR(255) NOT NULL,
                sender_name VARCHAR(100) NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_company (company_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await db.execute(emailSettingsQuery);
        console.log('✅ Created `company_email_settings` table successfully.');

        // 3. Create Email Logs Table
        const emailLogsQuery = `
            CREATE TABLE IF NOT EXISTS email_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                payroll_id INT NOT NULL,
                employee_id INT NOT NULL,
                employee_email VARCHAR(255) NOT NULL,
                status ENUM('queued', 'processing', 'sent', 'failed', 'cancelled') DEFAULT 'queued',
                priority ENUM('high', 'medium', 'low') DEFAULT 'medium',
                retry_count INT DEFAULT 0,
                last_error TEXT DEFAULT NULL,
                sent_time DATETIME DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await db.execute(emailLogsQuery);
        console.log('✅ Created `email_logs` table successfully.');

        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

alterDatabase();
