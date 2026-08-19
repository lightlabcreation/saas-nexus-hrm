require('dotenv').config();
const db = require('./config/db');

async function main() {
    try {
        const [columns] = await db.execute("SHOW COLUMNS FROM company_requests");
        console.log(columns.map(c => c.Field));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}
main();
