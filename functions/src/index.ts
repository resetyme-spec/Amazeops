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

// ===== EXPORTS =====
export const db_instance = db;
export const admin_instance = admin;
