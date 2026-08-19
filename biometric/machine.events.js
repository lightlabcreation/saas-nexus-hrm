let ioInstance = null;

const initMachineEvents = (io) => {
    ioInstance = io;
    console.log('🔗 Biometric Machine Events initialized with Socket.io');
};

const emitMachineConnected = (ip) => {
    if (ioInstance) {
        ioInstance.emit('machine:connected', { ip, timestamp: new Date() });
    }
};

const emitMachineDisconnected = (ip, reason) => {
    if (ioInstance) {
        ioInstance.emit('machine:disconnected', { ip, reason, timestamp: new Date() });
    }
};

const emitMachineError = (ip, error) => {
    if (ioInstance) {
        ioInstance.emit('machine:error', { ip, error, timestamp: new Date() });
    }
};

const emitNewAttendance = (attendanceRecord) => {
    if (ioInstance) {
        ioInstance.emit('attendance:new', attendanceRecord);
    }
};

module.exports = {
    initMachineEvents,
    emitMachineConnected,
    emitMachineDisconnected,
    emitMachineError,
    emitNewAttendance
};
