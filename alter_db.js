const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const db = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hrm-saas-kiaan'
    });
    
    try {
        await db.execute("ALTER TABLE employees MODIFY COLUMN salary_type ENUM('hourly','daily','monthly') DEFAULT 'hourly'");
        console.log("Altered employees table.");
        
        const [emp] = await db.execute("SELECT id, name, salary_type, salary_rate FROM employees");
        console.log("Employees:", emp);
        
        // Let's also update anyone who has a rate > 1000 and is 'daily' to 'monthly'
        const [update] = await db.execute("UPDATE employees SET salary_type = 'monthly' WHERE salary_type = 'daily' AND salary_rate > 1000");
        console.log("Updated to monthly:", update.affectedRows);
    } catch(e) {
        console.error(e);
    }
    
    process.exit(0);
}
run();
