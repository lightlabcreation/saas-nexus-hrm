const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function testGemini() {
  try {
    console.log("Testing current GEMINI_API_KEY:", process.env.GEMINI_API_KEY);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // testing a standard model

    const result = await model.generateContent("Hello, are you working?");
    const response = await result.response;
    const text = response.text();
    console.log("SUCCESS! Response from Gemini:", text);
  } catch (error) {
    console.error("ERROR testing Gemini:", error.message);
  }
}

testGemini();
