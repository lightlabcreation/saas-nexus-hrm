require('dotenv').config();
const db = require('./config/db');

async function migrate() {
    try {
        console.log('🚀 Adding whatsapp_number column to global_settings...');
        
        try {
            await db.execute(`ALTER TABLE global_settings ADD COLUMN whatsapp_number VARCHAR(50) DEFAULT NULL`);
            console.log('✅ Added whatsapp_number column successfully.');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('⏭️  Column whatsapp_number already exists, skipping.');
            } else {
                throw e;
            }
        }

        console.log('\n✅ WhatsApp migration completed!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
