const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3002;
const API_KEY = 'amaze-fab-super-admin-key-2026';

const path = require('path');

// Connect to Cloud Firestore for real-time order sync
let db = null;
try {
 const admin = require(path.resolve(__dirname, '../../functions/node_modules/firebase-admin'));
 if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'amaze-ops' });
 }
 db = admin.firestore();
 console.log('[Dummy App] Successfully connected to live Cloud Firestore (amaze-ops)!');
} catch (e) {
 console.warn('[Dummy App] Firestore not loaded:', e.message);
}

// In-memory storage
let orders = [];
let services = [
 { id: 'SVC-001', name: 'Wash & Iron', amazeFabServiceId: 'AMF-A001', description: 'Standard wash and iron service', goldRate: 80, yellowRate: 60, blueRate: 40, active: true, createdAt: new Date().toISOString() },
 { id: 'SVC-002', name: 'Dry Clean', amazeFabServiceId: 'AMF-D002', description: 'Premium dry cleaning', goldRate: 200, yellowRate: 150, blueRate: 100, active: true, createdAt: new Date().toISOString() },
 { id: 'SVC-003', name: 'Iron Only', amazeFabServiceId: 'AMF-I003', description: 'Iron only, no wash', goldRate: 40, yellowRate: 30, blueRate: 20, active: true, createdAt: new Date().toISOString() },
];
let partners = [];
let users = [];
let roles = [];
let activityLogs = [];
let nextId = 1;
let nextServiceId = 4;
let nextPartnerId = 1;
let nextUserId = 1;
let nextRoleId = 1;
let nextLogId = 1;

// Seed demo users if none exist
if (users.length === 0) {
  users = [
    { id: 'USR-001', userId: 'USR-0001', name: 'Admin User', email: 'admin@amazefab.com', password: 'password', role: 'ADM', phone: '+91-9999999999', partnerId: null, assignedOrders: [], permissions: { all: true }, isActive: true, createdAt: new Date().toISOString() },
    { id: 'USR-002', userId: 'USR-0002', name: 'Staff User', email: 'staff@amazefab.com', password: 'password', role: 'STAFF', phone: '+91-8888888888', partnerId: null, assignedOrders: [], permissions: {}, isActive: true, createdAt: new Date().toISOString() },
  ];
  nextUserId = 3;
}

// In-memory customer categories
let customerCategories = ['RETAIL', 'VIP', 'WHOLESALE'];

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// API key check - accept both production and dummy keys
function checkApiKey(req, res, next) {
 const key = req.headers['x-api-key'];
 const validKeys = ['amaze-fab-super-admin-key-2026', 'dummy-app-key-2025'];
 if (!validKeys.includes(key)) {
  return res.status(401).json({ error: 'Invalid API key' });
 }
 next();
}

// Serve the order creation form
app.get('/', (req, res) => {
 res.sendFile(require('path').join(__dirname, '..', 'public', 'index.html'));
});

// API: List all orders (from Firestore if available, otherwise in-memory)
app.get('/api/orders', checkApiKey, async (req, res) => {
 if (db) {
  try {
   const snapshot = await db.collection('orders').get();
   const firestoreOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
   return res.json({ orders: firestoreOrders });
  } catch (err) {
   console.warn('[Dummy App] Error fetching orders from Firestore:', err.message);
  }
 }
 res.json({ orders });
});

// API: Delete all orders
app.delete('/api/orders', checkApiKey, async (req, res) => {
 orders = [];
 if (db) {
  try {
   const [orderSnap, subSnap, qcSnap] = await Promise.all([
    db.collection('orders').get(),
    db.collection('subOrders').get(),
    db.collection('qcRecords').get(),
   ]);
   const batch = db.batch();
   orderSnap.docs.forEach(d => batch.delete(d.ref));
   subSnap.docs.forEach(d => batch.delete(d.ref));
   qcSnap.docs.forEach(d => batch.delete(d.ref));
   await batch.commit();
  } catch (err) {
   console.warn('[Dummy App] Error deleting orders/subOrders/qcRecords:', err.message);
  }
 }
 res.json({ success: true, message: 'All orders, sub-orders, and QC records cleared' });
});

// API: Get one order
app.get('/api/orders/:id', checkApiKey, async (req, res) => {
 if (db) {
  try {
   const doc = await db.collection('orders').doc(req.params.id).get();
   if (doc.exists) {
    return res.json({ order: { id: doc.id, ...doc.data() } });
   }
  } catch (err) {}
 }
 const order = orders.find(o => o.id === req.params.id || o.orderId === req.params.id);
 if (!order) return res.status(404).json({ error: 'Order not found' });
 res.json({ order });
});

