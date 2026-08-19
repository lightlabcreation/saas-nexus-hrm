const axios = require('axios');
const db = require('../config/db');

async function test() {
    try {
        console.log('Logging in as Company Admin...');
        const loginResponse = await axios.post('http://localhost:8081/api/login', {
            userId: 'kiaan@admin.com',
            password: 'adminpassword'
        });

        const token = loginResponse.data.token;
        console.log('Login successful. Token acquired.');

        console.log('Creating personnel/employee via admin API...');
        const response = await axios.post('http://localhost:8081/api/employees', {
            custom_id: '1201',
            name: 'Kiaan Employee',
            role: 'employee',
            department: 'Development',
            shift: 'Morning Shift',
            email: 'kiaan@employee.com',
            phone: '+987654321',
            salary_rate: 150.00,
            salary_type: 'hourly',
            password: 'employeepassword',
            joined_date: '2026-05-25'
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log('Employee creation status:', response.status);
        console.log('Employee creation response:', response.data);

        // Verify in DB
        const [employees] = await db.execute('SELECT * FROM employees WHERE email = ?', ['kiaan@employee.com']);
        console.log('Employee created in DB:', employees);

        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', ['kiaan@employee.com']);
        console.log('User created in DB:', users);

        if (employees.length > 0 && users.length > 0 && users[0].role === 'employee' && users[0].employee_id === employees[0].id) {
            console.log('🎉 SUCCESS: Employee and User login successfully created by the Admin!');
        } else {
            console.error('❌ FAILURE: Employee creation verification failed.');
        }
        process.exit(0);
    } catch(e) {
        console.error('❌ Error testing employee creation:', e.response ? e.response.data : e.message);
        process.exit(1);
    }
}

test();
