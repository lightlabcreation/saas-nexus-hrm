/**
 * Subscription Guard Middleware
 * Blocks API access for expired tenant subscriptions.
 * Applied to protected routes so that even if a JWT is valid,
 * an expired company cannot access features.
 */
const db = require('../config/db');

const subscriptionGuard = async (req, res, next) => {
    try {
        // Skip for SuperAdmins — they manage the platform
        const role = req.user?.role?.toLowerCase() || '';
        if (role === 'superadmin' || role.includes('master')) {
            return next();
        }

        const companyId = req.user?.company_id;
        if (!companyId) {
            return next(); // No company context, let other middleware handle
        }

        // Check company status first
        const [companies] = await db.execute(
            'SELECT status, subscription_end FROM companies WHERE id = ?',
            [companyId]
        );

        if (companies.length === 0) {
            return res.status(403).json({ 
                message: 'Company not found. Access denied.',
                code: 'COMPANY_NOT_FOUND'
            });
        }

        const company = companies[0];

        // Check if company is inactive/suspended
        if (company.status && company.status.toLowerCase() !== 'active') {
            return res.status(403).json({ 
                message: 'Your company account has been suspended. Please contact support.',
                code: 'COMPANY_SUSPENDED'
            });
        }

        // Fetch latest subscription to determine true end date
        const [subs] = await db.execute(
            'SELECT created_at, end_date, billing_cycle FROM subscriptions WHERE company_id = ? ORDER BY id DESC LIMIT 1',
            [companyId]
        );

        let endDate = null;
        if (subs.length > 0) {
            const latestSub = subs[0];
            if (latestSub.end_date) {
                endDate = new Date(latestSub.end_date);
            } else if (latestSub.created_at) {
                endDate = new Date(latestSub.created_at);
                const addDays = latestSub.billing_cycle === 'annually' ? 365 : 30;
                endDate.setDate(endDate.getDate() + addDays);
            }
        } else if (company.subscription_end) {
            endDate = new Date(company.subscription_end);
        }

        // Check subscription expiry
        if (endDate) {
            endDate.setHours(23, 59, 59, 999);
            if (endDate < new Date()) {
                return res.status(403).json({ 
                    message: 'Your subscription has expired. Please renew to continue using the service.',
                    code: 'SUBSCRIPTION_EXPIRED'
                });
            }
        }

        next();
    } catch (err) {
        console.error('Subscription Guard Error:', err.message);
        // Don't block on guard errors — fail open but log
        next();
    }
};

module.exports = subscriptionGuard;
