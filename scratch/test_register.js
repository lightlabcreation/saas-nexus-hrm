const axios = require('axios');
const db = require('../config/db');

async function test() {
    try {
        console.log('Sending registration request...');
        const response = await axios.post('http://localhost:8081/api/register', {
            companyName: 'Kiaan Corp',
            adminName: 'Kiaan Superadmin',
            email: 'kiaan@superadmin.com',
            password: 'superpassword',
            planName: 'Free Trial',
            price: '$0',
            duration: '7 days'
        });

        console.log('Registration response status:', response.status);
        console.log('Registration response data:', response.data);

        // Verify in DB
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', ['kiaan@superadmin.com']);
        console.log('User created:', users);

        const [companies] = await db.execute('SELECT * FROM companies WHERE email = ?', ['kiaan@superadmin.com']);
        console.log('Company created:', companies);

        if (users.length > 0 && users[0].role === 'superadmin') {
            console.log('🎉 SUCCESS: User registered as superadmin!');
        } else {
            console.error('❌ FAILURE: User was not registered as superadmin. Role is:', users[0] ? users[0].role : 'none');
        }
        process.exit(0);
    } catch(e) {
        console.error('❌ Error testing registration:', e.response ? e.response.data : e.message);
        process.exit(1);
    }
}

test();
