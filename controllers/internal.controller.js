const db = require('../config/db');
const bcrypt = require('bcryptjs');

exports.provisionCompany = async (req, res) => {
    const { companyName, email, password, phone, planName } = req.body;

    if (!companyName || !email || !password) {
        return res.status(400).json({ message: 'companyName, email, and password are required' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Check if email already exists in users or companies
        const [existingUsers] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'Email already registered as a user' });
        }
        
        const [existingCompanies] = await connection.execute('SELECT id FROM companies WHERE email = ?', [email]);
        if (existingCompanies.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'Email already registered as a company' });
        }

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Create Company
        // Using some default values for auto-provisioned companies
        const ownerName = companyName + ' Admin';
        const [companyResult] = await connection.execute(
            'INSERT INTO companies (company_name, owner_name, email, phone, plan, status) VALUES (?, ?, ?, ?, ?, ?)',
            [companyName, ownerName, email, phone || '', planName || 'Basic', 'active']
        );
        const companyId = companyResult.insertId;

        // 4. Create Admin User
        const [userResult] = await connection.execute(
            'INSERT INTO users (name, email, password, role, company_id) VALUES (?, ?, ?, ?, ?)',
            [ownerName, email, hashedPassword, 'admin', companyId]
        );
        const userId = userResult.insertId;

        await connection.commit();

        res.status(201).json({ 
            message: 'Company provisioned successfully', 
            companyId: companyId,
            userId: userId
        });
    } catch (err) {
        await connection.rollback();
        console.error('Provisioning Error:', err);
        res.status(500).json({ message: 'Server error during provisioning', error: err.message });
    } finally {
        connection.release();
    }
};

exports.toggleStatus = async (req, res) => {
    const { email, status } = req.body;

    if (!email || !status) {
        return res.status(400).json({ message: 'email and status are required' });
    }

    if (!['active', 'suspended', 'inactive'].includes(status.toLowerCase())) {
        return res.status(400).json({ message: 'Invalid status. Use active or suspended/inactive' });
    }
    
    // Map suspended to inactive if the DB schema uses inactive
    const dbStatus = (status.toLowerCase() === 'suspended') ? 'inactive' : status.toLowerCase();

    try {
        const [company] = await db.execute('SELECT id FROM companies WHERE email = ?', [email]);
        
        if (company.length === 0) {
            return res.status(404).json({ message: 'Company not found for the provided email' });
        }

        const companyId = company[0].id;

        await db.execute('UPDATE companies SET status = ? WHERE id = ?', [dbStatus, companyId]);

        res.status(200).json({ 
            message: `Company status successfully updated to ${dbStatus}`
        });
    } catch (err) {
        console.error('Toggle Status Error:', err);
        res.status(500).json({ message: 'Server error during status toggle', error: err.message });
    }
};
