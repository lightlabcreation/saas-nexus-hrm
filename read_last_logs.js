const db = require('./config/db');

async function main() {
    try {
        const [rows] = await db.execute(`SELECT * FROM ai_logs ORDER BY id DESC LIMIT 10`);
        console.log("Last 10 logs:");
        rows.forEach(r => {
            console.log(`ID: ${r.id} | User: ${r.user_id} | Prompt: "${r.prompt}" | Response: "${r.response.substring(0, 50)}..." | Tools: ${r.tools_used} | Date: ${r.created_at}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
main();