// API: Create order
app.post('/api/orders', checkApiKey, async (req, res) => {
 const data = req.body;
 const orderId = data.order_id || data.orderId || data.order_no || data.orderNo || `ORD-${String(nextId).padStart(3, '0')}`;
 if (!data.order_id && !data.orderId && !data.order_no && !data.orderNo) nextId++;

 const order = {
  id: orderId,
  orderId,
  orderNumber: orderId,
  customer: {
   name: data.customer_name || data.customerName || (data.customer && data.customer.name) || 'Unknown',
   phone: data.customer_phone || data.customerPhone || (data.customer && data.customer.phone) || '—',
   category: data.customer_category || data.customerCategory || (data.customer && data.customer.category) || 'RETAIL',
   city: data.city || data.customer_city || data.customerCity || (data.customer && (data.customer.city || data.customer.customerCity)) || '',
   pincode: data.pincode || data.pin_code || data.pinCode || data.postal_code || (data.customer && (data.customer.pincode || data.customer.pin_code || data.customer.postal_code)) || '',
  },
  city: data.city || data.customer_city || data.customerCity || (data.customer && (data.customer.city || data.customer.customerCity)) || '',
  pincode: data.pincode || data.pin_code || data.pinCode || data.postal_code || (data.customer && (data.customer.pincode || data.customer.pin_code || data.customer.postal_code)) || '',
  careCategory: data.care_category || data.careCategory || 'Normal',
  hub: (() => {
   const h = data.hub || {};
   const name = h.name || data.hub_name || data.hubName || 'Amaze Main Hub';
   const code = h.code || data.hub_code || data.hubCode || 'HUB-CHN-01';
   const location = h.location || data.hub_location || data.hubLocation || 'Anna Nagar, Chennai';
   const latitude = h.latitude || h.lat || data.hub_latitude || data.hubLatitude || data.hub_lat || data.hubLat || 13.0827;
   const longitude = h.longitude || h.lng || h.log || data.hub_longitude || data.hubLongitude || data.hub_lng || data.hubLng || data.hub_log || data.hubLog || 80.2707;
   const address = h.address || data.hub_address || data.hubAddress || data.address || 'No. 42, 2nd Avenue, Anna Nagar West, Chennai - 600040';
   const phone = h.phone || data.hub_phone || data.hubPhone || data.phone || '+91 98400 12345';
   return { name, code, location, latitude, longitude, address, phone };
  })(),
  hubName: data.hub?.name || data.hub_name || data.hubName || 'Amaze Main Hub',
  hubCode: data.hub?.code || data.hub_code || data.hubCode || 'HUB-CHN-01',
  hubLocation: data.hub?.location || data.hub_location || data.hubLocation || 'Anna Nagar, Chennai',
  hubLatitude: data.hub?.latitude || data.hub?.lat || data.hub_latitude || data.hubLatitude || data.hub_lat || data.hubLat || 13.0827,
  hubLongitude: data.hub?.longitude || data.hub?.lng || data.hub?.log || data.hub_longitude || data.hubLongitude || data.hub_lng || data.hubLng || data.hub_log || data.hubLog || 80.2707,
  hubAddress: data.hub?.address || data.hub_address || data.hubAddress || data.address || 'No. 42, 2nd Avenue, Anna Nagar West, Chennai - 600040',
  hubPhone: data.hub?.phone || data.hub_phone || data.hubPhone || data.phone || '+91 98400 12345',
  garments: (data.garments || []).map((g, i) => ({
   garmentId: g.garment_id_code || g.garmentId || `GAR-${orderId}-${i + 1}`,
   qrCode: g.qr_code || g.qrCode || `QR-${orderId}-${i + 1}`,
   garmentType: g.garment_type || g.garmentType || 'Garment',
   category: g.category || 'OTHER',
   garmentCategory: g.garment_category || g.garmentCategory || g.category || 'GOLD',
   serviceType: g.service_type || g.serviceType || 'Standard',
  })),
  services: (data.services && data.services.length > 0) ? data.services.map(s => ({
   code: s.code || 'STD',
   name: s.name || 'Standard Service',
  })) : (() => {
   const seen = new Set();
   return (data.garments || []).filter(g => (g.service_type || g.serviceType)).map(g => {
    const key = g.service_type || g.serviceType;
    if (seen.has(key)) return null;
    seen.add(key);
    return { code: key.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4), name: key };
   }).filter(Boolean);
  })(),
  status: data.status || 'RECEIVED',
  createdAt: data.created_at || new Date().toISOString(),
 };

 orders.unshift(order);

 // Save directly to Cloud Firestore so it reflects on Admin & Partner portals
 if (db) {
  try {
   await db.collection('orders').doc(orderId).set(order, { merge: true });
   console.log(`[Dummy App -> Firestore] Order ${orderId} synced to Cloud Firestore successfully!`);
  } catch (err) {
   console.error(`[Dummy App -> Firestore Error]`, err.message);
  }
 }

 res.status(201).json({ success: true, orderId, order });
});

// Stats endpoint
app.get('/api/stats', checkApiKey, (req, res) => {
 const totalOrders = orders.length;
 const activeOrders = orders.filter(o => ['RECEIVED', 'IN_PROCESS'].includes(o.status)).length;
 const completedOrders = orders.filter(o => o.status === 'COMPLETED').length;
 const deliveredOrders = orders.filter(o => o.status === 'DELIVERED').length;
 res.json({
  totalOrders, activeOrders, completedOrders, deliveredOrders,
  criticalCases: 0, totalRevenue: 0, pendingInvoices: 0, activePartners: 0,
 });
});

