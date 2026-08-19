require('dotenv').config();
const { handleMessage } = require('./controllers/chatbot.controller');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'biotrack_secret_key_2026_pro';
const token = jwt.sign({ id: 1, role: 'superadmin' }, SECRET);

const req = {
    body: {
        message: 'Total Companies',
        context: { userRole: 'superadmin', currentPage: '/superadmin' }
    },
    headers: { authorization: `Bearer ${token}` }
};

const res = {
    status(code) { this.code = code; return this; },
    json(data) { console.log(`[STATUS ${this.code || 200}]`, data); }
};

async function testRepeat() {
    console.log("=== RUNNING REPEATED INTEGRATION TESTS (UNCACHED) ===");
    const prompts = [
        'Total Companies',
        'Platform Revenue',
        'Active Subscriptions',
        'Pending Plan Requests',
        'Total Companies registered?'
    ];
    for (let i = 1; i <= 5; i++) {
        console.log(`\n--- Iteration ${i}: "${prompts[i-1]}" ---`);
        const reqLoop = {
            body: {
                message: prompts[i-1],
                context: { userRole: 'superadmin', currentPage: '/superadmin' }
            },
            headers: { authorization: `Bearer ${token}` }
        };
        try {
            await handleMessage(reqLoop, res);
        } catch (e) {
            console.error(`Iteration ${i} crashed:`, e);
        }
        // Small delay of 1.5 seconds to mock user typing speed
        await new Promise(r => setTimeout(r, 1500));
    }
}
testRepeat();
