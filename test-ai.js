require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey });
    
    const models = [
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-1.0-pro',
        'gemini-pro',
        'gemini-1.5-flash-8b',
        'gemini-2.0-flash'
    ];

    for (const modelName of models) {
        console.log(`\nTesting Model: ${modelName}`);
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
            });
            console.log(`✅ SUCCESS with ${modelName}`);
            return;
        } catch (err) {
            console.error(`❌ FAILED with ${modelName}:`, err.message);
        }
    }
}

test();
