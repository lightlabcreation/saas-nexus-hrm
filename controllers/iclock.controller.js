const db = require("../config/db");
const { processAllRawLogs } = require("./attendance");

/**
 * 1. CDATA Endpoint: handles Handshake (GET) and Data Upload (POST)
 * Path: /iclock/cdata
 */
exports.handleCdata = async (req, res) => {
    try {
        const sn = req.query.SN;
        const table = req.query.table;

        // --- HANDSHAKE (GET Request) ---
        if (req.method === "GET") {
            console.log(`📡 [ADMS] Machine Handshake - SN: ${sn}`);
            res.set('Content-Type', 'text/plain');
            return res.send("OK");
        }

        // --- DATA UPLOAD (POST Request) ---
        const rawData = req.body?.toString() || "";
        // console.log(`📥 [ADMS] Data Received - SN: ${sn}, Table: ${table}`);

        if (table === "ATTLOG" && rawData) {
            const rows = rawData.split("\n");
            let count = 0;

            for (let row of rows) {
                if (!row.trim()) continue;

                // Standard ATTLOG Format: PIN \t Time \t Status \t VerifyMethod
                const parts = row.split("\t");
                const userId = parts[0];
                const dateTime = parts[1];

                if (userId && dateTime) {
                    await db.execute(
                        "INSERT IGNORE INTO raw_logs (machine_user_id, punch_time, device_sn) VALUES (?, ?, ?)",
                        [userId, dateTime, sn]
                    );
                    count++;
                }
            }
            console.log(`✅ [ADMS] Saved ${count} logs for SN: ${sn}`);
            
            // AUTO-PROCESS: Trigger the conversion from raw_logs to attendance table
            try {
                const syncResult = await processAllRawLogs();
                if (syncResult.count > 0) {
                    console.log(`🔄 [ADMS] Auto-synced ${syncResult.count} logs to Attendance.`);
                }
            } catch (syncErr) {
                console.error("⚠️ [ADMS] Auto-sync failed:", syncErr.message);
            }
        }

        res.send("OK");
    } catch (err) {
        console.error("❌ [ADMS] Error in cdata:", err.message);
        res.send("OK"); // Always return OK to machine to avoid infinite retry loops
    }
};

/**
 * 2. GETREQUEST Endpoint: The "Heartbeat" of the machine
 * Path: /iclock/getrequest
 */
exports.handleGetRequest = (req, res) => {
    // Returning "OK" tells the machine there are no pending commands.
    res.send("OK");
};

/**
 * 3. DEVICECMD Endpoint: Receives response of commands sent to machine
 * Path: /iclock/devicecmd
 */
exports.handleDeviceCmd = (req, res) => {
    console.log(`📨 [ADMS] Command Response - SN: ${req.query.SN}`);
    res.send("OK");
};
