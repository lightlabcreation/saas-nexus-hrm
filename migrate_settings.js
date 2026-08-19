const db = require('./config/db');

async function migrate() {
    try {
        console.log("Adding grace_period_mins...");
        await db.query(`ALTER TABLE settings ADD COLUMN grace_period_mins INT DEFAULT 15;`).catch(e => console.log(e.message));

        console.log("Adding standard_end_time...");
        await db.query(`ALTER TABLE settings ADD COLUMN standard_end_time TIME DEFAULT '17:00:00';`).catch(e => console.log(e.message));

        console.log("Adding weekends...");
        await db.query(`ALTER TABLE settings ADD COLUMN weekends VARCHAR(100) DEFAULT 'Saturday,Sunday';`).catch(e => console.log(e.message));

        console.log("Migration complete!");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
