const mysql = require('mysql2/promise');
require('dotenv').config({ path: './backend/.env' });

async function cleanDB() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME
        });

        await connection.execute('SET FOREIGN_KEY_CHECKS = 0;');
        await connection.execute('TRUNCATE TABLE users;');
        await connection.execute('TRUNCATE TABLE companies;');
        await connection.execute('TRUNCATE TABLE subscriptions;');
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1;');
        
        console.log("Database cleared: users, companies, subscriptions tables are now empty.");
        await connection.end();
    } catch (err) {
        console.error("Error clearing DB:", err);
    }
}

cleanDB();
