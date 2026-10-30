process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'amaze-ops';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import {
 onOrderCreated, onOrderUpdated, onGarmentCreated, onGarmentStatusUpdated,
 onCriticalCaseCreated, onCriticalCaseUpdated, onSubOrderCreated, onSubOrderUpdated,
 onQCRecordCreated, onInvoiceCreated, onInvoiceUpdated, onPaymentCreated,
 calculateOverallOrderStatus, syncSubOrderStatusAndNotify
} from './services/orderService';
import {
 createOrder, addGarmentsToOrder, assignGarmentsToPartner,
 createPartner, updatePartner, deletePartner,
 createService, updateService, deleteService,
 createCriticalCase, submitQCResult, createInvoice, approveInvoice, recordPayment, initializeFirestore
} from './services/callableFunctions';

// Initialize Firebase Admin — emulator-safe (no production creds)
admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();

// ===== CALLABLE (HTTP) FUNCTIONS =====
export const apiCreateOrder = createOrder;
export const apiAddGarmentsToOrder = addGarmentsToOrder;
export const apiAssignGarmentsToPartner = assignGarmentsToPartner;
export const apiCreatePartner = createPartner;
export const apiUpdatePartner = updatePartner;
export const apiDeletePartner = deletePartner;
export const apiCreateService = createService;
export const apiUpdateService = updateService;
export const apiDeleteService = deleteService;
export const apiCreateCriticalCase = createCriticalCase;
export const apiSubmitQCResult = submitQCResult;
export const apiCreateInvoice = createInvoice;
export const apiApproveInvoice = approveInvoice;
export const apiRecordPayment = recordPayment;
export const apiInitializeFirestore = initializeFirestore;

// ===== FIRESTORE TRIGGERS =====

// Orders
export const orderOnCreate = functions.firestore
 .document('orders/{orderId}')
 .onCreate((snap) => onOrderCreated(snap));

export const orderOnUpdate = functions.firestore
 .document('orders/{orderId}')
 .onUpdate((change) => onOrderUpdated(change));

// Garments
export const garmentOnCreate = functions.firestore
 .document('garments/{garmentId}')
 .onCreate((snap) => onGarmentCreated(snap));

export const garmentOnUpdate = functions.firestore
 .document('garments/{garmentId}')
 .onUpdate((change) => onGarmentStatusUpdated(change));

// Critical Cases
export const criticalCaseOnCreate = functions.firestore
 .document('criticalCases/{caseId}')
 .onCreate((snap) => onCriticalCaseCreated(snap));

export const criticalCaseOnUpdate = functions.firestore
 .document('criticalCases/{caseId}')
 .onUpdate((change) => onCriticalCaseUpdated(change));

// Sub-Orders
export const subOrderOnCreate = functions.firestore
 .document('orders/{orderId}/subOrders/{subOrderId}')
 .onCreate((snap) => onSubOrderCreated(snap));

export const subOrderOnUpdate = functions.firestore
 .document('orders/{orderId}/subOrders/{subOrderId}')
 .onUpdate((change) => onSubOrderUpdated(change));

// QC Records
export const qcRecordOnCreate = functions.firestore
 .document('qcRecords/{qcId}')
 .onCreate((snap) => onQCRecordCreated(snap));

// Invoices
export const invoiceOnCreate = functions.firestore
 .document('invoices/{invoiceId}')
 .onCreate((snap) => onInvoiceCreated(snap));

export const invoiceOnUpdate = functions.firestore
 .document('invoices/{invoiceId}')
 .onUpdate((change) => onInvoiceUpdated(change));

// Payments
export const paymentOnCreate = functions.firestore
 .document('payments/{paymentId}')
 .onCreate((snap) => onPaymentCreated(snap));

// ===== SCHEDULED FUNCTIONS =====

