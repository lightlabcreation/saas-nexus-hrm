require('dotenv').config({path: './.env'});
const db = require('./config/db');

async function removeDemo() {
    try {
        console.log("Removing Nexus Demo Corp...");
        
        // Find demo company
        const [companies] = await db.execute('SELECT id FROM companies WHERE company_name LIKE "%Demo%"');
        
        if (companies.length === 0) {
            console.log("No demo companies found.");
        } else {
            for (const company of companies) {
                const cid = company.id;
                console.log(`Deleting company ${cid}`);
                
                // Delete employees and users for this company first due to foreign keys
                await db.execute('DELETE FROM attendance WHERE company_id = ?', [cid]);
                await db.execute('DELETE FROM users WHERE company_id = ?', [cid]);
                await db.execute('DELETE FROM employees WHERE company_id = ?', [cid]);
                await db.execute('DELETE FROM subscriptions WHERE company_id = ?', [cid]);
                await db.execute('DELETE FROM companies WHERE id = ?', [cid]);
            }
            console.log("Demo companies removed successfully!");
        }
        process.exit(0);
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}
removeDemo();
