const http = require('http');

http.get('http://localhost:3000/api/v1/catalog/products', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Headers:', res.headers);
    try {
      const parsed = JSON.parse(data);
      console.log('Response Data Structure:', Object.keys(parsed));
      console.log('Data Success:', parsed.success);
      console.log('Data Length:', parsed.data ? parsed.data.length : 'N/A');
      console.log('First Product:', parsed.data && parsed.data.length > 0 ? parsed.data[0] : 'None');
    } catch (e) {
      console.log('Raw Data:', data.substring(0, 1000));
    }
  });
}).on('error', (err) => {
  console.error('Error connecting:', err.message);
});
