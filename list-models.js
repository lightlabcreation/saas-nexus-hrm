async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.models) {
        console.log("Available Models:");
        data.models.forEach(m => console.log(m.name));
    } else {
        console.log(data);
    }
}
listModels();
