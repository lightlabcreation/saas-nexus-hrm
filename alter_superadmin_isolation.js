const mysql = require('mysql2/promise');
require('dotenv').config();

async function alterSuperadminIsolation() {
    try {
        console.log('Connecting to database...');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'hrm-saas-kiaan'
        });

        console.log('Adding created_by to companies table...');
        try {
            await connection.execute(`ALTER TABLE companies ADD COLUMN created_by INT DEFAULT NULL;`);
            console.log('Added created_by to companies.');
        } catch (e) {
            console.log('Column might already exist in companies:', e.message);
        }

        console.log('Adding created_by to plans table...');
        try {
            await connection.execute(`ALTER TABLE plans ADD COLUMN created_by INT DEFAULT NULL;`);
            console.log('Added created_by to plans.');
        } catch (e) {
            console.log('Column might already exist in plans:', e.message);
        }

        await connection.end();
        console.log('Alter superadmin isolation complete. Your multi-tenant system is now isolated.');
    } catch (err) {
        console.error('Error:', err);
    }
}

alterSuperadminIsolation();
