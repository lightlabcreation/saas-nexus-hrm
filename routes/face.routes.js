const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const faceController = require('../controllers/face.controller');

// Admin only
router.post('/register', auth, faceController.registerFace);

// Employee Attendance Flows
router.get('/today-status', auth, faceController.getTodayStatus);
router.post('/check-in', auth, faceController.checkIn);
router.post('/check-out', auth, faceController.checkOut);

// Check if face is registered
router.get('/status/:employee_id', auth, faceController.getFaceStatus);

module.exports = router;
