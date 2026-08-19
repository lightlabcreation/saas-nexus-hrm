require('dotenv').config();
const db = require('./config/db');

async function migrate() {
    try {
        console.log('Starting Phase 1 Database Migration for Localization...');

        // 1. Create global_settings table for Superadmin
        await db.execute(`
            CREATE TABLE IF NOT EXISTS global_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                platform_name VARCHAR(255) DEFAULT 'Nexus HRM Pro',
                support_email VARCHAR(255) DEFAULT 'support@nexushrm.com',
                timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
                currency VARCHAR(20) DEFAULT 'SGD',
                date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
                language VARCHAR(50) DEFAULT 'English',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ global_settings table created or verified.');

        // Insert default row if not exists
        const [rows] = await db.execute('SELECT * FROM global_settings LIMIT 1');
        if (rows.length === 0) {
            await db.execute('INSERT INTO global_settings (platform_name) VALUES ("Nexus HRM Pro")');
            console.log('✅ Initialized default row in global_settings.');
        }

        // 2. Alter settings table to add tenant localization columns if they don't exist
        const columnsToAdd = [
            'timezone VARCHAR(100) DEFAULT NULL',
            'currency VARCHAR(20) DEFAULT NULL',
            'date_format VARCHAR(20) DEFAULT NULL',
            'language VARCHAR(50) DEFAULT NULL'
        ];

        for (const col of columnsToAdd) {
            const colName = col.split(' ')[0];
            try {
                await db.execute(`ALTER TABLE settings ADD COLUMN ${col}`);
                console.log(`✅ Added column ${colName} to settings.`);
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log(`ℹ️ Column ${colName} already exists in settings.`);
                } else {
                    console.error(`❌ Error adding column ${colName}:`, err.message);
                }
            }
        }

        console.log('🎉 Migration completed successfully!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit(0);
    }
}

migrate();
