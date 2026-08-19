require('dotenv').config();
const db = require('./config/db');

async function main() {
    try {
        const [rows] = await db.execute("SELECT notifications FROM global_settings LIMIT 1");
        console.log(rows[0].notifications);
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}
main();
