const db = require('../config/db');

(async () => {
    try {
        // Find mismatched business names
        const [rows] = await db.execute(
            `SELECT s.id, s.company_id, s.business_name, c.company_name 
             FROM settings s 
             LEFT JOIN companies c ON s.company_id = c.id 
             WHERE s.company_id IS NOT NULL AND c.company_name IS NOT NULL`
        );
        console.log('Current settings rows:');
        rows.forEach(r => console.log(`  Company ID ${r.company_id}: settings="${r.business_name}" vs companies="${r.company_name}"`));

        // Update all company settings to use the company_name from companies table
        const [updated] = await db.execute(
            `UPDATE settings s 
             JOIN companies c ON s.company_id = c.id 
             SET s.business_name = c.company_name
             WHERE s.business_name != c.company_name 
             AND s.company_id IS NOT NULL`
        );
        console.log(`\nFixed ${updated.affectedRows} settings row(s) to match company names.`);
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
})();
