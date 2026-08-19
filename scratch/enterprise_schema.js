const mysql = require('mysql2/promise');
require('dotenv').config({ path: './backend/.env' });

async function updateSchema() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME
        });

        console.log("Starting Enterprise SaaS Multi-Tenant Schema Update...");

        const queries = [
            // 1. Update roles in users table
            `ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL;`,
            `ALTER TABLE employees MODIFY COLUMN role VARCHAR(50) DEFAULT 'employee';`,
            
            // 2. Add company_id to employees
            `ALTER TABLE employees ADD COLUMN company_id INT AFTER id;`,
            `ALTER TABLE employees ADD FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;`,
            
            // 3. Add company_id to attendance
            `ALTER TABLE attendance ADD COLUMN company_id INT AFTER id;`,
            `ALTER TABLE attendance ADD FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;`,
            
            // 4. Add company_id to payroll
            `ALTER TABLE payroll ADD COLUMN company_id INT AFTER id;`,
            `ALTER TABLE payroll ADD FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;`,

            // 5. Add company_id to settings
            `ALTER TABLE settings ADD COLUMN company_id INT AFTER id;`,
            `ALTER TABLE settings ADD FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;`,

            // 6. Update company table to include trial_expiry
            `ALTER TABLE companies ADD COLUMN trial_expiry DATE AFTER status;`
        ];

        for (let query of queries) {
            try {
                await connection.execute(query);
                console.log("✅ Success:", query);
            } catch (err) {
                console.log("⚠️ Skipped (might already exist):", err.message);
            }
        }

        await connection.end();
        console.log("Database schema updated successfully for Multi-Tenant architecture.");
    } catch (err) {
        console.error("Fatal Error:", err);
    }
}

updateSchema();
