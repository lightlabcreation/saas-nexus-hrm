const axios = require('axios');

async function testPut() {
    try {
        const response = await axios.put('http://localhost:3000/api/leaves/4', {
            status: 'Approved'
        }, {
            headers: {
                Authorization: 'Bearer ' // I don't have token... I can't test this easily without token.
            }
        });
        console.log(response.data);
    } catch (e) {
        console.error(e.response?.data || e.message);
    }
}
