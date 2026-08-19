require('dotenv').config();
const db = require('./config/db');

async function run() {
    try {
        await db.execute('DELETE FROM companies WHERE company_name LIKE "%test%" OR company_name LIKE "%testing%"');
        await db.execute('DELETE FROM users WHERE email LIKE "%test%" OR name LIKE "%test%"');
        console.log('Deleted extra test companies');
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}
run();
