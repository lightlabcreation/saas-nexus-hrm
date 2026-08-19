require('dotenv').config();
const db = require('./config/db');

async function main() {
    try {
        const [logs] = await db.execute("SELECT * FROM audit_logs LIMIT 10");
        console.log("Logs:", logs);
        const [schema] = await db.execute("SHOW COLUMNS FROM audit_logs");
        console.log("Schema:", schema.map(s => s.Field));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}
main();
