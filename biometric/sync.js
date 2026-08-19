const db = require('../config/db');
const { getAttendances, getStatus } = require('./zk');
const { emitNewAttendance, emitMachineError } = require('./machine.events');
const moment = require('moment-timezone');
const { determinePunchStatus } = require('../utils/attendanceHelper');

const syncAttendance = async (machineIp) => {
    try {
        if (!getStatus()) {
            console.log('Biometric sync aborted: Machine is not connected.');
            return;
        }

        console.log(`fetching logs from machine ${machineIp}...`);
        const logs = await getAttendances();
        
        if (!logs || !logs.data || logs.data.length === 0) {
            console.log('No new logs found on machine.');
            return;
        }

        console.log(`Found ${logs.data.length} raw punches. Processing...`);

        // Sort logs by time ascending
        const sortedLogs = logs.data.sort((a, b) => new Date(a.recordTime) - new Date(b.recordTime));

        for (const log of sortedLogs) {
            const employeeMachineId = log.deviceUserId; 
            const punchTime = moment.tz(log.recordTime, "Asia/Kolkata");
            const date = punchTime.format("YYYY-MM-DD");
            const timeStr = punchTime.format("YYYY-MM-DD HH:mm:ss");

            // Lookup Employee by custom machine_id
            const [employees] = await db.execute('SELECT id, company_id FROM employees WHERE machine_id = ? OR id = ? LIMIT 1', [employeeMachineId, employeeMachineId]);
            
            if (employees.length === 0) {
                console.log(`Employee with machine ID ${employeeMachineId} not found in DB. Skipping.`);
                continue;
            }

            const employee = employees[0];

            // Find attendance record for this date
            const [attendanceRecords] = await db.execute('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [employee.id, date]);

            if (attendanceRecords.length === 0) {
                // No record for today -> Insert Check-In
                const status = await determinePunchStatus(employee.company_id, timeStr);
                await db.execute(
                    `INSERT INTO attendance (employee_id, date, in_time, status, company_id) VALUES (?, ?, ?, ?, ?)`,
                    [employee.id, date, timeStr, status, employee.company_id || null]
                );
                
                emitNewAttendance({
                    employee_id: employee.id,
                    punch_time: timeStr,
                    type: 'Check-In',
                    source: 'Biometric'
                });
            } else {
                // Record exists. Check if this punch is an out_time.
                // We assume out_time if there is a 1-hour gap minimum between in_time and this punch.
                const record = attendanceRecords[0];
                const inTime = moment.tz(record.in_time, "Asia/Kolkata");
                const gapHours = punchTime.diff(inTime, 'hours', true);

                if (gapHours > 1) {
                    if (!record.out_time || moment.tz(record.out_time, "Asia/Kolkata").isBefore(punchTime)) {
                        // Update out_time
                        const outTime = punchTime;
                        const totalHours = (outTime.diff(inTime, 'hours', true)).toFixed(2);
                        
                        await db.execute(
                            `UPDATE attendance SET out_time = ?, total_hours = ? WHERE id = ?`,
                            [timeStr, totalHours, record.id]
                        );

                        emitNewAttendance({
                            employee_id: employee.id,
                            punch_time: timeStr,
                            type: 'Check-Out',
                            source: 'Biometric'
                        });
                    }
                }
            }
        }
        
        console.log('Biometric sync completed successfully.');

    } catch (error) {
        console.error('Error in Biometric Sync:', error);
        emitMachineError(machineIp, error.message);
    }
};

module.exports = { syncAttendance };
