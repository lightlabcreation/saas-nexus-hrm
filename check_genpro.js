require('dotenv').config();
const db = require('./config/db');
const runExpiryChecks = require('./cron/expiryAlerts');

async function main() {
    try {
        const [companies] = await db.execute("SELECT id, company_name, created_at, end_date, billing_cycle FROM companies WHERE company_name LIKE '%Genpro%'");
        console.log("Genpro company:", companies);
        
        // Let's force run the expiry checks
        console.log("Running expiry checks manually...");
        await runExpiryChecks();
        console.log("Finished running expiry checks.");
        
        // Let's check the notifications table
        const [notifs] = await db.execute("SELECT * FROM in_app_notifications ORDER BY created_at DESC LIMIT 5");
        console.log("Latest notifications:", notifs);
        
    } catch (err) {
        console.error("Error:", err);
    }
    process.exit(0);
}
main();
