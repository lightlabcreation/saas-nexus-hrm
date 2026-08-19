require('dotenv').config({ path: './.env' });
const db = require('./config/db');

async function check() {
  try {
    const [rows] = await db.execute('DESCRIBE payroll');
    console.log(rows);
  } catch (err) {
    console.error(err);
  }
  process.exit();
}
check();
