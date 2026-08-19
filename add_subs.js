const db = require('./config/db');

async function run() {
    try {
        const [companies] = await db.query("SELECT * FROM companies");
        console.log("Companies:", companies);
        
        const [plans] = await db.query("SELECT * FROM plans");
        console.log("Plans:", plans);
        
        let nexusId, apexId;
        let lowPlanId, mediumPlanId;
        
        companies.forEach(c => {
            const name = c.company_name || c.name || '';
            if (name.toLowerCase().includes('nexus')) nexusId = c.id;
            if (name.toLowerCase().includes('apex')) apexId = c.id;
        });
        
        plans.forEach(p => {
            const name = p.plan_name || p.name || '';
            if (name.toLowerCase().includes('low')) lowPlanId = p.id;
            if (name.toLowerCase().includes('medium')) mediumPlanId = p.id;
        });
        
        console.log(`Nexus ID: ${nexusId}, Apex ID: ${apexId}`);
        console.log(`Low Plan ID: ${lowPlanId}, Medium Plan ID: ${mediumPlanId}`);
        
        const addSub = async (companyId, planName) => {
            if (!companyId || !planName) return;
            
            const startDate = new Date().toISOString().split('T')[0];
            
            // Set end date to exactly 1 month from now
            const oneMonthFromNow = new Date();
            oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
            const endDate = oneMonthFromNow.toISOString().split('T')[0];
            
            await db.query(`INSERT INTO subscriptions (company_id, plan_name, payment_status, amount, start_date, end_date)
                    VALUES (?, ?, 'paid', 500, ?, ?)`, [companyId, planName, startDate, endDate]);
            console.log(`Added subscription for company ${companyId}`);
        };
        
        await addSub(nexusId, 'Low');
        await addSub(apexId, 'Medium');
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
