const db = require('../config/db');

async function updateDb() {
    try {
        // 1. Update settings table
        console.log('Updating settings table...');
        const [settingsCols] = await db.execute('DESCRIBE settings');
        const hasBusinessName = settingsCols.some(c => c.Field === 'business_name');
        if (!hasBusinessName) {
            await db.execute('ALTER TABLE settings ADD COLUMN business_name VARCHAR(255) DEFAULT "BioTrack Pro"');
            await db.execute('ALTER TABLE settings ADD COLUMN business_address TEXT');
            await db.execute('ALTER TABLE settings ADD COLUMN business_phone VARCHAR(50)');
            await db.execute('ALTER TABLE settings ADD COLUMN business_email VARCHAR(100)');
        }

        // 2. Update attendance table to track who marked it
        console.log('Updating attendance table...');
        const [attCols] = await db.execute('DESCRIBE attendance');
        if (!attCols.some(c => c.Field === 'marked_by')) {
            await db.execute('ALTER TABLE attendance ADD COLUMN marked_by INT');
        }
        if (!attCols.some(c => c.Field === 'holiday_name')) {
            await db.execute('ALTER TABLE attendance ADD COLUMN holiday_name VARCHAR(100)');
        }

        // 3. Create public_holidays table if not exists
        console.log('Creating public_holidays table...');
        await db.execute(`
            CREATE TABLE IF NOT EXISTS public_holidays (
                id INT AUTO_INCREMENT PRIMARY KEY,
                holiday_date DATE NOT NULL UNIQUE,
                holiday_name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4. Update employees table for UIF toggle if needed
        console.log('Updating employees table...');
        const [empCols] = await db.execute('DESCRIBE employees');
        if (!empCols.some(c => c.Field === 'is_uif_registered')) {
            await db.execute('ALTER TABLE employees ADD COLUMN is_uif_registered TINYINT(1) DEFAULT 1');
        }

        // 5. Ensure payroll has gross_earnings and other columns
        console.log('Updating payroll table...');
        const [payCols] = await db.execute('DESCRIBE payroll');
        if (!payCols.some(c => c.Field === 'gross_earnings')) {
            await db.execute('ALTER TABLE payroll ADD COLUMN gross_earnings DECIMAL(10, 2) DEFAULT 0');
        }
        if (!payCols.some(c => c.Field === 'uif_amount')) {
            await db.execute('ALTER TABLE payroll ADD COLUMN uif_amount DECIMAL(10, 2) DEFAULT 0');
        }

        console.log('Database updated successfully');
        process.exit(0);
    } catch (err) {
        console.error('Error updating database:', err);
        process.exit(1);
    }
}

updateDb();
