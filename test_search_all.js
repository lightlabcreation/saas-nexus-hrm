const fs = require('fs');
const path = require('path');

function search(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            search(fullPath);
        } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.mjs'))) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('parts[0].text')) {
                console.log("MATCH 'parts[0].text' IN:", fullPath);
            }
            if (content.includes('Only systemInstruction')) {
                console.log("MATCH 'Only systemInstruction' IN:", fullPath);
            }
        }
    }
}

search('node_modules/@google/genai/dist');
console.log("Search complete.");
