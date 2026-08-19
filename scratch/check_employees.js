const db = require('../config/db');

async function checkEmployees() {
    try {
        const [columns] = await db.execute(`DESCRIBE employees`);
        console.table(columns);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkEmployees();