// Other endpoints
app.get('/api/garments', checkApiKey, (req, res) => res.json({ garments: [] }));
// Function to sync services from Customer App (http://localhost:5000) into Cloud Firestore
async function syncServicesFromCustomerApp() {
  try {
    const custUrl = process.env.CUSTOMER_APP_URL || 'http://localhost:5000';
    const resp = await fetch(`${custUrl}/api/internal/services`);
    if (!resp.ok) return;
    const custServices = await resp.json();
    if (!Array.isArray(custServices) || !custServices.length) return;

    for (const cs of custServices) {
      if (!cs.name) continue;
      let docRef = null;
      let existingData = {};

      if (db) {
        const snap = await db.collection('services').where('name', '==', cs.name).get();
        if (!snap.empty) {
          docRef = snap.docs[0].ref;
          existingData = snap.docs[0].data();
        } else if (cs.code) {
          const snapCode = await db.collection('services').where('code', '==', cs.code).get();
          if (!snapCode.empty) {
            docRef = snapCode.docs[0].ref;
            existingData = snapCode.docs[0].data();
          }
        }
      }

      const svcDocId = docRef ? docRef.id : `SVC-${String(cs.id || Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
      const targetDoc = docRef || (db ? db.collection('services').doc(svcDocId) : null);

      const serviceRecord = {
        id: targetDoc ? targetDoc.id : svcDocId,
        name: cs.name,
        code: cs.code || cs.name.toUpperCase().replace(/\s+/g, '-'),
        amazeFabServiceId: cs.code || `AMF-${cs.name.slice(0, 4).toUpperCase().replace(/\s+/g, '')}`,
        description: cs.description || '',
        goldRate: existingData?.goldRate || 100,
        yellowRate: existingData?.yellowRate || 80,
        blueRate: existingData?.blueRate || 60,
        active: cs.active === 1 || cs.active === true,
        updatedAt: new Date().toISOString()
      };

      if (targetDoc) {
        await targetDoc.set(serviceRecord, { merge: true });
      }

      // Also update in-memory services list
      const memIdx = services.findIndex(s => s.name.toLowerCase() === cs.name.toLowerCase());
      if (memIdx >= 0) {
        services[memIdx] = { ...services[memIdx], ...serviceRecord };
      } else {
        services.push(serviceRecord);
      }
    }
    console.log(`[Dummy App] Synced ${custServices.length} services from Customer App`);
  } catch (err) {
    // Customer app offline or starting up
  }
}

// Function to seed initial services in Firestore if empty
async function seedDefaultServices() {
 if (!db) return;
 try {
  const snap = await db.collection('services').get();
  if (snap.empty) {
   console.log('[Dummy App] Seeding default services to Cloud Firestore...');
   for (const s of services) {
    await db.collection('services').doc(s.id).set(s, { merge: true });
   }
   console.log('[Dummy App] Default services seeded successfully!');
  }
 } catch (err) {
  console.warn('[Dummy App] Service seed check warning:', err.message);
 }
 // Also sync from customer app on startup
 await syncServicesFromCustomerApp();
}
setTimeout(seedDefaultServices, 2000);
// Periodically sync every 30 seconds
setInterval(syncServicesFromCustomerApp, 30000);

// Services API Endpoints (Firestore-backed)
app.get('/api/services', checkApiKey, async (req, res) => {
 await syncServicesFromCustomerApp();
 if (db) {
  try {
   const snap = await db.collection('services').get();
   if (!snap.empty) {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.json({ services: list });
   }
  } catch (err) {}
 }
 res.json({ services });
});

app.post('/api/services/sync', checkApiKey, async (req, res) => {
 await syncServicesFromCustomerApp();
 if (db) {
  try {
   const snap = await db.collection('services').get();
   const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
   return res.json({ success: true, count: list.length, services: list });
  } catch (err) {}
 }
 res.json({ success: true, count: services.length, services });
});

app.post('/api/services', checkApiKey, async (req, res) => {
 const data = req.body;
 const svcId = data.id || `SVC-${String(nextServiceId++).padStart(3, '0')}`;
 const svc = {
  id: svcId,
  name: data.name,
  code: data.code || '',
  amazeFabServiceId: data.amazeFabServiceId || data.code || `AMF-${(data.name || 'SVC').slice(0, 3).toUpperCase()}`,
  description: data.description || '',
  goldRate: Number(data.goldRate) || 0,
  yellowRate: Number(data.yellowRate) || 0,
  blueRate: Number(data.blueRate) || 0,
  active: data.active !== false,
  createdAt: new Date().toISOString()
 };
 const existingIdx = services.findIndex(s => s.id === svcId);
 if (existingIdx >= 0) {
  services[existingIdx] = svc;
 } else {
  services.push(svc);
 }
 if (db) {
  try { await db.collection('services').doc(svcId).set(svc, { merge: true }); } catch (e) {}
 }
 res.status(201).json({ success: true, service: svc });
});

app.put('/api/services/:id', checkApiKey, async (req, res) => {
 const id = req.params.id;
 const data = req.body;
 const idx = services.findIndex(s => s.id === id);
 const updated = { ...(services[idx] || {}), ...data, id, updatedAt: new Date().toISOString() };
 if (idx >= 0) services[idx] = updated;
 else services.push(updated);
 if (db) {
  try { await db.collection('services').doc(id).set(updated, { merge: true }); } catch (e) {}
 }
 res.json({ success: true, service: updated });
});

app.delete('/api/services/:id', checkApiKey, async (req, res) => {
 const id = req.params.id;
 services = services.filter(s => s.id !== id);
 if (db) {
  try { await db.collection('services').doc(id).delete(); } catch (e) {}
 }
 res.json({ success: true, message: 'Service deleted' });
});

// Order status update endpoint (syncs Firestore & notifies Customer App)
app.patch('/api/orders/:id/status', checkApiKey, async (req, res) => {
 const id = req.params.id;
 const { status } = req.body;
 if (!status) return res.status(400).json({ error: 'Status is required' });
 const now = new Date().toISOString();
 if (db) {
  try {
   await db.collection('orders').doc(id).set({ status, updatedAt: now }, { merge: true });
  } catch (e) {}
 }
 const order = orders.find(o => o.id === id || o.orderId === id);
 if (order) {
  order.status = status;
  order.updatedAt = now;
 }
 try {
  await fetch(`http://localhost:5000/api/orders/${encodeURIComponent(id)}/status`, {
   method: 'PATCH',
   headers: { 'Content-Type': 'application/json', 'x-api-key': 'amaze-fab-super-admin-key-2026' },
   body: JSON.stringify({ status })
  });
 } catch (e) {}
 res.json({ success: true, id, status });
});

