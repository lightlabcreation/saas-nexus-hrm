const db = require('./config/db');

async function fixEnum() {
    try {
        await db.execute("ALTER TABLE companies MODIFY COLUMN status ENUM('active', 'inactive', 'suspended') DEFAULT 'active'");
        console.log("Successfully updated companies status ENUM to include 'suspended'.");
        
        // Also update the empty status back to suspended if it got truncated
        await db.execute("UPDATE companies SET status = 'suspended' WHERE status = ''");
        console.log("Fixed truncated statuses.");
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

fixEnum();
