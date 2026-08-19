const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 30,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    timezone: '+05:30',
    dateStrings: true
});

module.exports = pool.promise();