// Push split order details to external Customer App / order system
app.post('/api/orders/:id/split', checkApiKey, async (req, res) => {
 const id = req.params.id;
 const { mainOrderNumber, subOrders, splitOrders } = req.body;
 const ordersToPush = splitOrders || subOrders || [];
 const mainOrderNo = mainOrderNumber || id;
 const now = new Date().toISOString();

 // Sync split orders to Firestore if available
 if (db) {
  try {
   const batch = db.batch();
   for (const so of ordersToPush) {
    const docId = so.id || so.subOrderCode || `${mainOrderNo}-${so.partnerCode || "P"}`;
    const ref = db.collection('subOrders').doc(docId);
    batch.set(ref, {
     id: docId,
     orderId: mainOrderNo,
     mainOrderNumber: mainOrderNo,
     subOrderCode: so.subOrderCode || docId,
     partnerName: so.partnerName || '',
     partnerCode: so.partnerCode || '',
     partnerId: so.partnerId || '',
     status: so.status || 'ASSIGNED',
     partnerGeoLocation: so.partnerGeoLocation || so.geoLocation || null,
     garmentIds: so.garmentIds || [],
     garmentCount: so.garmentIds?.length || so.garmentCount || 0,
     careCategory: so.careCategory || so.garmentCategory || '',
     distanceKm: so.distanceKm ?? null,
     distanceFromHub: so.distanceFromHub || (so.distanceKm != null ? `${so.distanceKm} km` : ''),
     updatedAt: now,
    }, { merge: true });
   }
   await batch.commit();
  } catch (err) {
   console.warn('[Dummy App] Firestore split sync error:', err.message);
  }
 }

 // Also update in-memory order if present
 const order = orders.find(o => o.id === id || o.orderId === id || o.orderNumber === id);
 if (order) {
  order.subOrders = ordersToPush;
  order.updatedAt = now;
 }

 // Push notification to external Customer App / order system (same pattern as status update)
 const custUrl = process.env.CUSTOMER_APP_URL || 'http://localhost:5000';
 let notifySuccess = false;
 try {
  const resp = await fetch(`${custUrl}/api/orders/${encodeURIComponent(mainOrderNo)}/split`, {
   method: 'POST',
   headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'amaze-fab-super-admin-key-2026'
   },
   body: JSON.stringify({
    mainOrderNumber: mainOrderNo,
    splitOrders: ordersToPush.map(so => ({
     subOrderCode: so.subOrderCode,
     partnerName: so.partnerName,
     partnerCode: so.partnerCode,
     status: so.status || 'ASSIGNED',
     partnerGeoLocation: so.partnerGeoLocation || so.geoLocation || null,
     garmentIds: so.garmentIds || [],
     garmentCount: so.garmentIds?.length || so.garmentCount || 0,
     careCategory: so.careCategory || so.garmentCategory || '',
     distanceKm: so.distanceKm ?? null,
    })),
    timestamp: now
   })
  });
  notifySuccess = resp.ok;
 } catch (e) {
  console.log(`[Dummy App] Outbound split notification to ${custUrl} queued/not reached (${e.message})`);
 }

 res.json({
  success: true,
  mainOrderNumber: mainOrderNo,
  splitCount: ordersToPush.length,
  customerAppNotified: notifySuccess,
  subOrders: ordersToPush
 });
});

