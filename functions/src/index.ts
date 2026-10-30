process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'amaze-ops';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import {
 onOrderCreated, onOrderUpdated, onGarmentCreated, onGarmentStatusUpdated,
 onCriticalCaseCreated, onCriticalCaseUpdated, onSubOrderCreated, onSubOrderUpdated,
 onQCRecordCreated, onInvoiceCreated, onInvoiceUpdated, onPaymentCreated
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
    careCategory: data.care_category || data.careCategory || 'Normal',
    care_category: data.care_category || data.careCategory || 'Normal',
    status: data.status || 'RECEIVED',
    deliveryStatus: 'PENDING',
    garments: Array.isArray(data.garments) ? data.garments.map((g: any, i: number) => ({
     garmentId: g.garment_id_code || g.garment_id || g.garmentId || `GAR-${orderId}-${i + 1}`,
     garment_id_code: g.garment_id_code || g.garment_id || g.garmentId || `GAR-${orderId}-${i + 1}`,
     qrCode: g.qr_code || g.qrCode || `QR-${orderId}-${i + 1}`,
     qr_code: g.qr_code || g.qrCode || `QR-${orderId}-${i + 1}`,
     garmentType: g.garment_type || g.garmentType || 'Garment',
     garment_type: g.garment_type || g.garmentType || 'Garment',
     category: g.category || 'GOLD',
     garmentCategory: g.garment_category || g.garmentCategory || g.category || 'GOLD',
     serviceType: g.service_type || g.serviceType || 'Wash & Iron',
     service_type: g.service_type || g.serviceType || 'Wash & Iron',
     status: 'PENDING',
    })) : [],
    createdAt: data.created_at || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
   };

   await db.collection('orders').doc(orderId).set(orderPayload, { merge: true });

   res.status(201).json({
    success: true,
    orderId,
    message: 'Order received and queued for partner assignment',
    order: orderPayload,
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

 // POST /orders/:id/accept (partner accept)
 const acceptMatch = cleanPath.match(/^\/orders\/([^/]+)\/accept$/);
 if (req.method === 'POST' && acceptMatch) {
  try {
   const targetId = acceptMatch[1];
   await db.collection('orders').doc(targetId).set({
    status: 'IN_PROCESS',
    updatedAt: new Date().toISOString()
   }, { merge: true });
   res.status(200).json({ success: true, orderId: targetId, status: 'IN_PROCESS', message: 'Order accepted by partner' });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to accept order', details: err.message });
   return;
  }
 }

 // POST /orders/:id/qc/submit
 const qcSubmitMatch = cleanPath.match(/^\/orders\/([^/]+)\/qc\/submit$/);
 if (req.method === 'POST' && qcSubmitMatch) {
  try {
   const targetId = qcSubmitMatch[1];
   await db.collection('orders').doc(targetId).set({
    status: 'QC_PENDING',
    qcSubmission: req.body,
    updatedAt: new Date().toISOString()
   }, { merge: true });
   res.status(200).json({ success: true, orderId: targetId, status: 'QC_PENDING', message: 'QC submitted' });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to submit QC', details: err.message });
   return;
  }
 }

 // POST /orders/:id/qc/approve
 const qcApproveMatch = cleanPath.match(/^\/orders\/([^/]+)\/qc\/approve$/);
 if (req.method === 'POST' && qcApproveMatch) {
  try {
   const targetId = qcApproveMatch[1];
   await db.collection('orders').doc(targetId).set({
    status: 'READY_TO_DELIVER',
    qcApproved: true,
    updatedAt: new Date().toISOString()
   }, { merge: true });
   res.status(200).json({ success: true, orderId: targetId, status: 'READY_TO_DELIVER', message: 'QC approved' });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to approve QC', details: err.message });
   return;
  }
 }

 // POST /orders/:id/delivery/initiate
 const deliveryMatch = cleanPath.match(/^\/orders\/([^/]+)\/delivery\/initiate$/);
 if (req.method === 'POST' && deliveryMatch) {
  try {
   const targetId = deliveryMatch[1];
   await db.collection('orders').doc(targetId).set({
    status: 'DELIVERED',
    deliveryStatus: 'COMPLETED',
    deliveredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
   }, { merge: true });
   res.status(200).json({ success: true, orderId: targetId, status: 'DELIVERED', message: 'Delivery initiated and completed' });
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

 // PATCH or PUT /orders/:id/status
 const statusMatch = cleanPath.match(/^\/orders\/([^/]+)(?:\/status)?$/);
 if ((req.method === 'PATCH' || req.method === 'PUT') && statusMatch) {
  try {
   const targetId = statusMatch[1];
   const newStatus = req.body.status;
   if (!newStatus) {
    res.status(400).json({ error: 'Status is required' });
    return;
   }
   await db.collection('orders').doc(targetId).set({
    status: newStatus,
    updatedAt: new Date().toISOString()
   }, { merge: true });

   res.status(200).json({ success: true, message: `Status updated to ${newStatus}` });
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
