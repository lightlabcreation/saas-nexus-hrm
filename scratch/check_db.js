const db = require('../config/db');

async function check() {
    try {
        const [users] = await db.execute('SELECT * FROM users');
        console.log('User count in DB:', users.length);
        console.log('Users:', users);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}

check();