app.get('/api/categories', checkApiKey, (req, res) => res.json({ categories: customerCategories }));
app.get('/api/invoices', checkApiKey, (req, res) => res.json({ invoices: [] }));
app.get('/api/critical-cases', checkApiKey, (req, res) => res.json({ cases: [] }));
app.get('/api/notifications', checkApiKey, (req, res) => res.json({ notifications: [] }));

// Partners CRUD
app.get('/api/partners', checkApiKey, (req, res) => {
 res.json({ partners });
});

app.get('/api/partners/:id', checkApiKey, (req, res) => {
 const p = partners.find(x => x.id === req.params.id || x.partnerId === req.params.id);
 if (!p) return res.status(404).json({ error: 'Partner not found' });
 res.json({ partner: p });
});

app.post('/api/partners', checkApiKey, (req, res) => {
 const data = req.body;
 const partnerId = `PAR-${String(nextPartnerId).padStart(3, '0')}`;
 nextPartnerId++;
 const partner = {
  id: partnerId,
  partnerId,
  companyName: data.companyName || '',
  partnerCode: data.partnerCode || partnerId,
  contactPerson: data.contactPerson || '',
  email: data.email || '',
  phone: data.phone || '',
  address: data.address || '',
  geoLocation: data.geoLocation || undefined,
  gstNumber: data.gstNumber || '',
  category: data.category || 'GOLD',
  billingPeriod: data.billingPeriod || 'MONTHLY',
  customBillingDays: data.customBillingDays || undefined,
  services: data.services || [],
  status: data.status || 'ACTIVE',
  active: data.active !== false,
  bankAccount: data.bankAccount || undefined,
  createdAt: new Date().toISOString(),
 };
 partners.push(partner);
 res.status(201).json({ success: true, partnerId, partner });
});

app.patch('/api/partners/:id', checkApiKey, (req, res) => {
 const idx = partners.findIndex(p => p.id === req.params.id || p.partnerId === req.params.id);
 if (idx === -1) return res.status(404).json({ error: 'Partner not found' });
 partners[idx] = { ...partners[idx], ...req.body };
 res.json({ success: true, partner: partners[idx] });
});

app.delete('/api/partners/:id', checkApiKey, (req, res) => {
 const idx = partners.findIndex(p => p.id === req.params.id || p.partnerId === req.params.id);
 if (idx === -1) return res.status(404).json({ error: 'Partner not found' });
 partners.splice(idx, 1);
 res.json({ success: true });
});

// Create service
app.post('/api/services', checkApiKey, (req, res) => {
 const data = req.body;
 const service = {
  id: `SVC-${String(nextServiceId).padStart(3, '0')}`,
  name: data.name || 'New Service',
  code: data.code || '',
  amazeFabServiceId: data.amazeFabServiceId || `AMF-${String(nextServiceId).padStart(3, '0')}`,
  description: data.description || '',
  goldRate: data.goldRate || 0,
  yellowRate: data.yellowRate || 0,
  blueRate: data.blueRate || 0,
  active: data.active !== false,
  createdAt: new Date().toISOString(),
 };
 services.push(service);
 nextServiceId++;
 res.status(201).json({ success: true, service });
});

// Update service
app.put('/api/services/:id', checkApiKey, (req, res) => {
 const idx = services.findIndex(s => s.id === req.params.id);
 if (idx === -1) return res.status(404).json({ error: 'Service not found' });
 services[idx] = { ...services[idx], ...req.body };
 res.json({ success: true, service: services[idx] });
});

// Delete service
app.delete('/api/services/:id', checkApiKey, (req, res) => {
 const idx = services.findIndex(s => s.id === req.params.id);
 if (idx === -1) return res.status(404).json({ error: 'Service not found' });
 services.splice(idx, 1);
 res.json({ success: true });
});

// ===== ACTIVITY LOG HELPER =====
function logActivity(data) {
 const entry = {
  id: `LOG-${String(nextLogId).padStart(4, '0')}`,
  logId: `LOG-${String(nextLogId).padStart(4, '0')}`,
  ...data,
  timestamp: new Date().toISOString(),
 };
 activityLogs.unshift(entry);
 nextLogId++;
 return entry;
}

// ===== ORDERS BY PARTNER =====
app.get('/api/orders/partner/:partnerId', checkApiKey, (req, res) => {
 const pid = req.params.partnerId;
 const result = orders.filter(o => {
  const subs = o.subOrders || [];
  if (subs.length === 0) return o.assignedPartnerId === pid;
  return subs.some(s => s.partnerId === pid);
 });
 res.json({ orders: result });
});

// Get sub-orders for a partner (with order context)
app.get('/api/partners/:partnerId/sub-orders', checkApiKey, (req, res) => {
 const pid = req.params.partnerId;
 const result = [];
 for (const o of orders) {
  for (const sub of (o.subOrders || [])) {
   if (sub.partnerId === pid) {
    result.push({ ...sub, orderId: o.id, orderCode: o.orderId, customer: o.customer, status: o.status });
   }
  }
 }
 res.json({ subOrders: result });
});

