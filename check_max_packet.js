const db = require('./config/db');

async function main() {
    const [rows] = await db.execute("SHOW VARIABLES LIKE 'max_allowed_packet'");
    console.log(rows);
    process.exit(0);
}
main();
