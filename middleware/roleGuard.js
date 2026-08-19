/**
 * Role Guard Middleware Factory
 * Restricts route access to specific roles.
 * 
 * Usage:
 *   const { adminOnly, employeeOnly, superadminOnly } = require('./roleGuard');
 *   router.post('/payroll/generate', auth, adminOnly, controller.generatePayroll);
 */

const isAdminRole = (role) => {
    if (!role) return false;
    const r = role.toLowerCase();
    return r === 'admin' || r === 'master admin' || r === 'hr' || r === 'hr admin' || r === 'superadmin';
};

const isSuperadminRole = (role) => {
    if (!role) return false;
    const r = role.toLowerCase();
    return r === 'superadmin' || r.includes('master');
};

/**
 * Only allows admin, master admin, hr, and superadmin roles
 */
const adminOnly = (req, res, next) => {
    if (!req.user || !isAdminRole(req.user.role)) {
        return res.status(403).json({ 
            message: 'Access denied. Admin privileges required.',
            code: 'ADMIN_REQUIRED'
        });
    }
    next();
};

/**
 * Only allows employee role
 */
const employeeOnly = (req, res, next) => {
    if (!req.user || req.user.role?.toLowerCase() !== 'employee') {
        return res.status(403).json({ 
            message: 'Access denied. Employee access only.',
            code: 'EMPLOYEE_REQUIRED'
        });
    }
    next();
};

/**
 * Only allows superadmin or master admin roles
 */
const superadminOnly = (req, res, next) => {
    if (!req.user || !isSuperadminRole(req.user.role)) {
        return res.status(403).json({ 
            message: 'Access denied. SuperAdmin privileges required.',
            code: 'SUPERADMIN_REQUIRED'
        });
    }
    next();
};

/**
 * Custom role check — pass an array of allowed roles
 * Usage: requireRole(['admin', 'hr'])
 */
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ message: 'Access denied.' });
        }
        const userRole = req.user.role.toLowerCase();
        const normalized = allowedRoles.map(r => r.toLowerCase());
        
        if (!normalized.includes(userRole)) {
            return res.status(403).json({ 
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
                code: 'ROLE_REQUIRED'
            });
        }
        next();
    };
};

module.exports = { adminOnly, employeeOnly, superadminOnly, requireRole };
