const { GoogleGenerativeAI } = require('@google/genai');

async function testKey() {
    try {
        const key = process.env.GEMINI_API_KEY;
        if (!key) {
            console.log("No key found in env");
            return;
        }
        // Use the REST API directly using fetch to be 100% sure without SDK version conflicts
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "Hello" }] }]
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            console.log("SUCCESS! The key works.");
            console.log(data.candidates[0].content.parts[0].text);
        } else {
            console.error("ERROR from Google API:");
            console.error(data);
        }
    } catch (e) {
        console.error("Script error:", e.message);
    }
}
testKey();
