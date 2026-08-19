const { initMachine, disconnectMachine, getStatus } = require('./zk');
const { emitMachineError, emitMachineConnected, emitMachineDisconnected } = require('./machine.events');
const { syncAttendance } = require('./sync');

let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL_MS = 60000; // 1 minute

const startReconnectStrategy = (ip, port) => {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }

    const attemptReconnect = async () => {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error(`❌ Max reconnect attempts reached for machine ${ip}. Halting reconnects.`);
            emitMachineError(ip, 'Max reconnect attempts reached. Please check the machine physically.');
            return;
        }

        reconnectAttempts++;
        console.log(`⏳ Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} for ${ip}...`);
        
        try {
            await disconnectMachine(); // Ensure clean slate
            await initMachine(ip, port);
            console.log('✅ Reconnected to Biometric Machine successfully!');
            reconnectAttempts = 0;
            emitMachineConnected(ip);
            
            // Sync any missing attendance during downtime
            syncAttendance(ip).catch(e => console.error('Error syncing after reconnect:', e));
        } catch (error) {
            console.error(`❌ Reconnect attempt failed: ${error.message}`);
            reconnectTimer = setTimeout(attemptReconnect, RECONNECT_INTERVAL_MS);
        }
    };

    reconnectTimer = setTimeout(attemptReconnect, RECONNECT_INTERVAL_MS);
};

const stopReconnectStrategy = () => {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    reconnectAttempts = 0;
};

module.exports = {
    startReconnectStrategy,
    stopReconnectStrategy
};
