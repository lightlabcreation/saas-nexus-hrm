const db = require('../config/db');

async function setupSettings() {
    try {
        const createTableSql = `
            CREATE TABLE IF NOT EXISTS settings (
                id INT PRIMARY KEY,
                machine_ip VARCHAR(50),
                machine_port INT,
                machine_alias VARCHAR(100),
                sync_interval INT,
                late_deduction TINYINT(1),
                salary_cycle VARCHAR(50),
                ot_multiplier DECIMAL(3,2),
                admin_password VARCHAR(255)
            )
        `;
        await db.execute(createTableSql);
        
        const [rows] = await db.execute('SELECT * FROM settings WHERE id = 1');
        if (rows.length === 0) {
            await db.execute(
                'INSERT INTO settings (id, machine_ip, machine_port, machine_alias, sync_interval, late_deduction, salary_cycle, ot_multiplier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [1, '0.0.0.0', 4370, 'Main Entrance Device', 30, 1, '15 Days Cycle', 1.5]
            );
            console.log('Settings initialized');
        } else {
            console.log('Settings already exist');
        }
        process.exit(0);
    } catch (err) {
        console.error('Database Error:', err);
        process.exit(1);
    }
}

setupSettings();
