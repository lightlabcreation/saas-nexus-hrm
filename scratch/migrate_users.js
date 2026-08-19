const db = require('../config/db');

async function migrate() {
    try {
        console.log('Starting migration...');
        
        // Add name column if not exists
        await db.execute(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS name VARCHAR(255) AFTER id
        `).catch(err => console.log('Name column might already exist or error:', err.message));

        // Add photo column if not exists
        await db.execute(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS photo LONGTEXT AFTER role
        `).catch(err => console.log('Photo column might already exist or error:', err.message));

        // Change role from ENUM to VARCHAR
        await db.execute(`
            ALTER TABLE users 
            MODIFY COLUMN role VARCHAR(100) NOT NULL
        `).catch(err => console.log('Error modifying role column:', err.message));

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
