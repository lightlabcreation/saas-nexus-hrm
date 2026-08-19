const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const subscriptionGuard = require('../middleware/subscriptionGuard');
const { adminOnly } = require('../middleware/roleGuard');
const employeeController = require('../controllers/employee');
const attendanceController = require('../controllers/attendance');
const profileController = require('../controllers/profile');
const settingsController = require('../controllers/settings');
const authController = require('../controllers/auth');
const publicController = require('../controllers/public.controller');
const notificationsController = require('../controllers/notifications.controller');
const emailSettingsController = require('../controllers/emailSettings.controller');
const emailQueueController = require('../controllers/emailQueue.controller');

const multer = require('multer');
const path = require('path');

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `profile-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024,
        fieldSize: 50 * 1024 * 1024 // 50MB limit for large base64 strings
    }
});

// Auth
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/public/forgot-password-request', authController.forgotPasswordRequest);

// Public Demo Data (For testing only - USER REQUESTED TO KEEP FOR NOW)
router.get('/public/demo-data', async (req, res) => {
    try {
        const db = require('../config/db');
        const [companies] = await db.execute('SELECT id, company_name FROM companies WHERE status = "active" LIMIT 10');
        const [users] = await db.execute('SELECT company_id, name, email, role FROM users WHERE role != "superadmin" LIMIT 50');

        const hierarchy = companies.map(c => {
            return {
                company_id: c.id,
                company_name: c.company_name,
                admins: users.filter(u => u.company_id === c.id && (u.role === 'admin' || u.role === 'master admin')),
                employees: users.filter(u => u.company_id === c.id && u.role === 'employee')
            };
        });
        res.json(hierarchy);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching demo data', error: err.message });
    }
});

// Profile
router.get('/profile', auth, profileController.getProfile);
router.put('/profile', auth, profileController.updateProfile);

// --- Public Routes ---
router.post('/request-company', publicController.requestCompany);
router.post('/public/enquiry', publicController.submitEnquiry);
router.get('/public/site-info', settingsController.getSiteInfo);

// --- Notification Routes ---
router.get('/notifications', auth, notificationsController.getNotifications);
router.put('/notifications/read-all', auth, notificationsController.markAllAsRead);
router.put('/notifications/:id/read', auth, notificationsController.markAsRead);

// Public Plans
router.get('/plans', settingsController.getPlans);
router.post('/plan', auth, settingsController.createPlan);
router.put('/plan/:id', auth, settingsController.updatePlan);
router.delete('/plan/:id', auth, settingsController.deletePlan);
// Employees (Admin-only for mutations, auth+subscription for reads)
router.get('/employees/next-ids', auth, subscriptionGuard, employeeController.getNextIds);
router.get('/employees', auth, subscriptionGuard, employeeController.getAllEmployees);
router.get('/employees/:id', auth, subscriptionGuard, employeeController.getEmployeeById);
router.post('/employees', auth, subscriptionGuard, adminOnly, upload.single('profileImage'), employeeController.addEmployee);
router.put('/employees/:id', auth, subscriptionGuard, adminOnly, upload.single('profileImage'), employeeController.updateEmployee);
router.delete('/employees/:id', auth, subscriptionGuard, adminOnly, employeeController.deleteEmployee);
router.post('/employees/:id/reset-password', auth, subscriptionGuard, adminOnly, employeeController.adminResetPassword);



// Attendance (Admin-only for mutations)
router.get('/attendance', auth, subscriptionGuard, attendanceController.getAttendance);
router.delete('/attendance/reset', auth, subscriptionGuard, adminOnly, attendanceController.resetAttendance);
router.post('/attendance/manual', auth, subscriptionGuard, adminOnly, attendanceController.addManualAttendance);
router.post('/attendance/bulk', auth, subscriptionGuard, adminOnly, attendanceController.bulkMarkAttendance);
router.get('/attendance/stats', auth, subscriptionGuard, attendanceController.getDashboardStats);
router.get('/stats/dashboard', auth, subscriptionGuard, attendanceController.getDashboardStats);
router.get('/attendance/holidays', auth, subscriptionGuard, attendanceController.getPublicHolidays);
router.post('/attendance/holidays', auth, subscriptionGuard, adminOnly, attendanceController.addPublicHoliday);
router.delete('/attendance/holidays/:id', auth, subscriptionGuard, adminOnly, attendanceController.deletePublicHoliday);
router.put('/attendance/:id', auth, subscriptionGuard, adminOnly, attendanceController.updateAttendance);
router.delete('/attendance/:id', auth, subscriptionGuard, adminOnly, attendanceController.deleteAttendance);

// Settings (Admin-only for mutations)
router.get('/settings/global', auth, settingsController.getGlobalSettings);
router.put('/settings/global', auth, adminOnly, settingsController.updateGlobalSettings);
router.get('/settings', auth, subscriptionGuard, settingsController.getSettings);
router.put('/settings', auth, subscriptionGuard, adminOnly, settingsController.updateSettings);
router.get('/settings/current-plan', auth, settingsController.getCurrentPlan);
router.post('/settings/plan-request', auth, settingsController.requestPlan);
router.post('/settings/test-subscription', auth, adminOnly, settingsController.testUpdateSubscription);
router.post('/settings/change-password', auth, settingsController.changePassword);

// Face Recognition
const faceRoutes = require('./face.routes');
router.use('/face', faceRoutes);

// Chatbot (Public & Authenticated context passed in body)
const chatbotController = require('../controllers/chatbot.controller');
router.post('/assistant', auth, chatbotController.handleMessage);

// Leaves
const leaveController = require('../controllers/leave.controller');
router.get('/leaves/balances', auth, subscriptionGuard, leaveController.getLeaveBalances);
router.get('/leaves', auth, subscriptionGuard, leaveController.getLeaves);
router.post('/leaves', auth, subscriptionGuard, upload.single('attachment'), leaveController.applyLeave);
router.put('/leaves/:id', auth, subscriptionGuard, adminOnly, leaveController.updateLeaveStatus);
router.delete('/leaves/clear', auth, subscriptionGuard, adminOnly, leaveController.clearLeaveHistory);

// GeoFencing (Admin-only for mutations)
const geofenceController = require('../controllers/geofence.controller');
router.get('/geofences/assigned', auth, subscriptionGuard, geofenceController.getAssignedGeofence);
router.get('/geofences', auth, subscriptionGuard, geofenceController.getGeofences);
router.post('/geofences', auth, subscriptionGuard, adminOnly, geofenceController.createGeofence);
router.put('/geofences/:id', auth, subscriptionGuard, adminOnly, geofenceController.updateGeofence);
router.delete('/geofences/:id', auth, subscriptionGuard, adminOnly, geofenceController.deleteGeofence);

// Claims
const claimController = require('../controllers/claim.controller');
router.get('/claims', auth, subscriptionGuard, claimController.getClaims);
router.post('/claims', auth, subscriptionGuard, upload.single('receipt'), claimController.submitClaim);
router.put('/claims/:id', auth, subscriptionGuard, adminOnly, claimController.updateClaimStatus);

// KPIs (Admin-only for mutations)
const kpiController = require('../controllers/kpi.controller');
router.get('/kpis/my', auth, subscriptionGuard, kpiController.getMyKPI);
router.get('/kpis', auth, subscriptionGuard, kpiController.getKPIs);
router.post('/kpis', auth, subscriptionGuard, adminOnly, kpiController.createKPI);
router.put('/kpis/:id', auth, subscriptionGuard, adminOnly, kpiController.updateKPI);
router.delete('/kpis/:id', auth, subscriptionGuard, adminOnly, kpiController.deleteKPI);

// Payroll (Admin-only for generation)
const payrollController = require('../controllers/payroll.controller');
router.get('/payroll/live-accrual', auth, subscriptionGuard, payrollController.getLiveAccrual);
router.get('/payroll', auth, subscriptionGuard, payrollController.getPayroll);
router.post('/payroll/generate', auth, subscriptionGuard, adminOnly, payrollController.generatePayroll);
router.post('/payroll/:id/generate-pdf', auth, subscriptionGuard, payrollController.generateSinglePdf);
router.patch('/payroll/:id', auth, subscriptionGuard, adminOnly, payrollController.updateStatus);
router.delete('/payroll/:id', auth, subscriptionGuard, adminOnly, payrollController.deletePayroll);

// Email Settings
router.get('/settings/email', auth, adminOnly, emailSettingsController.getEmailSettings);
router.post('/settings/email', auth, adminOnly, emailSettingsController.saveEmailSettings);
router.post('/settings/email/test', auth, adminOnly, emailSettingsController.testEmailConnection);

// Email Queue
router.post('/payroll/send-emails', auth, adminOnly, emailQueueController.queueEmails);
router.get('/payroll/email-progress-stream', auth, adminOnly, emailQueueController.emailProgressStream);
router.get('/payroll/email-logs', auth, adminOnly, emailQueueController.getEmailLogs);
router.post('/payroll/retry-emails', auth, adminOnly, emailQueueController.retryEmails);

// Kiosk
const kioskController = require('../controllers/kiosk.controller');
router.get('/kiosk/settings', auth, kioskController.getKioskSettings);
router.put('/kiosk/settings', auth, adminOnly, kioskController.updateKioskSettings);

// Kiosk Punch — secured with API key (no user JWT, but requires device key)
router.post('/kiosk/punch', (req, res, next) => {
    const apiKey = req.headers['x-kiosk-api-key'] || req.body.apiKey;
    const validKey = process.env.KIOSK_API_KEY;
    if (!validKey || !apiKey || apiKey !== validKey) {
        return res.status(401).json({ message: 'Unauthorized: Invalid or missing kiosk API key' });
    }
    next();
}, kioskController.kioskPunch);
router.post('/kiosk/face-punch', auth, kioskController.kioskFacePunch);

module.exports = router;
