const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupNotifications() {
    try {
        const db = await mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'hrm-saas-kiaan'
        });

        // 1. Add notifications column to global_settings if it doesn't exist
        console.log("Checking global_settings table...");
        try {
            await db.execute('ALTER TABLE global_settings ADD COLUMN notifications JSON NULL');
            console.log("Added 'notifications' column to global_settings.");
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log("'notifications' column already exists in global_settings.");
            } else {
                throw err;
            }
        }

        // 2. Create in_app_notifications table
        console.log("Creating in_app_notifications table...");
        await db.execute(`
            CREATE TABLE IF NOT EXISTS in_app_notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id BIGINT NULL,
                user_id INT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type ENUM('info', 'warning', 'success', 'error') DEFAULT 'info',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log("in_app_notifications table created or already exists.");

        console.log("Database setup complete!");
        process.exit(0);
    } catch (err) {
        console.error("Database setup failed:", err);
        process.exit(1);
    }
}

setupNotifications();
