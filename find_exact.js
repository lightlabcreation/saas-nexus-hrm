const fs = require('fs');
const content = fs.readFileSync('node_modules/@google/genai/dist/index.cjs', 'utf-8');
const lines = content.split('\n');
console.log("Searching for 'Only systemInstruction'...");
for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('only systeminstruction')) {
        console.log(`MATCH FOUND AT LINE ${i + 1}:`);
        for (let j = Math.max(0, i - 15); j <= Math.min(lines.length - 1, i + 15); j++) {
            console.log(`${j + 1}: ${lines[j]}`);
        }
        break;
    }
}
