const db = require('./config/db');
async function main() {
    const [cols] = await db.execute("SHOW COLUMNS FROM companies");
    console.log(cols.map(c => c.Field));
    process.exit();
}
main();
