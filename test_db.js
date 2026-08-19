const db = require('./config/db');

async function check() {
    try {
        const [comps] = await db.execute('SELECT * FROM companies LIMIT 1');
        const [subs] = await db.execute('SELECT * FROM subscriptions LIMIT 1');
        console.log("Companies:", comps);
        console.log("Subscriptions:", subs);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
