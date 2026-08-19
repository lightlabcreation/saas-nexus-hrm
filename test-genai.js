const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

async function testSDK() {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: 'Say "YES if the key is working".'
        });
        console.log("SUCCESS! Output:");
        console.log(response.text);
    } catch (e) {
        console.error("SDK ERROR:", e.message);
    }
}
testSDK();
