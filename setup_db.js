const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
  try {
    console.log("Connecting to MySQL Server...");
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      multipleStatements: true
    });

    console.log("Connected! Reading schema.sql...");
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log("Executing schema.sql...");
    await connection.query(sql);

    console.log("Database and tables created successfully!");
    await connection.end();
  } catch (error) {
    console.error("Error setting up database:", error);
  }
}

setupDatabase();
