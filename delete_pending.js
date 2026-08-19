require('dotenv').config();
const db = require('./config/db');

async function main() {
    try {
        await db.execute("DELETE FROM companies WHERE status = 'pending'");
        console.log("Deleted pending companies");
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}
main();
