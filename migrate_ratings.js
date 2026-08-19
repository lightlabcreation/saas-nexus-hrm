require('dotenv').config();
const db = require('./config/db');

async function migrateRatings() {
    try {
        console.log('Altering column rating to VARCHAR(50)...');
        await db.execute("ALTER TABLE kpis MODIFY COLUMN rating VARCHAR(50) DEFAULT 'Average'");

        console.log('Migrating Excellent/Good -> High...');
        await db.execute("UPDATE kpis SET rating = 'High' WHERE rating IN ('Excellent', 'Good')");
        
        console.log('Migrating Needs Improvement -> Low...');
        await db.execute("UPDATE kpis SET rating = 'Low' WHERE rating = 'Needs Improvement'");
        
        console.log('Migration complete!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrateRatings();
