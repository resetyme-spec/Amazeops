// Sync critical markings from dummy API to Firestore
const http = require('http');
const API_KEY = 'amaze-fab-super-admin-key-2026';

// Firebase Admin SDK
const admin = require('E:/Amaze opsv1/functions/node_modules/firebase-admin');
if (!admin.apps.length) {
 admin.initializeApp({
  credential: admin.credential.applicationDefault(),
 });
}
const db = admin.firestore();

function apiCall(method, path) {
 return new Promise(function(resolve, reject) {
  var options = { hostname: 'localhost', port: 3002, path: path, method: method, headers: { 'x-api-key': API_KEY } };
  var req = http.request(options, function(res) {
   var body = '';
   res.on('data', function(chunk) { body += chunk; });
   res.on('end', function() {
    try { resolve(JSON.parse(body)); } catch(e) { resolve(body); }
   });
  });
  req.on('error', reject);
  req.end();
 });
}

async function main() {
 var result = await apiCall('GET', '/api/orders');
 var orders = result.orders || [];
 console.log('Found', orders.length, 'orders');

 for (var i = 0; i < orders.length; i++) {
  var order = orders[i];
  var criticalCount = 0;
  if (order.garments) {
   order.garments.forEach(function(g) {
    if (g.isCritical) criticalCount++;
   });
  }

  // Update Firestore
  var orderData = {
   id: order.id,
   orderId: order.orderId || order.id,
   customer: order.customer || {},
   careCategory: order.careCategory || 'Normal',
   garments: order.garments || [],
   services: order.services || [],
   status: order.status || 'RECEIVED',
   createdAt: order.createdAt || new Date().toISOString(),
   updatedAt: new Date().toISOString(),
  };

  await db.collection('orders').doc(order.id).set(orderData, { merge: true });
  console.log(order.id, '-', order.customer.name, '-', criticalCount, 'critical garments');
 }

 console.log('Sync complete!');
}

main().catch(console.error);
