const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const auth = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// Optional auth helper: populates req.user if valid token provided, but doesn't block unauthenticated registration
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
        } catch (e) {
            // ignore invalid token for optional auth routes
        }
    }
    next();
};

// 1. Create Razorpay Order (Public or Authenticated)
router.post('/create-order', optionalAuth, paymentController.createOrder);

// 2. Verify Payment (Public or Authenticated)
router.post('/verify', optionalAuth, paymentController.verifyPayment);

// 3. Razorpay Webhook (Public, signature-verified)
router.post('/webhook', paymentController.handleWebhook);

// 4. Invoices List (Company Admin Authenticated)
router.get('/invoices', auth, paymentController.getInvoices);

// 5. Payment Transaction History (Company Admin Authenticated)
router.get('/history', auth, paymentController.getPaymentHistory);

// 6. Subscription Change History (Company Admin Authenticated)
router.get('/subscription-history', auth, paymentController.getSubscriptionHistory);

module.exports = router;
