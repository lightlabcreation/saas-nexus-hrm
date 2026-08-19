const db = require('../config/db');

async function updateBusinessName() {
    try {
        console.log('Updating business_name to "Nexus HRM" in settings table...');
        const [result] = await db.execute('UPDATE settings SET business_name = "Nexus HRM" WHERE id = 1');
        console.log('Updated rows:', result.affectedRows);
        
        // Also update default business_name in global_settings if it exists
        const [globalCols] = await db.execute('SHOW TABLES LIKE "global_settings"');
        if (globalCols.length > 0) {
            console.log('Updating platform_name to "Nexus HRM" in global_settings...');
            await db.execute('UPDATE global_settings SET platform_name = "Nexus HRM" WHERE id = 1');
        }

        console.log('Business name updated successfully in DB');
        process.exit(0);
    } catch (err) {
        console.error('Error updating business name:', err);
        process.exit(1);
    }
}

updateBusinessName();
