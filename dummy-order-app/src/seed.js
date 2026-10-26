// Seed script — populates dummy API with sample data for testing
const API_BASE = 'http://localhost:3002';
const API_KEY = 'amaze-fab-super-admin-key-2026';

async function seed() {
 const headers = { 'Content-Type': 'application/json', 'x-api-key': API_KEY };

 // Create sample users
 const users = [
  { name: 'Admin User', email: 'admin@amaze.com', phone: '+919999999999', role: 'ADMIN', isActive: true },
  { name: 'Staff Priya', email: 'priya@amaze.com', phone: '+919999999998', role: 'STAFF', isActive: true },
  { name: 'Partner Rahul', email: 'rahul@amaze.com', phone: '+919999999997', role: 'PARTNER', partnerCode: 'PAR-001', isActive: true },
 ];

 for (const user of users) {
  const res = await fetch(`${API_BASE}/api/users`, { method: 'POST', headers, body: JSON.stringify(user) });
  const data = await res.json();
  console.log(`Created user: ${data.user?.name} (${data.user?.id})`);
 }

 // Update existing orders with extended fields
 const ordersRes = await fetch(`${API_BASE}/api/orders`, { headers });
 const ordersData = await ordersRes.json();

 for (const order of ordersData.orders) {
  const partnerId = 'USR-004';
  const isVIP = order.customer && order.customer.category === 'VIP';
  const updates = {
   status: 'RECEIVED',
   careCategory: isVIP ? 'Signature Care' : 'Normal',
   qcStatus: 'PENDING',
   deliveryStatus: 'PENDING',
   assignedPartnerId: partnerId,
   garments: (order.garments || []).map(function(g, idx) {
    var result = Object.assign({}, g);
    result.isCritical = (idx === 0 || idx === 2);
    result.criticalMarkedBy = 'ananthlingam';
    result.criticalMarkedAt = new Date(Date.now() - 86400000).toISOString();
    result.criticalComments = 'Stain on front panel - requires special attention';
    result.criticalPhotos = { urls: ['https://via.placeholder.com/150?text=Critical+1', 'https://via.placeholder.com/150?text=Critical+2'] };
    if (isVIP) {
     result.photos = { front: 'https://via.placeholder.com/150?text=Front', back: 'https://via.placeholder.com/150?text=Back', other: '' };
    }
    return result;
   }),
  };
  const patchRes = await fetch(`${API_BASE}/api/orders/${order.id}`, {
   method: 'PATCH',
   headers,
   body: JSON.stringify(updates),
  });
  console.log(`Updated order ${order.id}: ${patchRes.ok ? '✓' : '✗'}`);
 }

 console.log('\nSeed complete!');
}

seed().catch(console.error);
