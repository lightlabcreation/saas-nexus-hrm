const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupPlansTable() {
    try {
        console.log('Connecting to database...');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'hrm-saas-kiaan'
        });

        console.log('Creating plans table if not exists...');
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS plans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                price VARCHAR(50) NOT NULL,
                duration VARCHAR(50) NOT NULL,
                description TEXT,
                features JSON,
                buttonText VARCHAR(50) DEFAULT 'Get Started',
                isPopular TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Check if plans already exist to avoid duplicates on multiple runs
        const [existingPlans] = await connection.execute('SELECT COUNT(*) as count FROM plans');
        
        if (existingPlans[0].count === 0) {
            console.log('Seeding initial plans...');
            const seedPlans = [
                {
                    name: "Free Trial",
                    price: "$0",
                    duration: "/ 7 days",
                    description: "Start your 7-day free trial.",
                    features: JSON.stringify(["Up to 10 Employees", "Basic Attendance"]),
                    buttonText: "Start Free",
                    isPopular: 0
                },
                {
                    name: "Standard Plan",
                    price: "$49",
                    duration: "/ 1 month",
                    description: "Perfect for small teams.",
                    features: JSON.stringify(["Up to 50 Employees", "Payroll Management", "Basic Reports"]),
                    buttonText: "Get Standard",
                    isPopular: 1
                },
                {
                    name: "Premium Plan",
                    price: "$99",
                    duration: "/ 2 months",
                    description: "Best value for growing companies.",
                    features: JSON.stringify(["Unlimited Employees", "GPS & Face Recognition", "Advanced Analytics", "Priority Support"]),
                    buttonText: "Get Premium",
                    isPopular: 0
                }
            ];

            for (const plan of seedPlans) {
                await connection.execute(
                    'INSERT INTO plans (name, price, duration, description, features, buttonText, isPopular) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [plan.name, plan.price, plan.duration, plan.description, plan.features, plan.buttonText, plan.isPopular]
                );
            }
            console.log('Seed data inserted successfully.');
        } else {
            console.log('Plans table already has data, skipping seed.');
        }

        await connection.end();
        console.log('Done!');
    } catch (err) {
        console.error('Error:', err);
    }
}

setupPlansTable();
