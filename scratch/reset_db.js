const db = require('../config/db');

async function reset() {
    try {
        console.log('🔄 Cleaning up database tables...');
        await db.execute('SET FOREIGN_KEY_CHECKS = 0');
        
        const tables = [
            'users',
            'employees',
            'companies',
            'subscriptions',
            'attendance',
            'payroll',
            'raw_logs',
            'audit_logs',
            'system_logs',
            'company_requests',
            'plan_requests'
        ];

        for (const table of tables) {
            try {
                await db.execute(`TRUNCATE TABLE \`${table}\``);
                console.log(`✅ Truncated ${table}`);
            } catch (err) {
                console.error(`⚠️ Error truncating ${table}:`, err.message);
            }
        }

        await db.execute('SET FOREIGN_KEY_CHECKS = 1');
        console.log('🎉 Database cleanup completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Reset failed:', err);
        process.exit(1);
    }
}

reset();
