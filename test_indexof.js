const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('node_modules/@google/genai/dist/index.cjs', 'utf-8');
const searchStr = 'Only systemInstruction.parts';
const index = content.indexOf(searchStr);
console.log("Index of string:", index);
if (index !== -1) {
    const lines = content.split(/\r?\n/);
    console.log("Lines split count:", lines.length);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(searchStr)) {
            console.log(`FOUND AT LINE ${i+1}: ${lines[i].trim()}`);
            for (let j = Math.max(0, i-5); j <= Math.min(lines.length-1, i+5); j++) {
                console.log(`  ${j+1}: ${lines[j]}`);
            }
        }
    }
} else {
    console.log("Not found.");
}
