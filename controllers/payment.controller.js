const Razorpay = require('razorpay');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const notificationsUtil = require('../utils/notifications');
const audit = require('../utils/audit');

// Initialize Razorpay Instance
const getRazorpayInstance = () => {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
        throw new Error('Razorpay credentials are not configured in backend .env');
    }

    return new Razorpay({
        key_id,
        key_secret
    });
};

/**
 * 1. Create Razorpay Order
 * Handles: In-app renewal/upgrade (authenticated) OR New registration (unauthenticated)
 */
exports.createOrder = async (req, res) => {
    try {
        const { planId, planName, billingCycle = 'monthly', registrationData } = req.body;
        const companyId = req.user?.company_id || null;
        const userId = req.user?.id || null;

        // Fetch plan from DB (Never trust client-side price)
        let planQuery = 'SELECT * FROM plans WHERE id = ? OR name = ? LIMIT 1';
        const [plans] = await db.execute(planQuery, [planId || 0, planName || '']);

        if (plans.length === 0) {
            return res.status(404).json({ error: 'Selected plan not found' });
        }

        const plan = plans[0];
        const price = parseFloat(plan.price || 0);

        if (price <= 0) {
            return res.status(400).json({ error: 'Free plans do not require payment processing.' });
        }

        const razorpay = getRazorpayInstance();

        // Amount in paise (1 INR = 100 paise)
        const amountInPaise = Math.round(price * 100);
        const receipt = `rcpt_${Date.now()}_${companyId || 'new'}`.slice(0, 40);

        const orderOptions = {
            amount: amountInPaise,
            currency: 'INR',
            receipt,
            notes: {
                company_id: companyId ? String(companyId) : '',
                user_id: userId ? String(userId) : '',
                plan_id: String(plan.id),
                plan_name: plan.name,
                billing_cycle: plan.duration || billingCycle,
                is_new_registration: companyId ? 'false' : 'true'
            }
        };

        const order = await razorpay.orders.create(orderOptions);

        // Record payment transaction attempt in 'pending' status
        await db.execute(`
            INSERT INTO payment_transactions 
            (company_id, user_id, plan_name, billing_cycle, amount, currency, razorpay_order_id, payment_status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `, [
            companyId,
            userId,
            plan.name,
            plan.duration || billingCycle,
            price,
            'INR',
            order.id,
            JSON.stringify({ registrationData: registrationData || null, planDetails: plan })
        ]);

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            planName: plan.name,
            employeeLimit: plan.employee_limit || 0
        });
    } catch (err) {
        console.error('Error creating Razorpay order:', err);
        res.status(500).json({ error: err.message || 'Failed to create payment order' });
    }
};

/**
 * Helper: Smart Duration Calculator
 */
const getDurationDays = (duration) => {
    const d = (duration || '').toLowerCase();
    if (d === 'weekly' || d.includes('7')) return 7;
    if (d === 'quarterly' || d.includes('90')) return 90;
    if (d === 'half-yearly' || d.includes('180')) return 180;
    if (d === 'annually' || d === 'yearly' || d.includes('365')) return 365;
    return 30; // default monthly
};

/**
 * Core Activation Service (Shared by Frontend Callback & Webhook)
 * Ensures idempotent execution, accurate expiry extension, and transaction logging
 */
