require('dotenv').config({ path: './.env' });
const db = require('./config/db');

async function check() {
  const [rows] = await db.execute('SELECT id, employee_id, cycle_start, cycle_end, base_salary, deductions, uif_amount, net_salary, status FROM payroll');
  console.log(rows);
  process.exit();
}
check();
