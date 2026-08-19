const db = require('../config/db');

exports.getGeofences = async (req, res) => {
    try {
        const { company_id } = req.user;
        const [geofences] = await db.execute(
            'SELECT * FROM geofences WHERE company_id = ? ORDER BY created_at DESC',
            [company_id]
        );
        res.json(geofences);
    } catch (err) {
        console.error('Error fetching geofences:', err);
        res.status(500).json({ message: 'Server error fetching geofences', error: err.message });
    }
};

exports.getAssignedGeofence = async (req, res) => {
    try {
        const { company_id, employee_id } = req.user;

        if (!employee_id) {
            return res.status(400).json({ message: 'User is not an employee' });
        }

        // Get employee's assigned branch
        const [employees] = await db.execute(
            'SELECT assigned_branch FROM employees WHERE id = ? AND company_id = ?',
            [employee_id, company_id]
        );

        if (employees.length === 0 || !employees[0].assigned_branch) {
            // Return the first active geofence as fallback if no branch assigned
            const [geofences] = await db.execute(
                'SELECT * FROM geofences WHERE company_id = ? AND status = "Active" LIMIT 1',
                [company_id]
            );
            return res.json(geofences[0] || null);
        }

        const assignedBranch = employees[0].assigned_branch;

        // Find geofence by branch name
        const [geofences] = await db.execute(
            'SELECT * FROM geofences WHERE company_id = ? AND name = ? AND status = "Active"',
            [company_id, assignedBranch]
        );

        res.json(geofences[0] || null);

    } catch (err) {
        console.error('Error fetching assigned geofence:', err);
        res.status(500).json({ message: 'Server error fetching assigned geofence', error: err.message });
    }
};

exports.createGeofence = async (req, res) => {
    try {
        const { company_id } = req.user;
        const { name, address, latitude, longitude, radius, status } = req.body;

        const [result] = await db.execute(
            'INSERT INTO geofences (company_id, name, address, latitude, longitude, radius, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [company_id, name, address, latitude, longitude, radius || 100, status || 'Active']
        );

        res.json({ message: 'Geofence created successfully', id: result.insertId });
    } catch (err) {
        console.error('Error creating geofence:', err);
        res.status(500).json({ message: 'Server error creating geofence', error: err.message });
    }
};

exports.updateGeofence = async (req, res) => {
    try {
        const { id } = req.params;
        const { company_id } = req.user;
        const { name, address, latitude, longitude, radius, status } = req.body;

        await db.execute(
            'UPDATE geofences SET name = ?, address = ?, latitude = ?, longitude = ?, radius = ?, status = ? WHERE id = ? AND company_id = ?',
            [name, address, latitude, longitude, radius, status, id, company_id]
        );

        res.json({ message: 'Geofence updated successfully' });
    } catch (err) {
        console.error('Error updating geofence:', err);
        res.status(500).json({ message: 'Server error updating geofence', error: err.message });
    }
};

exports.deleteGeofence = async (req, res) => {
    try {
        const { id } = req.params;
        const { company_id } = req.user;

        await db.execute(
            'DELETE FROM geofences WHERE id = ? AND company_id = ?',
            [id, company_id]
        );

        res.json({ message: 'Geofence deleted successfully' });
    } catch (err) {
        console.error('Error deleting geofence:', err);
        res.status(500).json({ message: 'Server error deleting geofence', error: err.message });
    }
};
