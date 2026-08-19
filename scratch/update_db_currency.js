const db = require('../config/db');

async function main() {
    try {
        console.log('Adding column "currency" to settings table...');
        const [settingsCols] = await db.execute('DESCRIBE settings');
        const hasCurrency = settingsCols.some(c => c.Field === 'currency');
        if (!hasCurrency) {
            await db.execute('ALTER TABLE settings ADD COLUMN currency VARCHAR(10) DEFAULT "ZAR"');
            console.log('Column "currency" added to settings table.');
        } else {
            console.log('Column "currency" already exists in settings.');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error modifying settings table:', err);
        process.exit(1);
    }
}

main();
