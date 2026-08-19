require('dotenv').config();
const db = require('./config/db');

async function main() {
    try {
        await db.execute('ALTER TABLE enquiries ADD COLUMN phone VARCHAR(20) DEFAULT NULL AFTER email');
        console.log('Added phone column successfully');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Column already exists');
        } else {
            console.error('Error:', err);
        }
    }
    process.exit(0);
}
main();
