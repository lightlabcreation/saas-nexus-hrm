const axios = require('axios');

async function test() {
    try {
        const res = await axios.post('http://localhost:3000/api/chatbot', {
            message: 'My Attendance Today',
            context: {
                userRole: 'employee',
                currentPage: '/employee/dashboard',
                companyId: 1
            }
        });
        console.log("Success Employee:", res.data);
    } catch (e) {
        console.error("Error Employee:", e.response ? e.response.data : e.message);
    }

    try {
        const res2 = await axios.post('http://localhost:3000/api/chatbot', {
            message: 'Active Locations',
            context: {
                userRole: 'admin',
                currentPage: '/admin/dashboard',
                companyId: 1
            }
        });
        console.log("Success Admin:", res2.data);
    } catch (e) {
        console.error("Error Admin:", e.response ? e.response.data : e.message);
    }
}
test();
