const db = require('../config/db');
const bcrypt = require('bcryptjs');

async function fixPassword() {
    try {
        console.log('Hashing admin password...');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        const [result] = await db.execute(
            "UPDATE users SET password = ? WHERE email = ?",
            [hashedPassword, 'admin@biotrack.com']
        );

        if (result.affectedRows === 0) {
            console.log('Admin user not found. Creating one...');
            await db.execute(
                "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
                ['admin@biotrack.com', hashedPassword, 'admin']
            );
        }

        const tiaHashed = await bcrypt.hash('tia123', 10);
        await db.execute(
            "UPDATE users SET password = ? WHERE email = ?",
            [tiaHashed, 'tia@example.com']
        );

        console.log('Admin and Tia passwords updated successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

fixPassword();
