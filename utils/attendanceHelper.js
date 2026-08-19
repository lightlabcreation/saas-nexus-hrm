const db = require('../config/db');
const moment = require('moment-timezone');

/**
 * Determines whether a punch-in is "present" or "late" based on company settings.
 * @param {Number} companyId - The ID of the company
 * @param {String|Date} punchTimeStr - The timestamp of the punch in
 * @returns {Promise<String>} - Returns 'present' or 'late'
 */
const determinePunchStatus = async (companyId, punchTimeStr) => {
    try {
        let sql = 'SELECT standard_start_time, grace_period_mins FROM settings WHERE company_id = ?';
        let params = [companyId];
        
        if (!companyId) {
            sql = 'SELECT standard_start_time, grace_period_mins FROM settings WHERE id = 1';
            params = [];
        }

        const [rows] = await db.execute(sql, params);
        
        // If specific company settings not found, fallback to id = 1
        let settings;
        if (rows.length === 0 && companyId) {
            const [defaultRows] = await db.execute('SELECT standard_start_time, grace_period_mins FROM settings WHERE id = 1');
            if (defaultRows.length > 0) {
                settings = defaultRows[0];
            }
        } else if (rows.length > 0) {
            settings = rows[0];
        }

        if (!settings) {
            return 'present';
        }

        const standardStart = settings.standard_start_time || '09:00:00';
        const graceMins = settings.grace_period_mins !== undefined && settings.grace_period_mins !== null 
                            ? parseInt(settings.grace_period_mins) : 15;

        // Parse punchTimeStr
        // Try parsing assuming Asia/Kolkata since our app operates mainly in that zone
        const punchMoment = moment.tz(punchTimeStr, "Asia/Kolkata");
        
        if (!punchMoment.isValid()) {
            return 'present';
        }

        // Apply standard start time to the same date as punch
        const [hours, minutes, seconds] = standardStart.split(':').map(Number);
        
        const standardMoment = punchMoment.clone().set({
            hour: hours,
            minute: minutes,
            second: seconds || 0,
            millisecond: 0
        });

        // Add grace period
        const lateThreshold = standardMoment.clone().add(graceMins, 'minutes');

        if (punchMoment.isAfter(lateThreshold)) {
            return 'late';
        }

        return 'present';
    } catch (err) {
        console.error('Error in determinePunchStatus:', err);
        return 'present'; // fallback
    }
};

module.exports = {
    determinePunchStatus
};
