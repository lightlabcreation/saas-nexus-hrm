const db = require('../config/db');
const bcrypt = require('bcryptjs');

// Helper: treat 'admin', 'Master Admin', 'hr', and 'hr admin' as admin roles
const isAdmin = (role) => {
    if (!role) return false;
    const r = role.toLowerCase();
    return r === 'admin' || r === 'master admin' || r === 'hr' || r === 'hr admin';
};

// Get the next available IDs for new employee (Scoped per company)
exports.getNextIds = async (req, res) => {
    try {
        let customSql = "SELECT custom_id FROM employees WHERE custom_id REGEXP '^[0-9]+$'";
        let machineSql = "SELECT machine_id FROM employees WHERE machine_id REGEXP '^[0-9]+$'";
        let params = [];

        if (req.user && req.user.company_id) {
            customSql += " AND company_id = ?";
            machineSql += " AND company_id = ?";
            params.push(req.user.company_id);
        }

        customSql += " ORDER BY CAST(custom_id AS UNSIGNED) DESC LIMIT 1";
        machineSql += " ORDER BY CAST(machine_id AS UNSIGNED) DESC LIMIT 1";

        const [[lastEmp]] = await db.execute(customSql, params);
        const nextCustomId = lastEmp && lastEmp.custom_id ? (parseInt(lastEmp.custom_id) + 1) : 1001;

        const [[lastMachine]] = await db.execute(machineSql, params);
        const nextMachineId = lastMachine && lastMachine.machine_id ? (parseInt(lastMachine.machine_id) + 1) : 1001;

        res.json({ nextCustomId, nextMachineId });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching next IDs', error: err.message });
    }
};

// Get all employees (Filtered by creator if admin)
exports.getAllEmployees = async (req, res) => {
    try {
        let query = `
            SELECT e.*, 
                   CASE WHEN fe.id IS NOT NULL THEN 1 ELSE 0 END as has_face_registered,
                   COALESCE((SELECT SUM(COALESCE(p.cpf_employee, p.uif_amount)) FROM payroll p WHERE p.employee_id = e.id AND p.status = 'paid'), 0) as total_uif_collected,
                   COALESCE((SELECT SUM(COALESCE(p.cpf_employee, p.uif_amount)) FROM payroll p WHERE p.employee_id = e.id AND p.status = 'paid'), 0) as total_cpf_employee,
                   COALESCE((SELECT SUM(COALESCE(p.cpf_employer, 0)) FROM payroll p WHERE p.employee_id = e.id AND p.status = 'paid'), 0) as total_cpf_employer,
                   COALESCE((SELECT SUM(COALESCE(p.cpf_total, COALESCE(p.cpf_employee, p.uif_amount))) FROM payroll p WHERE p.employee_id = e.id AND p.status = 'paid'), 0) as total_cpf_total
            FROM employees e
            LEFT JOIN face_embeddings fe ON e.id = fe.employee_id
            WHERE 1=1
        `;
        let params = [];

        if (req.user.role !== 'MasterAdmin') {
            query += ' AND e.company_id = ?';
            params.push(req.user.company_id);
        }

        query += ' ORDER BY e.created_at DESC';

        const [rows] = await db.execute(query, params);
        res.json(rows);
    } catch (err) {
        console.error('❌ SQL Error (getAllEmployees):', err);
        res.status(500).json({ message: 'Error fetching employees', error: err.message });
    }
};

