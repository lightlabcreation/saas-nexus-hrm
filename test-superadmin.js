require('dotenv').config();
const { handleMessage } = require('./controllers/chatbot.controller');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'biotrack_secret_key_2026_pro';
// Superadmin user ID is 1
const token = jwt.sign({ id: 1, role: 'superadmin' }, SECRET);

const req = {
    body: {
        message: 'Total Companies ??',
        context: { userRole: 'superadmin', currentPage: '/superadmin' },
        history: [
            { role: 'model', content: "Welcome back, SuperAdmin! I'm your Platform Assistant..." }
        ]
    },
    headers: { authorization: `Bearer ${token}` }
};

const res = {
    status(code) { this.code = code; return this; },
    json(data) { console.log(`[STATUS ${this.code || 200}]`, data); }
};

async function run() {
    try {
        await handleMessage(req, res);
    } catch (e) {
        console.error("CRASHED:", e);
    }
}
run();
