const db = require('./config/db');

async function main() {
    try {
        console.log("Checking and creating ai_logs table...");
        await db.execute(`
            CREATE TABLE IF NOT EXISTS ai_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                company_id INT NULL,
                role VARCHAR(50) NOT NULL,
                prompt TEXT NOT NULL,
                response TEXT NOT NULL,
                tools_used VARCHAR(255) NULL,
                tokens_used INT DEFAULT 0,
                response_time_ms INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("ai_logs table is ready.");
    } catch (err) {
        console.error("Migration Error:", err);
    } finally {
        process.exit(0);
    }
}
main();