// Daily reminder for pending deliveries
export const dailyDeliveryReminder = functions.pubsub.schedule('0 9 * * *').onRun(async (context) => {
 const tomorrow = new Date();
 tomorrow.setDate(tomorrow.getDate() + 1);
 const tomorrowStr = tomorrow.toISOString().split('T')[0];

 const snapshot = await db.collection('orders')
 .where('status', 'in', ['IN_PROCESS', 'COMPLETED'])
 .where('deliveryDate', '==', tomorrowStr)
 .get();

 const userNotifications: Record<string, any[]> = {};

 snapshot.docs.forEach(doc => {
 const order = doc.data();
 if (!userNotifications[order.createdBy]) {
 userNotifications[order.createdBy] = [];
 }
 userNotifications[order.createdBy].push({
 title: 'Delivery Tomorrow',
 message: `Order ${order.orderNumber} is due for delivery tomorrow`,
 type: 'INFO',
 link: `/orders/${doc.id}`,
 });
 });

 for (const [userId, notifications] of Object.entries(userNotifications)) {
 const batch = db.batch();
 notifications.forEach(n => {
 const ref = db.collection('notifications').doc();
 batch.create(ref, { ...n, userId, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
 });
 await batch.commit();
 }

 return null;
});

// Weekly partner summary
export const weeklyPartnerSummary = functions.pubsub.schedule('0 8 * * 1').onRun(async (context) => {
 const partnersSnapshot = await db.collection('partners').get();

 for (const partnerDoc of partnersSnapshot.docs) {
 const partnerId = partnerDoc.id;
 const weekAgo = new Date();
 weekAgo.setDate(weekAgo.getDate() - 7);

 const paymentsSnapshot = await db.collection('walletTransactions')
 .where('partnerId', '==', partnerId)
 .where('status', '==', 'COMPLETED')
 .where('createdAt', '>=', weekAgo)
 .get();

 const totalEarnings = paymentsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);

 if (totalEarnings > 0) {
 const partnerUserSnap = await db.collection('users').where('partnerId', '==', partnerId).get();
 partnerUserSnap.docs.forEach(userDoc => {
 const ref = db.collection('notifications').doc();
 ref.set({
 userId: userDoc.id,
 title: 'Weekly Summary',
 message: `Your earnings this week: ₹${totalEarnings.toFixed(2)}`,
 type: 'INFO',
 read: false,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 });
 });
 }
 }

 return null;
});

// ===== PUBLIC REST API FOR EXTERNAL CUSTOMER APP & OPS ENGINE =====
const API_KEY = 'amaze-fab-super-admin-key-2026';

function parseCoordinates(geo: any): { lat: number; lng: number } | null {
 if (!geo) return null;
 const lat = typeof geo.latitude === 'number' ? geo.latitude :
             typeof geo.lat === 'number' ? geo.lat :
             parseFloat(String(geo.latitude || geo.lat || ''));
 const lng = typeof geo.longitude === 'number' ? geo.longitude :
             typeof geo.lng === 'number' ? geo.lng :
             typeof geo.log === 'number' ? geo.log :
             parseFloat(String(geo.longitude || geo.lng || geo.log || ''));
 if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
 return { lat, lng };
}

function getPartnerCoordinates(p: any): { lat: number; lng: number } | null {
 return parseCoordinates(p.geoLocation) || parseCoordinates({ latitude: p.latitude, longitude: p.longitude });
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
 const R = 6371;
 const dLat = (lat2 - lat1) * Math.PI / 180;
 const dLon = (lon2 - lon1) * Math.PI / 180;
 const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
           Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
           Math.sin(dLon / 2) * Math.sin(dLon / 2);
 const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
 return Math.round(R * c * 100) / 100;
}

function normalizeCat(c: any): string {
 const s = String(c || '').toUpperCase();
 if (s === 'SIGNATURE' || s === 'GOLD') return 'SIGNATURE';
 if (s === 'PRISTINE' || s === 'ORANGE' || s === 'YELLOW') return 'PRISTINE';
 if (s === 'PREMIUM' || s === 'BLUE') return 'PREMIUM';
 return s || 'PREMIUM';
}

export const api = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
 res.set('Access-Control-Allow-Origin', '*');
 res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
 res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');

 if (req.method === 'OPTIONS') {
  res.status(204).send('');
  return;
 }

 const rawPath = (req.path || '').replace(/^\/api(?:\/v1)?/, '');
 const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

 // Health check
 if (cleanPath === '/health' || cleanPath === '/test-connection' || cleanPath === '/verify') {
  res.status(200).json({
   status: 'ok',
   success: true,
   message: 'Amaze Ops Serverless API is online and healthy',
   timestamp: new Date().toISOString()
  });
  return;
 }

 // API Key authentication
 const key = req.headers['x-api-key'] || req.query.api_key;
 if (key !== API_KEY) {
  res.status(401).json({ error: 'Unauthorized: Invalid or missing x-api-key header' });
  return;
 }

 // GET /services
 if (req.method === 'GET' && cleanPath === '/services') {
  try {
   const snap = await db.collection('services').get();
   const services = snap.docs.map(d => ({ id: d.id, ...d.data() }));
   res.status(200).json({
    success: true,
    count: services.length,
    services,
    data: services
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to fetch services', details: err.message });
   return;
  }
 }

 // POST /orders
 if (req.method === 'POST' && (cleanPath === '/orders' || cleanPath === '/' || cleanPath === '')) {
  try {
   const data = req.body || {};
   const orderId = String(data.order_no || data.orderNo || data.orderId || `ORD-${Date.now()}`);
   const city = data.city || data.customer_city || data.customerCity || (data.customer && data.customer.city) || '';
   const pincode = data.pincode || data.pin_code || data.pinCode || data.postal_code || (data.customer && data.customer.pincode) || '';

   // Safely parse Hub details with multiple format support
   const rawHub = data.hub || {};
   const hubCoords = parseCoordinates(rawHub.geoLocation) ||
                     parseCoordinates(rawHub) ||
                     parseCoordinates({ latitude: data.hub_latitude || data.hubLatitude || data.hub_lat || data.hubLat, longitude: data.hub_longitude || data.hubLongitude || data.hub_lng || data.hubLng }) ||
                     { lat: 12.9352, lng: 77.6245 }; // Default to Bangalore Hub if missing

   const hubName = rawHub.name || rawHub.hubName || data.hub_name || data.hubName || 'Koramangala Central Hub';
   const hubCode = rawHub.code || rawHub.hubCode || data.hub_code || data.hubCode || 'HUB-BLR-01';
   const hubLocation = rawHub.location || rawHub.hubLocation || data.hub_location || data.hubLocation || 'Koramangala, Bangalore';
   const hubAddress = rawHub.address || data.hub_address || data.hubAddress || 'No. 42, 80 Feet Road, 4th Block, Koramangala, Bengaluru - 560034';
   const hubPhone = rawHub.phone || data.hub_phone || data.hubPhone || '+91 98450 12345';

   const hubObj = {
    name: hubName,
    code: hubCode,
    location: hubLocation,
    address: hubAddress,
    phone: hubPhone,
    latitude: hubCoords.lat,
    longitude: hubCoords.lng,
    geoLocation: {
     latitude: hubCoords.lat,
     longitude: hubCoords.lng,
    }
   };

   const garmentsList = Array.isArray(data.garments) ? data.garments.map((g: any, i: number) => {
    const rawCat = g.garment_category || g.garmentCategory || g.category || 'GOLD';
    return {
     garmentId: g.garment_id_code || g.garment_id || g.garmentId || `GAR-${orderId}-${i + 1}`,
     garment_id_code: g.garment_id_code || g.garment_id || g.garmentId || `GAR-${orderId}-${i + 1}`,
     qrCode: g.qr_code || g.qrCode || `QR-${orderId}-${i + 1}`,
     qr_code: g.qr_code || g.qrCode || `QR-${orderId}-${i + 1}`,
     garmentType: g.garment_type || g.garmentType || 'Garment',
     garment_type: g.garment_type || g.garmentType || 'Garment',
     category: rawCat,
     garmentCategory: rawCat,
     serviceType: g.service_type || g.serviceType || 'Dry clean',
     service_type: g.service_type || g.serviceType || 'Dry clean',
     status: 'PENDING',
    };
   }) : [];

   const now = new Date().toISOString();

   // Auto-split garments into sub-orders based on Care Category and nearest partner
   const partnersSnap = await db.collection('partners').get();
   const allPartners: any[] = partnersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter((p: any) => p.active !== false);

   // Group garments by Care Category
   const catGroups = new Map<string, any[]>();
   for (const g of garmentsList) {
    const catStr = String(g.garmentCategory || g.category || 'GOLD');
    if (!catGroups.has(catStr)) catGroups.set(catStr, []);
    catGroups.get(catStr)!.push(g);
   }

   const partnerAssignments: any[] = [];
   let subNum = 1;

   for (const [cat, group] of catGroups) {
    const normCat = normalizeCat(cat);
    const eligible = allPartners.filter((p: any) => {
     const pCats: string[] = (p.categoryArray || [p.category].filter(Boolean)).map((c: any) => normalizeCat(c));
     return pCats.indexOf(normCat) !== -1;
    });

    if (eligible.length === 0) continue;

    // Sort by proximity to Hub (nearest partner wins)
    const sorted = [...eligible].sort((a: any, b: any) => {
     const coordsA = getPartnerCoordinates(a);
     const coordsB = getPartnerCoordinates(b);
     const distA = coordsA ? getDistanceKm(hubCoords.lat, hubCoords.lng, coordsA.lat, coordsA.lng) : 999999;
     const distB = coordsB ? getDistanceKm(hubCoords.lat, hubCoords.lng, coordsB.lat, coordsB.lng) : 999999;

     if (Math.abs(distA - distB) >= 0.1) {
      return distA - distB;
     }
     const pa = a.priority || 99;
     const pb = b.priority || 99;
     return pa - pb;
    });

    const best: any = sorted[0];
    const bestCoords = getPartnerCoordinates(best);
    const dist = bestCoords ? getDistanceKm(hubCoords.lat, hubCoords.lng, bestCoords.lat, bestCoords.lng) : null;

    partnerAssignments.push({
     partnerId: best.id,
     partnerCode: best.partnerCode || 'P',
     partnerName: best.companyName || best.name || 'Partner',
     partnerGeoLocation: bestCoords ? { latitude: bestCoords.lat, longitude: bestCoords.lng } : null,
     careCategory: cat,
     garmentIds: group.map(g => g.garmentId),
     garmentCount: group.length,
     distanceKm: dist,
     distance: dist != null ? `${dist} km` : '',
    });
   }

   // Merge by partnerId — one sub-order per partner
   const partnerMap = new Map<string, any[]>();
   for (const a of partnerAssignments) {
    const list = partnerMap.get(a.partnerId) || [];
    list.push(a);
    partnerMap.set(a.partnerId, list);
   }

   const generatedSubOrders: any[] = [];
   const batch = db.batch();

   for (const [, group] of partnerMap) {
    const first = group[0];
    const allGarmentIds = group.flatMap(a => a.garmentIds);
    const subOrderCode = `${orderId}-${first.partnerCode}-${subNum}`;
    const subRef = db.collection('subOrders').doc(subOrderCode);

    const soData = {
     id: subOrderCode,
     orderId,
     mainOrderNumber: orderId,
     subOrderCode,
     subOrderNumber: subOrderCode,
     partnerId: first.partnerId,
     partnerCode: first.partnerCode,
     partnerName: first.partnerName,
     partnerGeoLocation: first.partnerGeoLocation,
     garmentCategory: group.map(g => g.careCategory).join(','),
     careCategory: group.map(g => g.careCategory).join(','),
     garmentIds: allGarmentIds,
     garmentCount: allGarmentIds.length,
     distanceKm: first.distanceKm,
     distance: first.distance,
     distanceFromHub: first.distance,
     status: 'ASSIGNED',
     createdAt: now,
     updatedAt: now,
    };

    batch.set(subRef, soData, { merge: true });
    generatedSubOrders.push(soData);
    subNum++;
   }

   const orderStatus = generatedSubOrders.length > 0 ? 'ASSIGNED' : 'RECEIVED';

   const orderPayload: any = {
    id: orderId,
    orderId,
    orderNumber: orderId,
    order_no: orderId,
    customer_name: data.customer_name || data.customerName || (data.customer && data.customer.name) || 'Unknown',
    customer_phone: data.customer_phone || data.customerPhone || (data.customer && data.customer.phone) || '—',
    customer_category: data.customer_category || data.customerCategory || (data.customer && data.customer.category) || 'RETAIL',
    city,
    pincode,
    customer: {
     name: data.customer_name || data.customerName || (data.customer && data.customer.name) || 'Unknown',
     phone: data.customer_phone || data.customerPhone || (data.customer && data.customer.phone) || '—',
     category: data.customer_category || data.customerCategory || (data.customer && data.customer.category) || 'RETAIL',
     city,
     pincode,
    },
    hub: hubObj,
    hubName: hubObj.name,
    hubCode: hubObj.code,
    hubLocation: hubObj.location,
    hubLatitude: hubObj.latitude,
    hubLongitude: hubObj.longitude,
    hubAddress: hubObj.address,
    hubPhone: hubObj.phone,
    careCategory: data.care_category || data.careCategory || 'Normal',
    care_category: data.care_category || data.careCategory || 'Normal',
    status: orderStatus,
    deliveryStatus: 'PENDING',
    garments: garmentsList,
    subOrders: generatedSubOrders,
    createdAt: data.created_at || now,
    updatedAt: now,
   };

   batch.set(db.collection('orders').doc(orderId), orderPayload, { merge: true });
   await batch.commit();

   // Push outbound webhook notification to external Customer App if sub-orders were generated
   const custUrl = process.env.CUSTOMER_APP_URL || 'http://localhost:5000';
   let notifySuccess = false;
   if (generatedSubOrders.length > 0) {
    try {
     const resp = await fetch(`${custUrl}/api/orders/${encodeURIComponent(orderId)}/split`, {
      method: 'POST',
      headers: {
       'Content-Type': 'application/json',
       'x-api-key': API_KEY,
      },
      body: JSON.stringify({
       mainOrderNumber: orderId,
       status: 'ASSIGNED',
       totalSubOrders: generatedSubOrders.length,
       subOrders: generatedSubOrders,
       timestamp: now,
      }),
     });
     notifySuccess = resp.ok;
    } catch (e: any) {
     // Non-fatal if customer app is async
    }
   }

   res.status(201).json({
    success: true,
    orderId,
    mainOrderNumber: orderId,
    status: orderStatus,
    totalSubOrders: generatedSubOrders.length,
    customerAppNotified: notifySuccess,
    subOrders: generatedSubOrders,
    order: orderPayload,
    message: generatedSubOrders.length > 0
     ? 'Order received and automatically split to nearest partners'
     : 'Order received and queued for partner assignment',
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to create order', details: err.message });
   return;
  }
 }

 // GET /orders (list all)
 if (req.method === 'GET' && cleanPath === '/orders') {
  try {
   const snap = await db.collection('orders').limit(100).get();
   const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
   res.status(200).json({
    success: true,
    count: orders.length,
    orders,
    data: orders
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to list orders', details: err.message });
   return;
  }
 }

 // GET /orders/:id (track order)
 const orderMatch = cleanPath.match(/^\/orders\/([^/]+)$/);
 if (req.method === 'GET' && orderMatch) {
  try {
   const targetId = orderMatch[1];
   let orderDoc = await db.collection('orders').doc(targetId).get();

   if (!orderDoc.exists) {
    const querySnap = await db.collection('orders').where('orderNumber', '==', targetId).limit(1).get();
    if (!querySnap.empty) {
     orderDoc = querySnap.docs[0];
    }
   }

   if (!orderDoc.exists) {
    res.status(404).json({ error: 'Order not found' });
    return;
   }

   const orderData: any = { id: orderDoc.id, ...orderDoc.data() };
   const curStatus = orderData.status || 'RECEIVED';

   // Enrich with subOrders if not already embedded
   if (!orderData.subOrders || orderData.subOrders.length === 0) {
    let subsSnap = await db.collection('subOrders').where('orderId', '==', orderDoc.id).get();
    if (subsSnap.empty && orderData.orderNumber) {
     subsSnap = await db.collection('subOrders').where('mainOrderNumber', '==', orderData.orderNumber).get();
    }
    if (!subsSnap.empty) {
     orderData.subOrders = subsSnap.docs.map(d => {
      const data = d.data();
      return {
       subOrderNumber: data.subOrderNumber || data.subOrderCode || d.id,
       subOrderCode: data.subOrderCode || data.subOrderNumber || d.id,
       partnerName: data.partnerName || '',
       partnerCode: data.partnerCode || '',
       partnerId: data.partnerId || '',
       status: data.status || 'ASSIGNED',
       partnerGeoLocation: data.partnerGeoLocation || null,
       distance: data.distance || (data.distanceKm != null ? `${data.distanceKm} km` : ''),
       distanceKm: data.distanceKm != null ? Number(data.distanceKm) : null,
       careCategory: data.careCategory || '',
       garmentCount: data.garmentCount || (Array.isArray(data.garmentIds) ? data.garmentIds.length : 0),
       garmentIds: data.garmentIds || [],
      };
     });
    }
   }

   const stages = ['RECEIVED', 'ASSIGNED', 'IN_PROCESS', 'QC_PENDING', 'COMPLETED', 'DELIVERED'];
   const curIdx = stages.indexOf(curStatus);

   const timeline = stages.map((st, idx) => ({
    stage: st,
    completed: idx <= curIdx,
    current: idx === curIdx,
    timestamp: idx <= curIdx ? (orderData.updatedAt || orderData.createdAt) : null
   }));

   res.status(200).json({
    success: true,
    orderId: orderData.order_no || orderData.id,
    mainOrderNumber: orderData.orderNumber || orderData.id,
    status: curStatus,
    totalSubOrders: (orderData.subOrders || []).length,
    subOrders: orderData.subOrders || [],
    timeline,
    order: orderData
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to fetch order', details: err.message });
   return;
  }
 }

 // POST /orders/:id/split (push grouped split sub-orders)
 const splitMatch = cleanPath.match(/^\/orders\/([^/]+)\/split$/);
 if (req.method === 'POST' && (splitMatch || cleanPath === '/orders/split')) {
  try {
   const mainOrderNo = splitMatch ? splitMatch[1] : (req.body.mainOrderNumber || req.body.orderId || req.body.id);
   const { subOrders, splitOrders, status } = req.body;
   const rawOrders = subOrders || splitOrders || [];
   const ordersToPush = rawOrders.map((so: any) => {
    const subCode = so.subOrderNumber || so.subOrderCode || `${mainOrderNo}-${so.partnerCode || 'P'}`;
    const distKm = so.distanceKm != null ? Number(so.distanceKm) : (so.distance ? parseFloat(so.distance) : null);
    return {
     subOrderNumber: subCode,
     subOrderCode: subCode,
     partnerName: so.partnerName || '',
     partnerCode: so.partnerCode || '',
     partnerId: so.partnerId || '',
     status: so.status || 'ASSIGNED',
     partnerGeoLocation: so.partnerGeoLocation || so.geoLocation || null,
     distance: so.distance || (distKm != null ? `${distKm} km` : ''),
     distanceKm: distKm,
     careCategory: so.careCategory || so.garmentCategory || '',
     garmentCount: so.garmentCount || (Array.isArray(so.garmentIds) ? so.garmentIds.length : 0),
     garmentIds: so.garmentIds || [],
    };
   });

   const now = new Date().toISOString();
   const batch = db.batch();

   for (const so of ordersToPush) {
    const docId = so.subOrderCode;
    const ref = db.collection('subOrders').doc(docId);
    batch.set(ref, {
     id: docId,
     orderId: mainOrderNo,
     mainOrderNumber: mainOrderNo,
     subOrderCode: so.subOrderCode,
     subOrderNumber: so.subOrderNumber,
     partnerName: so.partnerName,
     partnerCode: so.partnerCode,
     partnerId: so.partnerId,
     status: so.status,
     partnerGeoLocation: so.partnerGeoLocation,
     distance: so.distance,
     distanceKm: so.distanceKm,
     distanceFromHub: so.distance,
     careCategory: so.careCategory,
     garmentCount: so.garmentCount,
     garmentIds: so.garmentIds,
     updatedAt: now,
    }, { merge: true });
   }

   const mainOrderRef = db.collection('orders').doc(mainOrderNo);
   batch.set(mainOrderRef, {
    status: status || 'ASSIGNED',
    subOrders: ordersToPush,
    updatedAt: now,
   }, { merge: true });

   await batch.commit();

   // Outbound webhook to Customer App
   const custUrl = process.env.CUSTOMER_APP_URL || 'http://localhost:5000';
   let notifySuccess = false;
   try {
    const resp = await fetch(`${custUrl}/api/orders/${encodeURIComponent(mainOrderNo)}/split`, {
     method: 'POST',
     headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
     },
     body: JSON.stringify({
      mainOrderNumber: mainOrderNo,
      status: status || 'ASSIGNED',
      totalSubOrders: ordersToPush.length,
      subOrders: ordersToPush,
      timestamp: now,
     })
    });
    notifySuccess = resp.ok;
   } catch (e: any) {
    // Non-fatal if customer app is offline
   }

   res.status(200).json({
    success: true,
    mainOrderNumber: mainOrderNo,
    status: status || 'ASSIGNED',
    totalSubOrders: ordersToPush.length,
    customerAppNotified: notifySuccess,
    subOrders: ordersToPush,
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to split order', details: err.message });
   return;
  }
 }

 // POST /orders/:id/accept (partner accept sub-order or main order)
 const acceptMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)\/accept$/);
 if (req.method === 'POST' && acceptMatch) {
  try {
   const targetId = acceptMatch[1];
   const result = await syncSubOrderStatusAndNotify(targetId, 'IN_PROCESS');
   res.status(200).json({
    success: true,
    orderId: result.mainOrderId || targetId,
    mainOrderNumber: result.mainOrderId || targetId,
    subOrderId: result.subOrderId,
    status: result.overallStatus,
    overallStatus: result.overallStatus,
    updatedSubOrder: result.updatedSubOrder,
    totalSubOrders: result.subOrders.length,
    subOrders: result.subOrders,
    customerAppNotified: result.customerAppNotified,
    message: 'Order accepted by partner'
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to accept order', details: err.message });
   return;
  }
 }

 // POST /orders/:id/qc/submit (sub-order or main order QC submit)
 const qcSubmitMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)\/qc\/submit$/);
 if (req.method === 'POST' && qcSubmitMatch) {
  try {
   const targetId = qcSubmitMatch[1];
   const result = await syncSubOrderStatusAndNotify(targetId, 'QC_PENDING', {
    qcSubmission: req.body,
    qcStatus: 'QC_PENDING',
   });
   res.status(200).json({
    success: true,
    orderId: result.mainOrderId || targetId,
    mainOrderNumber: result.mainOrderId || targetId,
    subOrderId: result.subOrderId,
    status: result.overallStatus,
    overallStatus: result.overallStatus,
    updatedSubOrder: result.updatedSubOrder,
    totalSubOrders: result.subOrders.length,
    subOrders: result.subOrders,
    customerAppNotified: result.customerAppNotified,
    message: 'QC submitted'
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to submit QC', details: err.message });
   return;
  }
 }

 // POST /orders/:id/qc/approve
 const qcApproveMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)\/qc\/approve$/);
 if (req.method === 'POST' && qcApproveMatch) {
  try {
   const targetId = qcApproveMatch[1];
   const result = await syncSubOrderStatusAndNotify(targetId, 'READY_TO_DELIVER', {
    qcApproved: true,
    qcStatus: 'APPROVED',
   });
   res.status(200).json({
    success: true,
    orderId: result.mainOrderId || targetId,
    mainOrderNumber: result.mainOrderId || targetId,
    subOrderId: result.subOrderId,
    status: result.overallStatus,
    overallStatus: result.overallStatus,
    updatedSubOrder: result.updatedSubOrder,
    totalSubOrders: result.subOrders.length,
    subOrders: result.subOrders,
    customerAppNotified: result.customerAppNotified,
    message: 'QC approved'
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to approve QC', details: err.message });
   return;
  }
 }

 // POST /orders/:id/delivery/initiate
 const deliveryMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)\/delivery\/initiate$/);
 if (req.method === 'POST' && deliveryMatch) {
  try {
   const targetId = deliveryMatch[1];
   const result = await syncSubOrderStatusAndNotify(targetId, 'DELIVERED', {
    deliveryStatus: 'COMPLETED',
    deliveredAt: new Date().toISOString()
   });
   res.status(200).json({
    success: true,
    orderId: result.mainOrderId || targetId,
    mainOrderNumber: result.mainOrderId || targetId,
    subOrderId: result.subOrderId,
    status: result.overallStatus,
    overallStatus: result.overallStatus,
    updatedSubOrder: result.updatedSubOrder,
    totalSubOrders: result.subOrders.length,
    subOrders: result.subOrders,
    customerAppNotified: result.customerAppNotified,
    message: 'Delivery initiated and completed'
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to initiate delivery', details: err.message });
   return;
  }
 }

 // GET /partners/:partnerId/sub-orders
 const partnerSubsMatch = cleanPath.match(/^\/partners\/([^/]+)\/sub-orders$/);
 if (req.method === 'GET' && partnerSubsMatch) {
  try {
   const partnerId = partnerSubsMatch[1];
   const snap = await db.collection('subOrders').where('partnerId', '==', partnerId).get();
   let subs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
   if (subs.length === 0) {
    const snap2 = await db.collection('subOrders').where('partnerCode', '==', partnerId).get();
    subs = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
   }
   res.status(200).json({ success: true, partnerId, count: subs.length, subOrders: subs });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to fetch partner sub-orders', details: err.message });
   return;
  }
 }

 // PATCH or PUT /orders/:id/status or /sub-orders/:id/status
 const statusMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)(?:\/status)?$/);
 if ((req.method === 'PATCH' || req.method === 'PUT') && statusMatch) {
  try {
   const targetId = statusMatch[1];
   const newStatus = req.body.status;
   if (!newStatus) {
    res.status(400).json({ error: 'Status is required' });
    return;
   }
   const result = await syncSubOrderStatusAndNotify(targetId, newStatus, req.body);
   res.status(200).json({
    success: true,
    orderId: result.mainOrderId || targetId,
    mainOrderNumber: result.mainOrderId || targetId,
    subOrderId: result.subOrderId,
    status: result.overallStatus,
    overallStatus: result.overallStatus,
    updatedSubOrder: result.updatedSubOrder,
    totalSubOrders: result.subOrders.length,
    subOrders: result.subOrders,
    customerAppNotified: result.customerAppNotified,
    message: `Status updated to ${newStatus}`
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to update status', details: err.message });
   return;
  }
 }

 res.status(404).json({ error: 'Endpoint not found', path: cleanPath });
});

// ===== EXPORTS =====
export const db_instance = db;
export const admin_instance = admin;
