require('dotenv').config();
const db = require('./config/db');

async function migrate() {
    try {
        console.log('🚀 Starting Site Info Migration...');

        const columnsToAdd = [
            { name: 'company_name', type: "VARCHAR(255) DEFAULT NULL" },
            { name: 'company_logo', type: "LONGTEXT DEFAULT NULL" },
            { name: 'company_address', type: "TEXT DEFAULT NULL" },
            { name: 'contact_number', type: "VARCHAR(50) DEFAULT NULL" },
            { name: 'about_us', type: "TEXT DEFAULT NULL" },
            { name: 'social_linkedin', type: "VARCHAR(500) DEFAULT NULL" },
            { name: 'social_facebook', type: "VARCHAR(500) DEFAULT NULL" },
            { name: 'social_instagram', type: "VARCHAR(500) DEFAULT NULL" },
            { name: 'social_twitter', type: "VARCHAR(500) DEFAULT NULL" },
            { name: 'social_youtube', type: "VARCHAR(500) DEFAULT NULL" },
            { name: 'privacy_policy', type: "LONGTEXT DEFAULT NULL" },
            { name: 'terms_conditions', type: "LONGTEXT DEFAULT NULL" },
            { name: 'copyright_text', type: "VARCHAR(500) DEFAULT NULL" },
        ];

        for (const col of columnsToAdd) {
            try {
                await db.execute(`ALTER TABLE global_settings ADD COLUMN ${col.name} ${col.type}`);
                console.log(`✅ Added column: ${col.name}`);
            } catch (e) {
                if (e.code === 'ER_DUP_FIELDNAME') {
                    console.log(`⏭️  Column '${col.name}' already exists, skipping.`);
                } else {
                    throw e;
                }
            }
        }

        console.log('\n✅ Site Info Migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
