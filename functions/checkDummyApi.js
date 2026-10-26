const http = require('http');
const options = {
 hostname: 'localhost',
 port: 3002,
 path: '/api/orders',
 headers: { 'x-api-key': 'dummy-app-key-2025' }
};

http.get(options, (res) => {
 let data = '';
 res.on('data', chunk => data += chunk);
 res.on('end', () => {
  try {
   const json = JSON.parse(data);
   console.log('Orders count:', json.orders.length);
   json.orders.forEach(o => console.log(' -', o.id, o.customer?.name, '| status:', o.status, '| subOrders:', (o.subOrders || []).length, '| garments:', (o.garments || []).length));
  } catch (e) { console.log('Response:', data.substring(0, 200)); }
  process.exit(0);
 });
}).on('error', (e) => { console.error(e); process.exit(1); });
