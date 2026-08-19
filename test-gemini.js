require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
    try {
        const chat = ai.chats.create({
            model: 'gemini-2.0-flash'
        });
        const response = await chat.sendMessage({ message: "Hello" });
        console.log("Success:", response.text);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
