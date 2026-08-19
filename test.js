const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const db = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hrm-saas-kiaan'
    });
    
    const [emp] = await db.execute('SELECT id, name, salary_type, salary_rate FROM employees');
    console.log('EMPLOYEES:', emp);
    
    const [att] = await db.execute('SELECT employee_id, status FROM attendance');
    console.log('ATTENDANCE ROWS:', att.length);
    
    process.exit(0);
}
run();
