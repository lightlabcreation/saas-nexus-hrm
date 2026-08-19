const { GoogleGenAI } = require('@google/genai');
require('dotenv').config({ path: '.env' });

async function run() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const adminTools = [
        { name: 'searchEmployees', description: 'Search employees', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } } } }
    ];

    let contents = [
        { role: 'user', parts: [{ text: "search for deepu" }] }
    ];

    try {
        console.log("Calling step 1...");
        let response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
            contents: contents,
            config: {
                tools: [{ functionDeclarations: adminTools }]
            }
        });

        let functionCalls = response.functionCalls || [];
        console.log("Function Calls:", JSON.stringify(functionCalls, null, 2));

        if (functionCalls.length > 0) {
            // Check if candidates[0].content is correct
            console.log("Model Parts:", JSON.stringify(response.candidates[0].content.parts, null, 2));
            contents.push({
                role: 'model',
                parts: response.candidates[0].content.parts
            });

            const functionResponseParts = [];
            for (const call of functionCalls) {
                // mock response
                const result = [{ id: 1001, name: "deepu" }]; // array!
                functionResponseParts.push({
                    functionResponse: {
                        name: call.name,
                        response: { result } // Wrapping in object to be safe? Let's test with just result first.
                    }
                });
            }

            contents.push({
                role: 'user',
                parts: functionResponseParts
            });
            
            console.log("Contents before step 2:", JSON.stringify(contents, null, 2));

            console.log("Calling step 2...");
            response = await ai.models.generateContent({
                model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
                contents: contents,
                config: {
                    tools: [{ functionDeclarations: adminTools }]
                }
            });

            console.log("Step 2 response:", response.text);
        }
    } catch (e) {
        console.error("DEBUG ERROR:", e);
    }
}

run();
