const http = require('http');

const data = JSON.stringify({
  message: "today deepu present or not ?",
  context: { userRole: "admin", currentPage: "dashboard" }
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/chatbot',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (d) => body += d);
  res.on('end', () => console.log('Response:', body));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
