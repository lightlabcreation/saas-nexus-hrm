const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
    const db = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hrm-saas-kiaan'
    });
    const [c] = await db.execute('DESCRIBE companies');
    console.log("companies schema:", c);
    const [u] = await db.execute('DESCRIBE users');
    console.log("users schema:", u);
    process.exit(0);
}
check();
