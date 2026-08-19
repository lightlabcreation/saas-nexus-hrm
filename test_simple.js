const fs = require('fs');
try {
    const content = fs.readFileSync('node_modules/@google/genai/dist/node/index.cjs', 'utf-8');
    console.log("File length:", content.length);
    const searchStr = 'Only systemInstruction';
    const index = content.toLowerCase().indexOf(searchStr.toLowerCase());
    console.log("Index of search string:", index);
    if (index !== -1) {
        console.log("FOUND SNIPPET:", content.substring(index - 50, index + 150));
    }
} catch (e) {
    console.error(e);
}
