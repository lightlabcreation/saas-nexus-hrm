require('dotenv').config();
const db = require('./config/db');
const moment = require('moment-timezone');

async function testQueries() {
    const today = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");
    const companyId = 1;

    try {
        console.log("Testing Present Today...");
        const [attCount] = await db.execute('SELECT COUNT(DISTINCT employee_id) as present FROM attendance WHERE date = ? AND company_id = ?', [today, companyId]);
        const [totalEmp] = await db.execute('SELECT COUNT(*) as total FROM employees WHERE company_id = ?', [companyId]);
        console.log("Present:", attCount[0].present, "Total:", totalEmp[0].total);
    } catch(e) { console.error("Error Present Today:", e.message); }

    try {
        console.log("Testing Pending Leaves...");
        const [leaves] = await db.execute('SELECT COUNT(*) as pending FROM leaves WHERE company_id = ? AND status = "Pending"', [companyId]);
        console.log("Leaves:", leaves[0].pending);
    } catch(e) { console.error("Error Pending Leaves:", e.message); }

    try {
        console.log("Testing Geofences...");
        const [geofences] = await db.execute('SELECT COUNT(*) as total FROM geofences WHERE company_id = ? AND status = "Active"', [companyId]);
        console.log("Geofences:", geofences[0].total);
    } catch(e) { console.error("Error Geofences:", e.message); }
    
    process.exit(0);
}
testQueries();
