require('dotenv').config();
const db = require('./config/db');

async function test() {
    try {
        const [desc] = await db.execute('DESCRIBE attendance');
        console.log("Columns in attendance table:", desc.map(d => d.Field).join(', '));
    } catch (e) {
        console.error(e);
    }
}
test();
