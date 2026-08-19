const mysql = require('mysql2/promise');

async function test() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'hrmattendencesaas'
    });

    const [triggers] = await connection.execute('SHOW TRIGGERS');
    console.log("TRIGGERS:", triggers);
    connection.end();
}

test();
