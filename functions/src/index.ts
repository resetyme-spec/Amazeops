import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

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

// ===== PUBLIC REST API FOR EXTERNAL CUSTOMER APP =====
const API_KEY = 'amaze-fab-super-admin-key-2026';

export const api = functions.https.onRequest(async (req, res) => {
 res.set('Access-Control-Allow-Origin', '*');
 res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
 res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

 if (req.method === 'OPTIONS') {
  res.status(204).send('');
  return;
 }

 const key = req.headers['x-api-key'];
 if (key !== API_KEY) {
  res.status(401).json({ error: 'Unauthorized: Invalid x-api-key header' });
  return;
 }

 const path = req.path;

 // POST /orders or POST /api/orders
 if (req.method === 'POST' && (path === '/orders' || path === '/api/orders' || path === '/' || path === '')) {
  try {
   const data = req.body || {};
   const orderId = String(data.order_no || data.orderNo || data.orderId || `ORD-${Date.now()}`);

   const orderPayload = {
    id: orderId,
    orderId,
    orderNumber: orderId,
    customer: {
     name: data.customer_name || data.customerName || 'Unknown',
     phone: data.customer_phone || data.customerPhone || '—',
     category: data.customer_category || data.customerCategory || 'RETAIL',
    },
    careCategory: data.care_category || data.careCategory || 'Normal',
    status: data.status || 'RECEIVED',
    garments: Array.isArray(data.garments) ? data.garments.map((g: any, i: number) => ({
     garmentId: g.garment_id_code || g.garmentId || `GAR-${orderId}-${i + 1}`,
     qrCode: g.qr_code || g.qrCode || `QR-${orderId}-${i + 1}`,
     garmentType: g.garment_type || g.garmentType || 'Garment',
     category: g.category || 'OTHER',
     garmentCategory: g.garment_category || g.garmentCategory || g.category || 'GOLD',
     serviceType: g.service_type || g.serviceType || 'Standard',
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

 // GET /orders/:id or GET /api/orders/:id
 const match = path.match(/^\/?(?:api\/)?orders\/([^/]+)$/);
 if (req.method === 'GET' && match) {
  try {
   const targetId = match[1];
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

   res.status(200).json({
    success: true,
    order: { id: orderDoc.id, ...orderDoc.data() },
   });
   return;
  } catch (err: any) {
   res.status(500).json({ error: 'Failed to fetch order', details: err.message });
   return;
  }
 }

 res.status(404).json({ error: 'Endpoint not found', path });
});

// ===== EXPORTS =====
export const db_instance = db;
export const admin_instance = admin;
