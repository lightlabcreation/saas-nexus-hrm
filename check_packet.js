const db = require('./config/db');

async function main() {
    const [rows] = await db.execute('SELECT LENGTH(notifications) as n_len, LENGTH(logo) as l_len, LENGTH(favicon) as f_len FROM global_settings LIMIT 1');
    console.log(rows);
    process.exit(0);
}
main();
