require('dotenv').config();
const db = require('./config/db');
const runExpiryChecks = require('./cron/expiryAlerts');

async function main() {
    try {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 2); // 2 days + remaining hours today = ~2.5 days -> ceil -> 3 days left
        const formattedDate = endDate.toISOString().split('T')[0];

        await db.execute("UPDATE companies SET subscription_end = ? WHERE company_name LIKE '%Genpro%'", [formattedDate]);
        console.log("Updated Genpro subscription_end to", formattedDate);
        
        console.log("Running expiry checks manually...");
        await runExpiryChecks();
        console.log("Finished running expiry checks.");
        
        const [notifs] = await db.execute("SELECT * FROM in_app_notifications ORDER BY created_at DESC LIMIT 5");
        console.log("Latest notifications:", notifs);
        
    } catch (err) {
        console.error("Error:", err);
    }
    process.exit(0);
}
main();
