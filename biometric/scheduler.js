const cron = require('node-cron');
const { connectMachineService } = require('./machine.service');
const { syncAttendance } = require('./sync');
const { getStatus } = require('./zk');

const initBiometricScheduler = () => {
    const MACHINE_IP = process.env.MACHINE_IP;
    const MACHINE_PORT = process.env.MACHINE_PORT || 4370;

    if (!MACHINE_IP) {
        console.log('⚠️ No MACHINE_IP configured in .env. Biometric Sync is disabled.');
        return;
    }

    console.log(`⏱️ Initializing Biometric Cron Job for Machine: ${MACHINE_IP}:${MACHINE_PORT}`);

    // Cron job to run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        try {
            console.log(`[Biometric Cron] Running scheduled sync for ${MACHINE_IP}...`);
            
            // Check if connected
            if (!getStatus()) {
                console.log(`[Biometric Cron] Machine offline. Attempting to connect...`);
                const connectRes = await connectMachineService(MACHINE_IP, MACHINE_PORT);
                if (!connectRes.success) {
                    console.log(`[Biometric Cron] Connection failed. Will retry next cycle.`);
                    return;
                }
            }

            // Sync attendance
            await syncAttendance(MACHINE_IP);
        } catch (error) {
            console.error('[Biometric Cron] Error during scheduled sync:', error);
        }
    });

    // Run initial connection attempt on startup
    setTimeout(() => {
        connectMachineService(MACHINE_IP, MACHINE_PORT).catch(() => {});
    }, 5000); // Delay 5 seconds to ensure DB is up
};

module.exports = { initBiometricScheduler };
