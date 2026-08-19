const db = require('./config/db');

async function updateRoles() {
    try {
        console.log('Connecting to database...');
        
        // Update any users that have 'superadmin', 'SuperAdmin', 'masteradmin', or 'Master Admin' to 'admin'
        const [result] = await db.execute(`
            UPDATE users 
            SET role = 'admin' 
            WHERE LOWER(role) IN ('superadmin', 'master admin', 'masteradmin')
        `);
        
        console.log(`Successfully updated ${result.affectedRows} users to 'admin' role.`);
        
        process.exit(0);
    } catch (err) {
        console.error('Error updating roles in DB:', err);
        process.exit(1);
    }
}

updateRoles();
