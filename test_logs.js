const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkLogs() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'hrm-saas-kiaan'
        });

        const [rows] = await connection.execute('SELECT * FROM audit_logs LIMIT 10');
        console.table(rows);

        await connection.end();
    } catch (err) {
        console.error('Error:', err);
    }
}
checkLogs();
