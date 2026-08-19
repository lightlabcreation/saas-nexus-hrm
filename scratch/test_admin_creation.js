const axios = require('axios');
const db = require('../config/db');

async function test() {
    try {
        console.log('Logging in as superadmin...');
        const loginResponse = await axios.post('http://localhost:8081/api/login', {
            userId: 'kiaan@superadmin.com',
            password: 'superpassword'
        });

        const token = loginResponse.data.token;
        console.log('Login successful. Token acquired.');

        console.log('Creating/updating company admin via superadmin API...');
        const response = await axios.put('http://localhost:8081/api/superadmin/company/1', {
            company_name: 'Kiaan Corp',
            owner_name: 'Kiaan Admin',
            email: 'kiaan@admin.com',
            phone: '+1234567890',
            plan: 'Free Trial',
            employee_limit: 50,
            status: 'active',
            password: 'adminpassword'
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log('Update response status:', response.status);
        console.log('Update response data:', response.data);

        // Verify in DB
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', ['kiaan@admin.com']);
        console.log('Admin User created:', users);

        if (users.length > 0 && users[0].role === 'admin' && users[0].company_id === 1) {
            console.log('🎉 SUCCESS: Admin created successfully for company 1!');
        } else {
            console.error('❌ FAILURE: Admin creation failed. User detail in DB:', users);
        }
        process.exit(0);
    } catch(e) {
        console.error('❌ Error testing admin creation:', e.response ? e.response.data : e.message);
        process.exit(1);
    }
}

test();
