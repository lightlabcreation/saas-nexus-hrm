const mysql = require('mysql2/promise');
require('dotenv').config();

async function alterTable() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME
        });

        // Add password and plan columns to company_requests
        console.log("Adding columns to company_requests...");
        
        try {
            await connection.execute(`ALTER TABLE company_requests ADD COLUMN password VARCHAR(255) NOT NULL AFTER email;`);
            console.log("Added password column.");
        } catch (e) {
            console.log("Password column might already exist:", e.message);
        }

        try {
            await connection.execute(`ALTER TABLE company_requests ADD COLUMN plan VARCHAR(100) AFTER phone;`);
            console.log("Added plan column.");
        } catch (e) {
            console.log("Plan column might already exist:", e.message);
        }

        await connection.end();
        console.log("Alter table complete.");
    } catch (err) {
        console.error("Error:", err);
    }
}

alterTable();
