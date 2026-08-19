const mysql = require('mysql2/promise');

async function alterLeavesTable() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'hrmattendencesaas'
    });

    try {
        await connection.execute('ALTER TABLE leaves ADD COLUMN admin_hidden BOOLEAN DEFAULT FALSE');
        console.log('Column admin_hidden added successfully.');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Column admin_hidden already exists.');
        } else {
            console.error('Error adding column:', err);
        }
    }
    connection.end();
}

alterLeavesTable();
