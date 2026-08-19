const express = require('express');
const router = express.Router();
const superadminController = require('../controllers/superadmin.controller');
const { superAdminOnly } = require('../middleware/superAdmin.middleware');

router.use(superAdminOnly);

// Dashboard
router.get('/dashboard/stats', superadminController.getDashboardStats);

// Companies
router.get('/companies', superadminController.getCompanies);
router.post('/company', superadminController.createCompany);
router.put('/company/:id', superadminController.updateCompany);
router.delete('/company/:id', superadminController.deleteCompany);
router.post('/company/:id/reset-password', superadminController.resetCompanyPassword);
router.patch('/company/:id/status', superadminController.updateCompanyStatus);

// Billing
router.get('/billing/invoices', superadminController.getInvoices);
router.get('/billing/payments', superadminController.getPayments);
router.post('/billing/record-payment', superadminController.recordPayment);

// Company Requests
router.get('/requests', superadminController.getRequests);
router.put('/request/:id/accept', superadminController.acceptRequest);
router.put('/request/:id/reject', superadminController.rejectRequest);

// Plan Renewal Requests
router.get('/plan-requests', superadminController.getPlanRequests);
router.put('/plan-request/:id/:action', superadminController.handlePlanRequest);

// Plans Management
router.get('/plans', superadminController.getPlans);
router.post('/plan', superadminController.createPlan);
router.put('/plan/:id', superadminController.updatePlan);
router.delete('/plan/:id', superadminController.deletePlan);

// Analytics
router.get('/analytics/overview', superadminController.getAnalytics);

// Settings
router.get('/settings', superadminController.getSettings);
router.put('/settings', superadminController.updateSettings);

// Enquiries
router.get('/enquiries', superadminController.getEnquiries);
router.put('/enquiry/:id/resolve', superadminController.resolveEnquiry);
router.delete('/enquiry/:id', superadminController.deleteEnquiry);

module.exports = router;
