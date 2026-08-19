const db = require('../config/db');

async function setup() {
    try {
        console.log('Setting up default admin profile...');
        
        // Update the default admin user with a name and role
        await db.execute(
            "UPDATE users SET name = ?, role = ? WHERE email = ?",
            ['Kiaan Admin', 'Master Admin', 'admin@biotrack.com']
        );

        console.log('Setup completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Setup failed:', err);
        process.exit(1);
    }
}

setup();
