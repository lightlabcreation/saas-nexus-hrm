const db = require('../config/db');

async function fixMySQLConfig() {
    try {
        console.log('Attempting to increase max_allowed_packet...');
        
        // This might fail if the user doesn't have SUPER privileges
        await db.execute("SET GLOBAL max_allowed_packet = 67108864;"); // 64MB
        
        console.log('Successfully updated max_allowed_packet to 64MB!');
        process.exit(0);
    } catch (err) {
        console.error('Failed to set globally:', err.message);
        console.log('\n--- MANUAL FIX REQUIRED ---');
        console.log('Please run this command in your MySQL Workbench or phpMyAdmin:');
        console.log('SET GLOBAL max_allowed_packet = 67108864;');
        console.log('\nOR update your my.ini / my.cnf file:');
        console.log('[mysqld]');
        console.log('max_allowed_packet=64M');
        process.exit(1);
    }
}

fixMySQLConfig();