// Partner accepts a sub-order
app.post('/api/partners/:partnerId/sub-orders/:subId/accept', checkApiKey, (req, res) => {
 const pid = req.params.partnerId;
 const subId = req.params.subId;
 for (const o of orders) {
  const sub = (o.subOrders || []).find(s => s.id === subId);
  if (sub && sub.partnerId === pid) {
   sub.status = 'ACCEPTED';
   sub.acceptedAt = new Date();
   logActivity({
    userId: req.body._actorId || pid, userName: req.body._actorName || 'Partner',
    role: 'PARTNER', orderId: o.id, subOrderId: sub.id,
    action: 'SUBORDER_ACCEPTED', previousValue: 'ASSIGNED', newValue: 'ACCEPTED',
    comments: req.body._comment || null,
   });
   return res.json({ success: true, subOrder: sub });
  }
 }
 return res.status(404).json({ error: 'Sub-order not found for this partner' });
});

// ===== STATS EXTENDED =====
app.get('/api/stats', checkApiKey, (req, res) => {
 const totalOrders = orders.length;
 const statusCounts = {};
 orders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
 const activeOrders = orders.filter(o => ['RECEIVED', 'IN_PROCESS', 'QC_PENDING', 'QC_REJECTED'].includes(o.status)).length;
 const criticalCases = 0;
 const pendingInvoices = 0;
 const totalRevenue = 0;
 const activePartners = partners.filter(p => p.active).length;
 res.json({
  totalOrders, activeOrders, criticalCases, totalRevenue, pendingInvoices, activePartners,
  statusCounts,
 });
});

// ===== DASHBOARD STATS =====
app.get('/api/dashboard', checkApiKey, (req, res) => {
 const totalOrders = orders.length;
 const activeOrders = orders.filter(o => ['RECEIVED', 'IN_PROCESS', 'QC_PENDING', 'QC_REJECTED'].includes(o.status)).length;
 const statusCounts = {};
 orders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
 const recentOrders = orders.slice(0, 10).map(o => ({
  id: o.id, orderId: o.orderId,
  customer: { name: o.customer?.name || '—', phone: o.customer?.phone || '—', category: o.customer?.category || '—' },
  status: o.status, createdAt: o.createdAt,
 }));
 res.json({
  stats: { totalOrders, activeOrders, criticalCases: 0, totalRevenue: 0, pendingInvoices: 0, activePartners: partners.filter(p => p.active).length },
  recentOrders,
 });
});

// ===== USERS CRUD =====
app.get('/api/users', checkApiKey, (req, res) => {
 const { role, active } = req.query;
 let result = users;
 if (role) result = result.filter(u => u.role === role.toUpperCase());
 if (active !== undefined) result = result.filter(u => u.isActive === (active === 'true'));
 res.json({ users: result });
});

app.get('/api/users/:id', checkApiKey, (req, res) => {
 const u = users.find(x => x.id === req.params.id || x.userId === req.params.id);
 if (!u) return res.status(404).json({ error: 'User not found' });
 res.json({ user: u });
});

app.post('/api/users', checkApiKey, (req, res) => {
 const data = req.body;
 const userId = `USR-${String(nextUserId).padStart(4, '0')}`;
 nextUserId++;
 const user = {
  id: userId, userId,
  name: data.name || 'Unnamed',
  email: data.email || '',
  phone: data.phone || '',
  role: data.role || 'PARTNER',
  partnerId: data.partnerId || null,
  assignedOrders: data.assignedOrders || [],
  permissions: data.permissions || {},
  isActive: data.isActive !== false,
  createdAt: new Date().toISOString(),
 };
 users.push(user);
 logActivity({ userId: 'system', userName: 'System', role: 'ADMIN', action: 'USER_CREATED', orderId: null, subOrderId: null, previousValue: null, newValue: user.id, comments: `Created user ${user.name} with role ${user.role}` });
 res.status(201).json({ success: true, userId, user });
});

app.patch('/api/users/:id', checkApiKey, (req, res) => {
 const idx = users.findIndex(u => u.id === req.params.id || u.userId === req.params.id);
 if (idx === -1) return res.status(404).json({ error: 'User not found' });
 const prev = { ...users[idx] };
 users[idx] = { ...users[idx], ...req.body };
 logActivity({ userId: req.body._actorId || 'system', userName: req.body._actorName || 'System', role: req.body._actorRole || 'ADMIN', orderId: null, subOrderId: null, previousValue: JSON.stringify(prev.role), newValue: JSON.stringify(users[idx].role), comments: `Updated user ${users[idx].name}` });
 res.json({ success: true, user: users[idx] });
});

app.delete('/api/users/:id', checkApiKey, (req, res) => {
 const idx = users.findIndex(u => u.id === req.params.id || u.userId === req.params.id);
 if (idx === -1) return res.status(404).json({ error: 'User not found' });
 const name = users[idx].name;
 users.splice(idx, 1);
 logActivity({ userId: 'system', userName: 'System', role: 'ADMIN', action: 'USER_DELETED', orderId: null, subOrderId: null, previousValue: name, newValue: null, comments: `Deleted user ${name}` });
 res.json({ success: true });
});

// ===== ROLES CRUD =====
app.get('/api/roles', checkApiKey, (req, res) => {
 res.json({ roles });
});

