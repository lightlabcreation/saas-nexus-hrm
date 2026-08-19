const mysql = require('mysql2/promise');

async function testGetLeaves() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'hrmattendencesaas'
    });

    let query = `
        SELECT l.*, e.name as employee_name, e.custom_id as employee_id 
        FROM leaves l 
        LEFT JOIN employees e ON l.employee_id = e.id 
    `;
    const [leaves] = await connection.execute(query);
    console.log(leaves);
    connection.end();
}

testGetLeaves();
