const pool = require('./config/db');

async function setupFaceDb() {
    try {
        console.log('Connecting to database to setup face recognition tables...');

        const createFaceEmbeddings = `
        CREATE TABLE IF NOT EXISTS face_embeddings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            descriptor JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_employee_face (employee_id),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );`;

        const createFaceLogs = `
        CREATE TABLE IF NOT EXISTS face_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            status ENUM('success', 'failure') NOT NULL,
            confidence DECIMAL(5,4) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );`;

        const createUnknownAttempts = `
        CREATE TABLE IF NOT EXISTS unknown_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            photo LONGTEXT,
            confidence DECIMAL(5,4),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`;

        await pool.query(createFaceEmbeddings);
        console.log('✅ Created table: face_embeddings');

        await pool.query(createFaceLogs);
        console.log('✅ Created table: face_logs');

        await pool.query(createUnknownAttempts);
        console.log('✅ Created table: unknown_attempts');

        console.log('🎉 Face Recognition Database Setup Complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error setting up face recognition tables:', error);
        process.exit(1);
    }
}

setupFaceDb();