app.post('/api/roles', checkApiKey, (req, res) => {
 const data = req.body;
 const roleId = `ROL-${String(nextRoleId).padStart(3, '0')}`;
 nextRoleId++;
 const role = {
  id: roleId, roleId,
  name: data.name || 'New Role',
  description: data.description || '',
  permissions: data.permissions || [],
  createdAt: new Date().toISOString(),
 };
 roles.push(role);
 res.status(201).json({ success: true, roleId, role });
});

app.patch('/api/roles/:id', checkApiKey, (req, res) => {
 const idx = roles.findIndex(r => r.id === req.params.id || r.roleId === req.params.id);
 if (idx === -1) return res.status(404).json({ error: 'Role not found' });
 roles[idx] = { ...roles[idx], ...req.body };
 res.json({ success: true, role: roles[idx] });
});

app.delete('/api/roles/:id', checkApiKey, (req, res) => {
 const idx = roles.findIndex(r => r.id === req.params.id || r.roleId === req.params.id);
 if (idx === -1) return res.status(404).json({ error: 'Role not found' });
 roles.splice(idx, 1);
 res.json({ success: true });
});

// ===== ACTIVITY LOGS =====
app.get('/api/activity-logs', checkApiKey, (req, res) => {
 const { userId, orderId, action, limit } = req.query;
 let result = activityLogs;
 if (userId) result = result.filter(l => l.userId === userId);
 if (orderId) result = result.filter(l => l.orderId === orderId);
 if (action) result = result.filter(l => l.action === action.toUpperCase());
 if (limit) result = result.slice(0, parseInt(limit));
 res.json({ logs: result });
});

app.get('/api/activity-logs/:id', checkApiKey, (req, res) => {
 const log = activityLogs.find(l => l.id === req.params.id || l.logId === req.params.id);
 if (!log) return res.status(404).json({ error: 'Log not found' });
 res.json({ log });
});

// ===== PARTNER QC — Submit =====
app.post('/api/orders/:id/qc/submit', checkApiKey, (req, res) => {
 const order = orders.find(o => o.id === req.params.id || o.orderId === req.params.id);
 if (!order) return res.status(404).json({ error: 'Order not found' });
 const prevStatus = order.qcStatus || 'QC_PENDING';
 order.qcStatus = 'QC_PENDING';
 order.qcSubmittedAt = new Date().toISOString();
 order.qcSubmittedBy = req.body.submittedBy || null;
 if (req.body.garmentUpdates) {
  req.body.garmentUpdates.forEach(gu => {
   const g = (order.garments || []).find(g => g.garmentId === gu.garmentId);
   if (g) { g.brand = gu.brand || g.brand; g.comments = gu.comments || g.comments; g.photos = gu.photos || g.photos; }
  });
 }
 logActivity({
  userId: req.body._actorId || 'system', userName: req.body._actorName || 'System', role: req.body._actorRole || 'PARTNER',
  orderId: order.id, subOrderId: order.subOrderId || null, action: 'QC_SUBMITTED',
  previousValue: prevStatus, newValue: 'QC_PENDING',
  comments: req.body._comment || null,
 });
 res.json({ success: true, order });
});

// ===== STAFF QC — Approve =====
app.post('/api/orders/:id/qc/approve', checkApiKey, (req, res) => {
 const order = orders.find(o => o.id === req.params.id || o.orderId === req.params.id);
 if (!order) return res.status(404).json({ error: 'Order not found' });
 if (order.qcStatus !== 'QC_PENDING') return res.status(400).json({ error: 'Order is not in QC_PENDING status' });
 const prevStatus = order.qcStatus;
 order.qcStatus = 'QC_APPROVED';
 order.qcApprovedAt = new Date().toISOString();
 order.qcApprovedBy = req.body.approvedBy || null;
 order.status = 'QC_APPROVED';
 logActivity({
  userId: req.body._actorId || 'system', userName: req.body._actorName || 'System', role: req.body._actorRole || 'STAFF',
  orderId: order.id, subOrderId: order.subOrderId || null, action: 'QC_APPROVED',
  previousValue: prevStatus, newValue: 'QC_APPROVED',
  comments: req.body._comment || null,
 });
 res.json({ success: true, order });
});

// ===== STAFF QC — Reject =====
app.post('/api/orders/:id/qc/reject', checkApiKey, (req, res) => {
 const order = orders.find(o => o.id === req.params.id || o.orderId === req.params.id);
 if (!order) return res.status(404).json({ error: 'Order not found' });
 if (order.qcStatus !== 'QC_PENDING') return res.status(400).json({ error: 'Order is not in QC_PENDING status' });
 const prevStatus = order.qcStatus;
 order.qcStatus = 'QC_REJECTED';
 order.qcRejectedAt = new Date().toISOString();
 order.qcRejectedBy = req.body.rejectedBy || null;
 order.qcRejectionReason = req.body.reason || '';
 order.qcRejectionComments = req.body.comments || '';
 order.status = 'QC_REJECTED';
 logActivity({
  userId: req.body._actorId || 'system', userName: req.body._actorName || 'System', role: req.body._actorRole || 'STAFF',
  orderId: order.id, subOrderId: order.subOrderId || null, action: 'QC_REJECTED',
  previousValue: prevStatus, newValue: 'QC_REJECTED',
  comments: (req.body.reason || '') + (req.body.comments ? ' — ' + req.body.comments : ''),
 });
 res.json({ success: true, order });
});

