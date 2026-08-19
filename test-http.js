const axios = require('axios');

async function test() {
    try {
        const res = await axios.post('http://localhost:3000/api/chatbot', {
            message: 'Total Employees',
            context: {
                userRole: 'admin',
                currentPage: '/admin/settings',
                companyId: 1
            }
        });
        console.log("Success:", res.data);
    } catch (e) {
        console.error("Error:", e.response ? e.response.data : e.message);
    }
}
test();
