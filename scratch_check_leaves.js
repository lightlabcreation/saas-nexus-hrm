const mysql = require('mysql2/promise');

async function checkLeaves() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'hrmattendencesaas'
    });

    const [rows] = await connection.execute('SELECT id, employee_id, leave_type, reason, status FROM leaves');
    console.log(rows);
    connection.end();
}

checkLeaves();