// ===== PARTNER — Accept Order =====
app.post('/api/orders/:id/accept', checkApiKey, (req, res) => {
 const order = orders.find(o => o.id === req.params.id || o.orderId === req.params.id);
 if (!order) return res.status(404).json({ error: 'Order not found' });
 if (order.status !== 'ASSIGNED' && order.status !== 'RECEIVED') return res.status(400).json({ error: 'Order cannot be accepted in current status' });
 const prevStatus = order.status;
 order.status = 'IN_PROCESS';
 order.acceptedAt = new Date().toISOString();
 order.acceptedBy = req.body.acceptedBy || null;
 logActivity({
  userId: req.body._actorId || 'system', userName: req.body._actorName || 'System', role: req.body._actorRole || 'PARTNER',
  orderId: order.id, subOrderId: order.subOrderId || null, action: 'ORDER_ACCEPTED',
  previousValue: prevStatus, newValue: 'IN_PROCESS',
  comments: null,
 });
 res.json({ success: true, order });
});

// ===== PARTNER — Delivery Initiation =====
app.post('/api/orders/:id/delivery/initiate', checkApiKey, (req, res) => {
 const order = orders.find(o => o.id === req.params.id || o.orderId === req.params.id);
 if (!order) return res.status(404).json({ error: 'Order not found' });
 if (order.qcStatus !== 'QC_APPROVED') return res.status(400).json({ error: 'Order must be QC_APPROVED before delivery' });
 order.deliveryStatus = 'INITIATED';
 order.deliveryInitiatedAt = new Date().toISOString();
 order.deliveryInitiatedBy = req.body.initiatedBy || null;
 order.status = 'DELIVERED';
 logActivity({
  userId: req.body._actorId || 'system', userName: req.body._actorName || 'System', role: req.body._actorRole || 'PARTNER',
  orderId: order.id, subOrderId: order.subOrderId || null, action: 'DELIVERY_INITIATED',
  previousValue: 'QC_APPROVED', newValue: 'DELIVERED',
  comments: null,
 });
 res.json({ success: true, order });
});

// Seed default roles if empty
if (roles.length === 0) {
 roles = [
  { id: 'ROL-001', roleId: 'ROL-001', name: 'Admin', description: 'Full access', permissions: ['all'], createdAt: new Date().toISOString() },
  { id: 'ROL-002', roleId: 'ROL-002', name: 'Staff', description: 'QC review, order monitoring, delivery', permissions: ['qc.review', 'qc.approve', 'qc.reject', 'orders.view', 'delivery.initiate'], createdAt: new Date().toISOString() },
  { id: 'ROL-003', roleId: 'ROL-003', name: 'Partner', description: 'Process orders, submit QC, delivery', permissions: ['orders.view_assigned', 'orders.accept', 'qc.submit', 'delivery.initiate'], createdAt: new Date().toISOString() },
 ];
 nextRoleId = 4;
}


// ===== ORDERS — EXTENDED FIELDS =====
app.patch('/api/orders/:id', checkApiKey, (req, res) => {
 const order = orders.find(o => o.id === req.params.id || o.orderId === req.params.id);
 if (!order) return res.status(404).json({ error: 'Order not found' });
 const prevStatus = order.status;
 Object.assign(order, req.body);
 if (req.body.status && req.body.status !== prevStatus) {
  logActivity({
   userId: req.body._actorId || 'system', userName: req.body._actorName || 'System',
   role: req.body._actorRole || 'system', orderId: order.id, subOrderId: order.subOrderId || null,
   action: 'STATUS_CHANGE', previousValue: prevStatus, newValue: req.body.status,
   comments: req.body._comment || null,
  });
 }
 res.json({ success: true, order });
});

app.patch('/api/orders/:id/sub-orders/:subId', checkApiKey, (req, res) => {
 const order = orders.find(o => o.id === req.params.id || o.orderId === req.params.id);
 if (!order) return res.status(404).json({ error: 'Order not found' });
 const sub = (order.subOrders || []).find(s => s.id === req.params.subId);
 if (!sub) return res.status(404).json({ error: 'Sub-order not found' });
 const prevStatus = sub.status;
 Object.assign(sub, req.body);
 if (req.body.status && req.body.status !== prevStatus) {
  logActivity({
   userId: req.body._actorId || 'system', userName: req.body._actorName || 'System',
   role: req.body._actorRole || 'system', orderId: order.id, subOrderId: sub.id,
   action: 'STATUS_CHANGE', previousValue: prevStatus, newValue: req.body.status,
   comments: req.body._comment || null,
  });
 }
 res.json({ success: true, subOrder: sub });
});


// Demo orders disabled - orders start completely empty
// (Create orders via the app or API as needed)


app.listen(PORT, () => {
 console.log(`Dummy Order App running at http://localhost:${PORT}`);
 console.log(`API key: ${API_KEY}`);
});