const activateSubscriptionInternal = async ({
    order_id,
    payment_id,
    signature = null,
    payment_method = 'razorpay',
    registrationData = null,
    authenticatedCompanyId = null,
    authenticatedUserId = null,
    changed_by = 'system'
}) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Fetch transaction record to retrieve plan & registration info
        const [txns] = await connection.execute(
            'SELECT * FROM payment_transactions WHERE razorpay_order_id = ? FOR UPDATE',
            [order_id]
        );

        if (txns.length === 0) {
            throw new Error(`Transaction record not found for order: ${order_id}`);
        }

        const txn = txns[0];

        // Idempotency check: If already marked success, do not duplicate subscription extension
        if (txn.payment_status === 'success') {
            await connection.rollback();
            return {
                alreadyProcessed: true,
                company_id: txn.company_id,
                message: 'Payment already verified and subscription activated.'
            };
        }

        let companyId = txn.company_id || authenticatedCompanyId;
        let userId = txn.user_id || authenticatedUserId;
        let createdNewUser = null;

        // Parse stored notes
        let storedNotes = {};
        try {
            storedNotes = typeof txn.notes === 'string' ? JSON.parse(txn.notes || '{}') : (txn.notes || {});
        } catch (e) {}

        const regData = registrationData || storedNotes.registrationData;

        // 2. Fetch Plan Details from DB
        const [planRows] = await connection.execute(
            'SELECT * FROM plans WHERE name = ? LIMIT 1',
            [txn.plan_name]
        );
        const plan = planRows[0] || {};
        const employeeLimit = plan.employee_limit || 0;
        const planDuration = plan.duration || txn.billing_cycle || 'monthly';
        const daysToAdd = getDurationDays(planDuration);
        const amount = txn.amount || plan.price || 0;

        // 3. Handle New Company & Admin Creation if New Registration
        if (!companyId && regData) {
            const cleanEmail = (regData.email || '').trim().toLowerCase();
            const cleanPhone = (regData.phone || '').trim();
            const cleanCompanyName = (regData.companyName || '').trim();
            const cleanAdminName = (regData.adminName || '').trim();
            const plainPassword = regData.password;

            // Create Company
            const [compResult] = await connection.execute(`
                INSERT INTO companies (company_name, owner_name, email, phone, status, plan, employee_limit)
                VALUES (?, ?, ?, ?, 'active', ?, ?)
            `, [cleanCompanyName, cleanAdminName, cleanEmail, cleanPhone, txn.plan_name, employeeLimit]);

            companyId = compResult.insertId;

            // Create Admin User
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(plainPassword, salt);

            const [userResult] = await connection.execute(`
                INSERT INTO users (company_id, name, email, password, role)
                VALUES (?, ?, ?, ?, 'admin')
            `, [companyId, cleanAdminName, cleanEmail, hashedPassword]);

            userId = userResult.insertId;

            // Create Settings record for the new company
            await connection.execute(`
                INSERT INTO settings (company_id, business_name, business_email, business_phone, currency)
                VALUES (?, ?, ?, ?, 'INR')
            `, [companyId, cleanCompanyName, cleanEmail, cleanPhone]);

            createdNewUser = {
                id: userId,
                name: cleanAdminName,
                email: cleanEmail,
                role: 'admin',
                company_id: companyId,
                company_name: cleanCompanyName
            };
        }

        if (!companyId) {
            throw new Error('No company ID could be resolved for this subscription activation.');
        }

        // 4. Fetch Current Company & Subscription State
        const [compRows] = await connection.execute(
            'SELECT * FROM companies WHERE id = ? FOR UPDATE',
            [companyId]
        );
        const currentCompany = compRows[0] || {};
        const previousPlan = currentCompany.plan || 'Free Trial';
        const previousLimit = currentCompany.employee_limit || 0;

        // Smart Expiry Calculation:
        // If current subscription is Active (expiry > today), extend from current expiry date!
        // If expired or trial, start from today.
        const [latestSubs] = await connection.execute(`
            SELECT end_date, created_at, billing_cycle 
            FROM subscriptions 
            WHERE company_id = ? AND payment_status = 'paid'
            ORDER BY id DESC LIMIT 1
        `, [companyId]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let startDate = new Date();
        let baseDateForExtension = new Date();

        if (latestSubs.length > 0 && latestSubs[0].end_date) {
            const existingEnd = new Date(latestSubs[0].end_date);
            existingEnd.setHours(23, 59, 59, 999);
            if (existingEnd > today) {
                // Subscription is active! Extend from existing end date without losing remaining days
                baseDateForExtension = new Date(existingEnd.getTime());
            }
        }

        const newEndDate = new Date(baseDateForExtension.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        newEndDate.setHours(23, 59, 59, 999);

        const startDateStr = startDate.toISOString().slice(0, 10);
        const endDateStr = newEndDate.toISOString().slice(0, 10);

        // 5. Determine Subscription Change Type
        let changeType = 'renewal';
        if (regData || !latestSubs.length) {
            changeType = 'initial';
        } else if (previousPlan !== txn.plan_name) {
            if (employeeLimit > previousLimit || parseFloat(amount) > parseFloat(latestSubs[0].amount || 0)) {
                changeType = 'upgrade';
            } else {
                changeType = 'downgrade';
            }
        }

        // 6. Update Company Details
        await connection.execute(`
            UPDATE companies 
            SET plan = ?, employee_limit = ?, status = 'active', subscription_start = ?, subscription_end = ?, updated_at = NOW()
            WHERE id = ?
        `, [txn.plan_name, employeeLimit, startDateStr, endDateStr, companyId]);

        // 7. Insert New Paid Subscription Record
        const [subResult] = await connection.execute(`
            INSERT INTO subscriptions 
            (company_id, plan_name, billing_cycle, amount, payment_status, order_id, payment_id, start_date, end_date, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, ?, NOW(), NOW())
        `, [
            companyId,
            txn.plan_name,
            planDuration,
            amount,
            order_id,
            payment_id,
            startDateStr,
            endDateStr
        ]);

        const subscriptionId = subResult.insertId;

        // 8. Generate & Insert Invoice Record
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
        await connection.execute(`
            INSERT INTO invoices 
            (invoice_number, company_id, subscription_id, plan_name, billing_cycle, amount, currency, payment_status, payment_method, razorpay_order_id, razorpay_payment_id, customer_name, customer_email, customer_phone, company_name, invoice_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'INR', 'paid', ?, ?, ?, ?, ?, ?, ?, CURDATE(), NOW())
        `, [
            invoiceNumber,
            companyId,
            subscriptionId,
            txn.plan_name,
            planDuration,
            amount,
            payment_method,
            order_id,
            payment_id,
            currentCompany.owner_name || regData?.adminName || 'Admin',
            currentCompany.email || regData?.email || '',
            currentCompany.phone || regData?.phone || '',
            currentCompany.company_name || regData?.companyName || 'Company'
        ]);

        // 9. Update Payment Transaction Record
        await connection.execute(`
            UPDATE payment_transactions 
            SET company_id = ?, user_id = ?, payment_status = 'success', razorpay_payment_id = ?, razorpay_signature = ?, payment_method = ?, updated_at = NOW()
            WHERE razorpay_order_id = ?
        `, [companyId, userId, payment_id, signature, payment_method, order_id]);

        // 10. Record in Subscription History Table (Subscription Change History)
        await connection.execute(`
            INSERT INTO subscription_history 
            (company_id, previous_plan, new_plan, previous_employee_limit, new_employee_limit, previous_end_date, new_end_date, change_type, amount, changed_by, razorpay_payment_id, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            companyId,
            previousPlan,
            txn.plan_name,
            previousLimit,
            employeeLimit,
            latestSubs[0]?.end_date || null,
            endDateStr,
            changeType,
            amount,
            changed_by,
            payment_id,
            `Activated via ${payment_method}. Duration: ${planDuration} (+${daysToAdd} days).`
        ]);

        await connection.commit();

        // 11. Create In-App Notifications & Audit (Non-blocking)
        try {
            await notificationsUtil.createNotification({
                company_id: companyId,
                user_id: null,
                title: 'Subscription Activated Successfully! 🎉',
                message: `Your ${txn.plan_name} (${planDuration}) is now active until ${endDateStr}. Employee limit: ${employeeLimit}.`,
                type: 'success'
            });

            await notificationsUtil.createNotification({
                company_id: null,
                user_id: null,
                title: 'Paid Subscription Received 💰',
                message: `${currentCompany.company_name || regData?.companyName} paid ₹${amount} for ${txn.plan_name} (${changeType}).`,
                type: 'success'
            });

            await audit.logAction(
                userId || 1,
                'SUBSCRIPTION_PAYMENT_SUCCESS',
                companyId,
                JSON.stringify({ plan: txn.plan_name, amount, order_id, payment_id, changeType, endDate: endDateStr })
            );
        } catch (notifErr) {
            console.error('Non-critical error sending payment notification:', notifErr.message);
        }

        return {
            success: true,
            company_id: companyId,
            subscription_id: subscriptionId,
            plan_name: txn.plan_name,
            amount,
            end_date: endDateStr,
            employee_limit: employeeLimit,
            change_type: changeType,
            invoice_number: invoiceNumber,
            newUser: createdNewUser
        };
    } catch (err) {
        await connection.rollback();
        console.error('Error in activateSubscriptionInternal:', err);
        throw err;
    } finally {
        connection.release();
    }
};

/**
 * 2. Verify Payment (Frontend Callback Endpoint)
 */
exports.verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            registrationData
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing required payment verification parameters' });
        }

        // Verify HMAC SHA-256 signature
        const secret = process.env.RAZORPAY_KEY_SECRET;
        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            // Update transaction to failed
            await db.execute(
                'UPDATE payment_transactions SET payment_status = "failed", error_description = "Invalid Signature" WHERE razorpay_order_id = ?',
                [razorpay_order_id]
            );
            return res.status(400).json({ error: 'Payment signature verification failed. Untrusted request.' });
        }

        // Activate Subscription
        const result = await activateSubscriptionInternal({
            order_id: razorpay_order_id,
            payment_id: razorpay_payment_id,
            signature: razorpay_signature,
            payment_method: 'razorpay_checkout',
            registrationData,
            authenticatedCompanyId: req.user?.company_id || null,
            authenticatedUserId: req.user?.id || null,
            changed_by: req.user?.name || 'user_checkout'
        });

        let token = null;
        let userData = null;

        // If new registration, generate JWT token for automatic seamless login
        if (result.newUser) {
            token = jwt.sign(
                {
                    id: result.newUser.id,
                    email: result.newUser.email,
                    role: result.newUser.role,
                    company_id: result.newUser.company_id
                },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );
            userData = result.newUser;
        }

        res.json({
            success: true,
            message: 'Payment verified and subscription activated successfully!',
            data: result,
            token,
            user: userData
        });
    } catch (err) {
        console.error('Payment verification error:', err);
        res.status(500).json({ error: err.message || 'Payment verification failed' });
    }
};

/**
 * 3. Razorpay Webhook Handler
 * Handles: payment.captured, payment.failed, order.paid
 * Verifies signature on raw request body for bulletproof automation even if browser is closed!
 */
exports.handleWebhook = async (req, res) => {
    try {
        const webhookSignature = req.headers['x-razorpay-signature'];
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

        if (!webhookSignature) {
            return res.status(400).json({ error: 'Missing Razorpay signature header' });
        }

        // Raw body verification
        const rawBody = req.rawBody || JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');

        if (expectedSignature !== webhookSignature) {
            console.warn('⚠️ Webhook signature mismatch. Checking with KEY_SECRET...');
            const fallbackSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(rawBody)
                .digest('hex');

            if (fallbackSignature !== webhookSignature) {
                console.error('❌ Webhook invalid signature rejected.');
                return res.status(400).json({ error: 'Invalid webhook signature' });
            }
        }

        const event = req.body.event;
        const payload = req.body.payload;

        console.log(`🔔 Razorpay Webhook Received Event: ${event}`);

        if (event === 'payment.captured' || event === 'order.paid') {
            const paymentEntity = payload.payment?.entity || {};
            const order_id = paymentEntity.order_id || payload.order?.entity?.id;
            const payment_id = paymentEntity.id;
            const payment_method = paymentEntity.method || 'razorpay_webhook';

            if (order_id && payment_id) {
                await activateSubscriptionInternal({
                    order_id,
                    payment_id,
                    signature: webhookSignature,
                    payment_method,
                    changed_by: 'razorpay_webhook'
                });
                console.log(`✅ Webhook successfully activated subscription for Order: ${order_id}`);
            }
        } else if (event === 'payment.failed') {
            const paymentEntity = payload.payment?.entity || {};
            const order_id = paymentEntity.order_id;
            const payment_id = paymentEntity.id;
            const errorCode = paymentEntity.error_code || 'PAYMENT_FAILED';
            const errorDesc = paymentEntity.error_description || 'Payment was declined or cancelled.';

            if (order_id) {
                await db.execute(`
                    UPDATE payment_transactions 
                    SET payment_status = 'failed', razorpay_payment_id = ?, error_code = ?, error_description = ?, updated_at = NOW()
                    WHERE razorpay_order_id = ?
                `, [payment_id, errorCode, errorDesc, order_id]);
                console.log(`⚠️ Webhook recorded payment failure for Order: ${order_id}`);
            }
        }

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('Error processing Razorpay webhook:', err);
        // Always return 200 to Razorpay so it doesn't repeatedly retry failing webhooks
        res.status(200).json({ status: 'error_handled', message: err.message });
    }
};

/**
 * 4. Get Company Invoices (Multi-tenant isolated)
 */
exports.getInvoices = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await db.execute(`
            SELECT * FROM invoices 
            WHERE company_id = ? 
            ORDER BY id DESC
        `, [companyId]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching invoices:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 5. Get Payment Transactions (Multi-tenant isolated)
 */
exports.getPaymentHistory = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await db.execute(`
            SELECT id, plan_name, billing_cycle, amount, currency, razorpay_order_id, razorpay_payment_id, payment_status, payment_method, error_description, created_at 
            FROM payment_transactions 
            WHERE company_id = ? 
            ORDER BY id DESC
        `, [companyId]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching payment history:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 6. Get Subscription Change History
 */
exports.getSubscriptionHistory = async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const [rows] = await db.execute(`
            SELECT * FROM subscription_history 
            WHERE company_id = ? 
            ORDER BY id DESC
        `, [companyId]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching subscription history:', err);
        res.status(500).json({ error: err.message });
    }
};
