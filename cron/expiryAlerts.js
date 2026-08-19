const cron = require('node-cron');
const db = require('../config/db');
const notificationsUtil = require('../utils/notifications');

const runExpiryChecks = async () => {
    try {
        // Fetch all active companies
        const [companies] = await db.execute("SELECT id, company_name, created_at, subscription_end FROM companies WHERE status = 'active'");
        
        for (let comp of companies) {
            let endDateEnd = null;
            if (comp.subscription_end) {
                endDateEnd = new Date(comp.subscription_end);
                endDateEnd.setHours(23, 59, 59, 999);
            }

            if (!endDateEnd) continue;

            const timeDiff = endDateEnd - new Date();
            const daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

            // Determine if an alert needs to be sent
            if (daysLeft === 7) {
                // Notify Company
                await notificationsUtil.checkAndNotify('systemCompanyExpiry', {
                    company_id: comp.id,
                    title: 'Subscription Expiring Soon',
                    message: `Your subscription for ${comp.company_name} will expire in 7 days. Please renew to avoid interruption.`,
                    type: 'warning'
                });
                // Notify SuperAdmin
                await notificationsUtil.checkAndNotify('systemCompanyExpiry', {
                    company_id: null,
                    title: 'Company Subscription Expiring Soon',
                    message: `${comp.company_name}'s subscription will expire in 7 days.`,
                    type: 'warning'
                });
            } else if (daysLeft === 3) {
                // Notify Company
                await notificationsUtil.checkAndNotify('systemExpiry3Day', {
                    company_id: comp.id,
                    title: 'Subscription Expiring in 3 Days',
                    message: `Your subscription for ${comp.company_name} will expire in 3 days. Please renew immediately.`,
                    type: 'warning'
                });
                // Notify SuperAdmin
                await notificationsUtil.checkAndNotify('systemExpiry3Day', {
                    company_id: null,
                    title: 'Company Subscription Expiring in 3 Days',
                    message: `${comp.company_name}'s subscription will expire in 3 days.`,
                    type: 'warning'
                });
            } else if (daysLeft === 1) {
                // Notify Company
                await notificationsUtil.checkAndNotify('systemExpiry1Day', {
                    company_id: comp.id,
                    title: 'Subscription Expires Tomorrow',
                    message: `URGENT: Your subscription for ${comp.company_name} expires tomorrow! All access will be restricted.`,
                    type: 'error'
                });
                // Notify SuperAdmin
                await notificationsUtil.checkAndNotify('systemExpiry1Day', {
                    company_id: null,
                    title: 'Company Subscription Expires Tomorrow',
                    message: `URGENT: ${comp.company_name}'s subscription expires tomorrow!`,
                    type: 'error'
                });
            }
        }
    } catch (err) {
        console.error("Cron Job Error (runExpiryChecks):", err);
    }
};

// Run every day at midnight
cron.schedule('0 0 * * *', runExpiryChecks);

module.exports = runExpiryChecks;
