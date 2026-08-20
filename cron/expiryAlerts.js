const cron = require('node-cron');
const db = require('../config/db');
const notificationsUtil = require('../utils/notifications');

const runExpiryChecks = async () => {
    try {
        // Fetch latest active subscriptions with company details
        const [subscriptions] = await db.execute(`
            SELECT s.company_id, s.plan_name, s.end_date, s.billing_cycle, c.company_name 
            FROM subscriptions s 
            JOIN companies c ON s.company_id = c.id 
            WHERE c.status = 'active' 
            AND s.id = (SELECT MAX(id) FROM subscriptions WHERE company_id = c.id)
        `);
        
        for (let sub of subscriptions) {
            if (!sub.end_date) continue;

            const endDate = new Date(sub.end_date);
            const today = new Date();
            const endMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

            const diffTime = endMidnight - todayMidnight;
            const daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));

            const planName = (sub.plan_name || '').toLowerCase();
            const isTrial = planName.includes('free') || planName.includes('trial') || (sub.billing_cycle || '').toLowerCase() === 'weekly';

            // Free Trial: ONLY alert when 1 day is left
            if (isTrial) {
                if (daysLeft === 1) {
                    // Notify Company Admin
                    await notificationsUtil.createNotification({
                        company_id: sub.company_id,
                        title: 'Free Trial Expiring Tomorrow',
                        message: `Your Free Trial for ${sub.company_name} expires tomorrow! Please purchase a paid plan to continue uninterrupted access.`,
                        type: 'warning'
                    });
                    // Notify SuperAdmin
                    await notificationsUtil.createNotification({
                        company_id: null,
                        title: 'Free Trial Expiring Tomorrow',
                        message: `${sub.company_name}'s Free Trial will expire tomorrow.`,
                        type: 'info'
                    });
                }
                continue;
            }

            // Paid Plans: Standard alerts for 7, 3, and 1 day left
            if (daysLeft === 7) {
                await notificationsUtil.createNotification({
                    company_id: sub.company_id,
                    title: 'Subscription Expiring Soon (7 Days)',
                    message: `Your subscription for ${sub.company_name} will expire in 7 days. Please renew to avoid interruption.`,
                    type: 'warning'
                });
                await notificationsUtil.createNotification({
                    company_id: null,
                    title: 'Company Subscription Expiring Soon',
                    message: `${sub.company_name}'s subscription will expire in 7 days.`,
                    type: 'warning'
                });
            } else if (daysLeft === 3) {
                await notificationsUtil.createNotification({
                    company_id: sub.company_id,
                    title: 'Subscription Expiring in 3 Days',
                    message: `Your subscription for ${sub.company_name} will expire in 3 days. Please renew immediately.`,
                    type: 'warning'
                });
                await notificationsUtil.createNotification({
                    company_id: null,
                    title: 'Company Subscription Expiring in 3 Days',
                    message: `${sub.company_name}'s subscription will expire in 3 days.`,
                    type: 'warning'
                });
            } else if (daysLeft === 1) {
                await notificationsUtil.createNotification({
                    company_id: sub.company_id,
                    title: 'Subscription Expires Tomorrow',
                    message: `URGENT: Your subscription for ${sub.company_name} expires tomorrow! All access will be restricted upon expiry.`,
                    type: 'error'
                });
                await notificationsUtil.createNotification({
                    company_id: null,
                    title: 'Company Subscription Expires Tomorrow',
                    message: `URGENT: ${sub.company_name}'s subscription expires tomorrow!`,
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