// Add new employee / staff / admin
exports.addEmployee = async (req, res) => {
    const {
        machine_id, custom_id, name, role, department, shift, email, phone,
        salary_rate, salary_type, password, joined_date, date_of_birth,
        uif_number, advance_balance, signature, is_uif_registered
    } = req.body;

    console.log('📝 Add Employee Request. Signature received:', signature ? (signature.length + ' chars') : 'NO');

    // User who is creating this record
    const creatorId = req.user.id;

    // Use uploaded file if present
    let photo = req.body.photo;
    if (req.file) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        photo = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    try {
        // --- 0. Enforce Employee Limit ---
        if (req.user.company_id) {
            const [compRows] = await db.execute('SELECT employee_limit FROM companies WHERE id = ?', [req.user.company_id]);
            if (compRows.length > 0 && compRows[0].employee_limit > 0) {
                const limit = compRows[0].employee_limit;
                const [countRows] = await db.execute('SELECT COUNT(*) as count FROM employees WHERE company_id = ?', [req.user.company_id]);
                if (countRows[0].count >= limit) {
                    return res.status(403).json({ message: `Plan limit reached. Your plan allows up to ${limit} employees. Please upgrade your plan to add more.` });
                }
            }
        }

        // --- 1. Auto Generate Magic Numbers (Scoped per Company) ---
        let customSql = "SELECT custom_id FROM employees WHERE custom_id REGEXP '^[0-9]+$'";
        let machineSql = "SELECT machine_id FROM employees WHERE machine_id REGEXP '^[0-9]+$'";
        let idParams = [];

        if (req.user && req.user.company_id) {
            customSql += " AND company_id = ?";
            machineSql += " AND company_id = ?";
            idParams.push(req.user.company_id);
        }

        customSql += " ORDER BY CAST(custom_id AS UNSIGNED) DESC LIMIT 1";
        machineSql += " ORDER BY CAST(machine_id AS UNSIGNED) DESC LIMIT 1";

        const [[lastEmp]] = await db.execute(customSql, idParams);
        const nextCustomId = lastEmp && lastEmp.custom_id ? (parseInt(lastEmp.custom_id) + 1) : 1001;

        const [[lastMachine]] = await db.execute(machineSql, idParams);
        const nextMachineId = lastMachine && lastMachine.machine_id ? (parseInt(lastMachine.machine_id) + 1) : 1001;

        const finalCustomId = custom_id || nextCustomId.toString();

        // 1.5 Check for duplicate Employee ID
        const [dupCheck] = await db.execute('SELECT id FROM employees WHERE custom_id = ? AND company_id = ?', [finalCustomId, req.user.company_id]);
        if (dupCheck.length > 0) {
            return res.status(400).json({ message: `Employee ID ${finalCustomId} is already in use. Please use a unique ID.` });
        }

        // 2. Insert into employees table
        const formattedJoinedDate = joined_date ? joined_date.split('T')[0] : new Date().toISOString().split('T')[0];

        // Ensure role is valid — normalize if it's an admin variant
        const dbRole = isAdmin(role) ? role.toLowerCase() : 'employee';
        const dbShift = ['Morning Shift', 'Evening Shift', 'Night Shift'].includes(shift) ? shift : 'Morning Shift';
        const dbSalaryType = ['hourly', 'daily', 'monthly'].includes(salary_type) ? salary_type : 'hourly';

        const empSql = 'INSERT INTO employees (machine_id, custom_id, name, role, department, shift, email, phone, salary_rate, salary_type, joined_date, date_of_birth, photo, uif_number, advance_balance, signature, created_by, is_uif_registered, company_id, assigned_branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const formattedDOB = date_of_birth ? date_of_birth.split('T')[0] : null;
        const empValues = [
            nextMachineId.toString(),
            finalCustomId,
            name || '',
            dbRole,
            department || 'General',
            dbShift,
            email || '',
            phone || '',
            parseFloat(salary_rate) || 0,
            dbSalaryType,
            formattedJoinedDate,
            formattedDOB,
            photo || null,
            uif_number || '',
            parseFloat(advance_balance) || 0,
            signature || null,
            creatorId,
            (is_uif_registered === 'true' || is_uif_registered === true || is_uif_registered === 1 || is_uif_registered === '1') ? 1 : 0,
            req.user.company_id,
            req.body.assigned_branch || null
        ];

        console.log('📝 Saving Signature to DB. Length:', signature ? signature.length : 'EMPTY');

        console.log('📝 Executing SQL (Add Employee):', empSql, 'Params:', empValues);
        const [empResult] = await db.execute(empSql, empValues);

        const employeeId = empResult.insertId;
        const hashedPassword = await bcrypt.hash(password || '123456', 10);

        // 3. Create login user
        const finalRole = isAdmin(role) ? role.toLowerCase() : 'employee';
        const userSql = 'INSERT INTO users (employee_id, email, password, role, name, created_by, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const userValues = [employeeId, email || '', hashedPassword, finalRole, name || '', creatorId, req.user.company_id];

        console.log('📝 Executing SQL (Create User):', userSql, 'Params:', userValues);
        await db.execute(userSql, userValues);

        res.status(201).json({ message: 'Personnel added successfully', id: employeeId });
    } catch (err) {
        console.error('❌ SQL Error (addEmployee):', err);
        if (err.code === 'ER_DUP_ENTRY') {
            const field = err.message.includes('machine_id') ? 'Machine ID' : 'Email';
            return res.status(400).json({ message: `Duplicate entry: This ${field} is already assigned to another employee.` });
        }
        res.status(500).json({ message: 'Error adding personnel', error: err.message });
    }
};

