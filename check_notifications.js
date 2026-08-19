const db = require('./config/db');

async function main() {
    const [rows] = await db.execute('SELECT notifications FROM global_settings LIMIT 1');
    const n = rows[0].notifications;
    console.log("Length:", n.length);
    console.log("Snippet:", n.substring(0, 100));
    console.log("End:", n.substring(n.length - 100));
    process.exit(0);
}
main();
