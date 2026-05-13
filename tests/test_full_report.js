const http = require('http');

async function test() {
  // 1. Login to get token
  const loginData = JSON.stringify({ username: 'admin', password: 'password123' });
  
  const loginOpts = {
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': loginData.length
    }
  };

  const token = await new Promise((resolve, reject) => {
    const req = http.request(loginOpts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data).token));
    });
    req.on('error', reject);
    req.write(loginData);
    req.end();
  });

  console.log('Got token:', token.substring(0, 20) + '...');

  // 2. Call report endpoint
  const reportOpts = {
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/reports/damages',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  http.get(reportOpts, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      console.log('CONTENT-TYPE:', res.headers['content-type']);
      console.log('BODY:', data.substring(0, 200));
      process.exit(0);
    });
  }).on('error', (err) => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}

test();