// Get single employee details
exports.getEmployeeById = async (req, res) => {
    try {
        const sql = 'SELECT * FROM employees WHERE id = ?';
        console.log('📝 Executing SQL:', sql, 'Params:', [req.params.id]);
        const [rows] = await db.execute(sql, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Not found' });

        // Safety: If regular admin (not Master Admin), check if they own this record
        if (req.user.role !== 'MasterAdmin' && rows[0].company_id !== req.user.company_id) {
            return res.status(403).json({ message: 'Access denied to this record' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('❌ SQL Error (getEmployeeById):', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// Update employee
exports.updateEmployee = async (req, res) => {
    const { id } = req.params;
    const data = req.body;

    console.log('📝 Incoming Employee Update Request - ID:', id);
    console.log('📝 Data Received:', JSON.stringify(data, null, 2));

    // Handle Profile Image Upload
    let photo = data.photo;
    if (req.file) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        photo = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    try {
        // 1. Safety Check: Verify ownership if admin
        const [existing] = await db.execute('SELECT company_id FROM employees WHERE id = ?', [id]);
        if (existing.length === 0) return res.status(404).json({ message: 'Employee not found' });

        if (req.user.role !== 'MasterAdmin' && existing[0].company_id !== req.user.company_id) {
            return res.status(403).json({ message: 'Cannot edit staff from another company' });
        }

        // 2. Build Dynamic Update for Employees Table
        const empUpdates = [];
        const empParams = [];

        const empFields = [
            'machine_id', 'custom_id', 'name', 'role', 'department', 'shift',
            'email', 'phone', 'salary_rate', 'salary_type', 'uif_number',
            'advance_balance', 'advance_installment', 'status', 'assigned_branch'
        ];

        // Handle date_of_birth separately (needs date formatting)
        if (data.date_of_birth !== undefined) {
            const dobVal = data.date_of_birth ? data.date_of_birth.split('T')[0] : null;
            empUpdates.push('`date_of_birth` = ?');
            empParams.push(dobVal);
        }

        empFields.forEach(field => {
            if (data[field] !== undefined) {
                empUpdates.push(`\`${field}\` = ?`);
                let val = data[field] === '' ? null : data[field];

                // Ensure numeric fields are numbers or null
                if (field === 'salary_rate' || field === 'advance_balance' || field === 'advance_installment') {
                    if (val === null) {
                        val = null;
                    } else {
                        const parsed = parseFloat(val);
                        val = isNaN(parsed) ? 0 : parsed;
                    }
                }

                // Map/Validate ENUM fields
                if (field === 'role') val = isAdmin(val) ? val.toLowerCase() : 'employee';
                if (field === 'shift') {
                    const validShifts = ['Morning Shift', 'Evening Shift', 'Night Shift'];
                    if (!validShifts.includes(val)) val = 'Morning Shift';
                }
                if (field === 'status') {
                    const validStatus = ['active', 'on_leave', 'terminated'];
                    if (!validStatus.includes(val)) val = 'active';
                }
                if (field === 'salary_type') {
                    const validTypes = ['hourly', 'daily', 'monthly'];
                    if (!validTypes.includes(val)) val = 'hourly';
                }

                empParams.push(val);
            }
        });

        if (photo !== undefined) { empUpdates.push('`photo` = ?'); empParams.push(photo); }
        if (data.signature !== undefined) { 
            console.log('📝 Updating Signature. Length:', data.signature ? data.signature.length : 0);
            empUpdates.push('`signature` = ?'); 
            empParams.push(data.signature); 
        }
        if (data.is_uif_registered !== undefined) {
            const isUif = data.is_uif_registered === 'true' || data.is_uif_registered === true || data.is_uif_registered === 1 || data.is_uif_registered === '1';
            empUpdates.push('`is_uif_registered` = ?');
            empParams.push(isUif ? 1 : 0);
        }
        if (data.joined_date) { empUpdates.push('`joined_date` = ?'); empParams.push(data.joined_date.split('T')[0]); }

        if (empUpdates.length > 0) {
            const empQuery = `UPDATE employees SET ${empUpdates.join(', ')} WHERE id = ?`;
            empParams.push(id);
            console.log('📝 Executing SQL (Update Employee):', empQuery, 'Params:', empParams);
            await db.execute(empQuery, empParams);
        }

        // 3. Sync to Users Table (if relevant fields provided)
        const userUpdates = [];
        const userParams = [];

        if (data.email) {
            userUpdates.push('email = ?');
            userParams.push(data.email);
        }
        if (data.name) { 
            userUpdates.push('name = ?'); 
            userParams.push(data.name); 
            try {
                await db.execute('UPDATE kpis SET employee_name = ? WHERE employee_id = ?', [data.name, id]);
                await db.execute('UPDATE leaves SET employee_name = ? WHERE employee_id = ?', [data.name, id]);
                await db.execute('UPDATE claims SET employee_name = ? WHERE employee_id = ?', [data.name, id]);
            } catch (e) {
                console.warn('Failed to sync employee name to related tables:', e.message);
            }
        }
        if (photo) { userUpdates.push('photo = ?'); userParams.push(photo); }
        if (data.role) { userUpdates.push('role = ?'); userParams.push(isAdmin(data.role) ? data.role.toLowerCase() : 'employee'); }

        if (data.password && data.password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(data.password, 10);
            userUpdates.push('password = ?');
            userParams.push(hashedPassword);
        }

        // Ensure a user record exists for this employee_id
        const [existingUser] = await db.execute('SELECT id FROM users WHERE employee_id = ?', [id]);
        if (existingUser.length === 0) {
            const [empData] = await db.execute('SELECT * FROM employees WHERE id = ?', [id]);
            if (empData.length > 0) {
                const emp = empData[0];
                const pwd = (data.password && data.password.trim() !== '') ? await bcrypt.hash(data.password, 10) : await bcrypt.hash('12345678', 10);
                await db.execute(
                    'INSERT INTO users (employee_id, email, password, role, name, created_by, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [id, emp.email || '', pwd, emp.role || 'employee', emp.name || '', emp.created_by, emp.company_id]
                );
            }
        } else if (userUpdates.length > 0) {
            const userQuery = `UPDATE users SET ${userUpdates.join(', ')} WHERE employee_id = ?`;
            userParams.push(id);
            console.log('📝 Executing SQL (Sync User):', userQuery, 'Params:', userParams);
            await db.execute(userQuery, userParams);
        }

        res.json({ message: 'Record updated successfully' });
    } catch (err) {
        console.error('❌ SQL Error (updateEmployee):', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Duplicate entry: Machine ID or Email already exists', error: err.message });
        }
        res.status(500).json({ message: 'Error updating record', error: err.message });
    }
};

// Delete employee
exports.deleteEmployee = async (req, res) => {
    const { id } = req.params;
    try {
        // Prevent deleting oneself
        if (req.user.employee_id && String(req.user.employee_id) === String(id)) {
            return res.status(403).json({ message: 'You cannot delete your own account.' });
        }

        // Safety: If admin, verify ownership
        const [existing] = await db.execute('SELECT company_id FROM employees WHERE id = ?', [id]);
        if (existing.length > 0 && req.user.role !== 'MasterAdmin' && existing[0].company_id !== req.user.company_id) {
            return res.status(403).json({ message: 'Cannot delete records from another company' });
        }

        const userSql = 'DELETE FROM users WHERE employee_id = ?';
        console.log('📝 Executing SQL:', userSql, 'Params:', [id]);
        await db.execute(userSql, [id]);

        const empSql = 'DELETE FROM employees WHERE id = ?';
        console.log('📝 Executing SQL:', empSql, 'Params:', [id]);
        const [result] = await db.execute(empSql, [id]);

        if (result.affectedRows === 0) return res.status(404).json({ message: 'Record not found' });
        res.json({ message: 'Record deleted successfully' });
    } catch (err) {
        console.error('❌ SQL Error (deleteEmployee):', err);
        res.status(500).json({ message: 'Error deleting record', error: err.message });
    }
};

exports.adminResetPassword = async (req, res) => {
    try {
        const employeeId = req.params.id;
        const companyId = req.user.company_id;

        // Security check: ensure the employee belongs to the admin's company
        const [empCheck] = await db.execute('SELECT id, name FROM employees WHERE id = ? AND company_id = ?', [employeeId, companyId]);
        if (empCheck.length === 0) {
            return res.status(404).json({ message: 'Employee not found or access denied' });
        }

        // Generate a random 8-character password
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#*';
        let tempPassword = 'Nx';
        for (let i = 0; i < 6; i++) {
            tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Update the user's password
        const [updateResult] = await db.execute(
            'UPDATE users SET password = ? WHERE employee_id = ?',
            [hashedPassword, employeeId]
        );

        if (updateResult.affectedRows === 0) {
            // Auto-heal: User row missing for employee, create it now!
            const [fullEmp] = await db.execute('SELECT * FROM employees WHERE id = ?', [employeeId]);
            if (fullEmp.length > 0) {
                const emp = fullEmp[0];
                await db.execute(
                    'INSERT INTO users (employee_id, email, password, role, name, created_by, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [employeeId, emp.email || '', hashedPassword, emp.role || 'employee', emp.name || '', emp.created_by, emp.company_id]
                );
            }
        }

        res.json({ 
            message: 'Password reset successfully', 
            tempPassword: tempPassword,
            employeeName: empCheck[0].name
        });
    } catch (err) {
        console.error('❌ Error resetting password:', err);
        res.status(500).json({ message: 'Error resetting password', error: err.message });
    }
};
