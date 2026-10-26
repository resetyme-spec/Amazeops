
import * as z from 'zod';

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth, requireRole, logAudit, notifyRoles } from '../middleware/auth';
import * as validators from '../utils/validators';
import { generateOrderNumber, validateBody } from '../utils/helpers';

function getDb() {
 return admin.firestore();
}

// ===== CREATE ORDER =====
export const createOrder = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

 const validation = validateBody(validators.CreateOrderSchema, data);
 if (!validation.success) {
 throw new functions.https.HttpsError('invalid-argument', validation.error);
 }

 const { totalGarments, garmentType, ...orderData } = validation.data;
 const auth = await requireAuth(context);

 const orderRef = getDb().collection('orders').doc();
 const orderNumber = generateOrderNumber();

 const orderPayload = {
 orderNumber,
 customerName: orderData.customerName,
 customerPhone: orderData.customerPhone,
 customerEmail: orderData.customerEmail || null,
 deliveryDate: orderData.deliveryDate,
 specialInstructions: orderData.specialInstructions || null,
 totalGarments,
 garmentType,
 estimatedWeight: orderData.estimatedWeight || 0,
 address: orderData.address,
 status: 'RECEIVED',
 totalAmount: 0,
 paidAmount: 0,
 balanceAmount: 0,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 createdBy: auth.uid,
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 };

 await orderRef.create(orderPayload);

 // Add timeline event
 await orderRef.collection('timeline').add({
 action: 'ORDER_CREATED',
 description: `Order ${orderNumber} created`,
 createdBy: auth.uid,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await logAudit({
 action: 'CREATE_ORDER',
 entityType: 'order',
 entityId: orderRef.id,
 userId: auth.uid,
 userRole: auth.role,
 changes: { orderNumber, totalGarments, customerName: orderData.customerName },
 });

 return { success: true, orderId: orderRef.id, orderNumber };
});

// ===== ADD GARMENTS TO ORDER =====
export const addGarmentsToOrder = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

 const validation = validateBody(z.object({
 orderId: z.string(),
 garments: z.array(validators.CreateGarmentSchema),
 }), data);
 if (!validation.success) {
 throw new functions.https.HttpsError('invalid-argument', validation.error);
 }

 const auth = await requireRole(['ADMIN', 'STAFF'])(context);
 const { orderId, garments } = validation.data;

 const orderSnap = await getDb().collection('orders').doc(orderId).get();
 if (!orderSnap.exists) {
 throw new functions.https.HttpsError('not-found', 'Order not found');
 }

 const batch = getDb().batch();
 const garmentCount = garments.length;

 for (let i = 0; i < garments.length; i++) {
 const garment = garments[i];
 const garmentRef = getDb().collection('orders').doc(orderId).collection('garments').doc();
 batch.create(garmentRef, {
 orderId,
 garmentNumber: garment.garmentNumber || i + 1,
 description: garment.description,
 serviceType: garment.serviceType,
 notes: garment.notes || null,
 status: 'RECEIVED',
 partnerId: null,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 // Also create top-level garment document
 const topLevelRef = getDb().collection('garments').doc();
 batch.create(topLevelRef, {
 orderId,
 garmentNumber: garment.garmentNumber || i + 1,
 description: garment.description,
 serviceType: garment.serviceType,
 notes: garment.notes || null,
 status: 'RECEIVED',
 partnerId: null,
 subOrderId: null,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });
 }

 // Update order garment count
 batch.update(orderSnap.ref, {
 totalGarments: admin.firestore.FieldValue.increment(garmentCount),
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 // Add timeline event
 const timelineRef = getDb().collection('orders').doc(orderId).collection('timeline').doc();
 batch.create(timelineRef, {
 action: 'GARMENTS_ADDED',
 description: `${garmentCount} garment(s) added to order`,
 createdBy: auth.uid,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await batch.commit();

 await logAudit({
 action: 'ADD_GARMENTS',
 entityType: 'order',
 entityId: orderId,
 userId: auth.uid,
 userRole: auth.role,
 changes: { garmentCount },
 });

 return { success: true, garmentCount };
});

// ===== ASSIGN GARMENTS TO PARTNER =====
export const assignGarmentsToPartner = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

 const validation = validateBody(z.object({
 orderId: z.string(),
 garmentIds: z.array(z.string()),
 partnerId: z.string(),
 notes: z.string().optional(),
 }), data);
 if (!validation.success) {
 throw new functions.https.HttpsError('invalid-argument', validation.error);
 }

 const auth = await requireRole(['ADMIN', 'STAFF'])(context);
 const { orderId, garmentIds, partnerId, notes } = validation.data;

 // Verify partner exists
 const partnerSnap = await getDb().collection('partners').doc(partnerId).get();
 if (!partnerSnap.exists) {
 throw new functions.https.HttpsError('not-found', 'Partner not found');
 }

 // Create sub-order
 const subOrderRef = getDb().collection('orders').doc(orderId).collection('subOrders').doc();
 await subOrderRef.create({
 orderId,
 partnerId,
 garmentIds,
 notes: notes || null,
 status: 'PENDING',
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 createdBy: auth.uid,
 });

 // Update garments
 const batch = getDb().batch();
 for (const garmentId of garmentIds) {
 const garmentRef = getDb().collection('orders').doc(orderId).collection('garments').doc(garmentId);
 const topGarmentRef = getDb().collection('garments').doc(garmentId);

 batch.update(garmentRef, {
 status: 'ASSIGNED',
 partnerId,
 subOrderId: subOrderRef.id,
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 batch.update(topGarmentRef, {
 status: 'ASSIGNED',
 partnerId,
 subOrderId: subOrderRef.id,
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });
 }

 // Add timeline event
 const timelineRef = getDb().collection('orders').doc(orderId).collection('timeline').doc();
 batch.create(timelineRef, {
 action: 'GARMENTS_ASSIGNED',
 description: `${garmentIds.length} garment(s) assigned to partner`,
 metadata: { partnerId, garmentCount: garmentIds.length },
 createdBy: auth.uid,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await batch.commit();

 // Notify partner
 const partnerUserSnap = await getDb().collection('users').where('partnerId', '==', partnerId).get();
 partnerUserSnap.docs.forEach(userDoc => {
 functions.logger.log(`Notifying partner user ${userDoc.id}`);
 // Notifications are handled by the trigger
 });

 await logAudit({
 action: 'ASSIGN_GARMENTS',
 entityType: 'subOrder',
 entityId: subOrderRef.id,
 userId: auth.uid,
 userRole: auth.role,
 changes: { partnerId, garmentCount: garmentIds.length },
 metadata: { orderId },
 });

 return { success: true, subOrderId: subOrderRef.id };
});

// ===== CREATE PARTNER =====
export const createPartner = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
 const auth = await requireRole(['ADMIN', 'STAFF'])(context);

 const validation = validateBody(z.object({
 companyName: z.string().min(1),
 partnerCode: z.string().optional(),
 category: z.enum(['GOLD', 'YELLOW', 'BLUE']),
 contactPerson: z.string(),
 email: z.string().email(),
 phone: z.string(),
 address: z.string(),
 geoLocation: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
 gstNumber: z.string().optional(),
 billingPeriod: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'CUSTOM']),
 customBillingDays: z.number().positive().optional(),
 services: z.array(z.string()).optional(),
 status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
 active: z.boolean().default(true),
 bankAccount: z.object({ accountNumber: z.string(), ifscCode: z.string(), accountHolder: z.string() }).optional(),
 }), data);
 if (!validation.success) {
 throw new functions.https.HttpsError('invalid-argument', validation.error);
 }

 const payload = validation.data;
 const partnerCode = payload.partnerCode || `${payload.category[0].toUpperCase()}P${String(Date.now()).slice(-2)}`;

 const partnerRef = getDb().collection('partners').doc();
 await partnerRef.create({
 companyName: payload.companyName,
 partnerCode,
 category: payload.category,
 contactPerson: payload.contactPerson,
 email: payload.email,
 phone: payload.phone,
 address: payload.address,
 geoLocation: payload.geoLocation || null,
 gstNumber: payload.gstNumber || null,
 billingPeriod: payload.billingPeriod,
 customBillingDays: payload.billingPeriod === 'CUSTOM' ? payload.customBillingDays : null,
 services: payload.services || [],
 status: payload.status,
 active: payload.active,
 bankAccount: payload.bankAccount || null,
 rating: 0,
 totalOrders: 0,
 totalEarnings: 0,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await logAudit({
 action: 'CREATE_PARTNER',
 entityType: 'partner',
 entityId: partnerRef.id,
 userId: auth.uid,
 userRole: auth.role,
 changes: { companyName: payload.companyName, partnerCode, category: payload.category },
 });

 return { success: true, partnerId: partnerRef.id, partnerCode };
});

// ===== UPDATE PARTNER =====
export const updatePartner = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
 const auth = await requireRole(['ADMIN', 'STAFF'])(context);

 const { partnerId, ...updates } = data;
 if (!partnerId) throw new functions.https.HttpsError('invalid-argument', 'partnerId required');

 const partnerRef = getDb().collection('partners').doc(partnerId);
 const snap = await partnerRef.get();
 if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Partner not found');

 await partnerRef.update({
 ...updates,
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await logAudit({
 action: 'UPDATE_PARTNER',
 entityType: 'partner',
 entityId: partnerId,
 userId: auth.uid,
 userRole: auth.role,
 changes: updates,
 });

 return { success: true };
});

// ===== DELETE PARTNER =====
export const deletePartner = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
 const auth = await requireRole(['ADMIN'])(context);

 const { partnerId } = data;
 if (!partnerId) throw new functions.https.HttpsError('invalid-argument', 'partnerId required');

 const partnerRef = getDb().collection('partners').doc(partnerId);
 await partnerRef.update({
 status: 'SUSPENDED',
 active: false,
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await logAudit({
 action: 'DELETE_PARTNER',
 entityType: 'partner',
 entityId: partnerId,
 userId: auth.uid,
 userRole: auth.role,
 });

 return { success: true };
});

// ===== CREATE SERVICE =====
export const createService = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
 await requireRole(['ADMIN', 'STAFF'])(context);

 const validation = validateBody(z.object({
 name: z.string().min(1),
 amazeFabServiceId: z.string().min(1),
 description: z.string().optional(),
 goldRate: z.number().nonnegative(),
 yellowRate: z.number().nonnegative(),
 blueRate: z.number().nonnegative(),
 active: z.boolean().default(true),
 }), data);
 if (!validation.success) {
 throw new functions.https.HttpsError('invalid-argument', validation.error);
 }

 const payload = validation.data;
 const serviceRef = getDb().collection('services').doc();
 await serviceRef.create({
 name: payload.name,
 amazeFabServiceId: payload.amazeFabServiceId,
 description: payload.description || null,
 goldRate: payload.goldRate,
 yellowRate: payload.yellowRate,
 blueRate: payload.blueRate,
 active: payload.active,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await logAudit({
 action: 'CREATE_SERVICE',
 entityType: 'service',
 entityId: serviceRef.id,
 userId: context.auth!.uid,
 userRole: (await requireAuth(context)).role,
 changes: { name: payload.name, amazeFabServiceId: payload.amazeFabServiceId },
 });

 return { success: true, serviceId: serviceRef.id };
});

// ===== UPDATE SERVICE =====
export const updateService = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
 await requireRole(['ADMIN', 'STAFF'])(context);

 const { serviceId, ...updates } = data;
 if (!serviceId) throw new functions.https.HttpsError('invalid-argument', 'serviceId required');

 const serviceRef = getDb().collection('services').doc(serviceId);
 const snap = await serviceRef.get();
 if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Service not found');

 await serviceRef.update({
 ...updates,
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await logAudit({
 action: 'UPDATE_SERVICE',
 entityType: 'service',
 entityId: serviceId,
 userId: context.auth!.uid,
 userRole: (await requireAuth(context)).role,
 changes: updates,
 });

 return { success: true };
});

// ===== DELETE/DEACTIVATE SERVICE =====
export const deleteService = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
 await requireRole(['ADMIN', 'STAFF'])(context);

 const { serviceId } = data;
 if (!serviceId) throw new functions.https.HttpsError('invalid-argument', 'serviceId required');

 const serviceRef = getDb().collection('services').doc(serviceId);
 await serviceRef.update({
 active: false,
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await logAudit({
 action: 'DELETE_SERVICE',
 entityType: 'service',
 entityId: serviceId,
 userId: context.auth!.uid,
 userRole: (await requireAuth(context)).role,
 });

 return { success: true };
});

// ===== CREATE CRITICAL CASE =====
export const createCriticalCase = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

 const validation = validateBody(validators.CreateCriticalCaseSchema, data);
 if (!validation.success) {
 throw new functions.https.HttpsError('invalid-argument', validation.error);
 }

 const auth = await requireAuth(context);
 const { garmentId, orderId, partnerId, issueType, description, severity } = validation.data;

 const caseRef = getDb().collection('criticalCases').doc();
 await caseRef.create({
 garmentId,
 orderId,
 partnerId: partnerId || null,
 issueType,
 description,
 severity,
 status: 'OPEN',
 autoGenerated: false,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 createdBy: auth.uid,
 });

 // Update garment status
 const garmentSnap = await getDb().collection('garments').doc(garmentId).get();
 if (garmentSnap.exists) {
 await garmentSnap.ref.update({
 status: 'CRITICAL_CASE',
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });
 }

 await notifyRoles(
 ['ADMIN', 'STAFF'],
 'Critical Case Created',
 `${issueType} — Severity: ${severity}`,
 'WARNING'
 );

 await logAudit({
 action: 'CRITICAL_CASE_CREATED',
 entityType: 'criticalCase',
 entityId: caseRef.id,
 userId: auth.uid,
 userRole: auth.role,
 changes: { issueType, severity },
 metadata: { garmentId, orderId },
 });

 return { success: true, caseId: caseRef.id };
});

// ===== SUBMIT QC RESULT =====
export const submitQCResult = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

 const validation = validateBody(z.object({
 garmentId: z.string(),
 orderId: z.string(),
 decision: z.enum(['REPAIR', 'REPLACE', 'REFUND', 'COMPLETE']),
 notes: z.string().optional(),
 resolutionCost: z.number().nonnegative().optional(),
 }), data);
 if (!validation.success) {
 throw new functions.https.HttpsError('invalid-argument', validation.error);
 }

 const auth = await requireRole(['ADMIN', 'STAFF'])(context);
 const { garmentId, orderId, decision, notes, resolutionCost } = validation.data;

 // Create QC record
 const qcRef = getDb().collection('qcRecords').doc();
 await qcRef.create({
 garmentId,
 orderId,
 decision,
 notes: notes || null,
 resolutionCost: resolutionCost || 0,
 inspectorId: auth.uid,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 // Update garment status
 const garmentRef = getDb().collection('garments').doc(garmentId);
 const orderGarmentRef = getDb().collection('orders').doc(orderId).collection('garments').doc(garmentId);

 const newStatus = decision === 'COMPLETE' ? 'COMPLETED' : 'QC_FAILED';

 await garmentRef.update({
 status: newStatus,
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 const orderGarmentSnap = await orderGarmentRef.get();
 if (orderGarmentSnap.exists) {
 await orderGarmentRef.update({
 status: newStatus,
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });
 }

 // If QC failed, create critical case
 if (decision !== 'COMPLETE') {
 const caseRef = getDb().collection('criticalCases').doc();
 await caseRef.create({
 garmentId,
 orderId,
 issueType: `QC_${decision}`,
 description: notes || `QC decision: ${decision}`,
 severity: decision === 'REFUND' ? 'CRITICAL' : 'HIGH',
 status: 'OPEN',
 autoGenerated: true,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 createdBy: 'system',
 });
 }

 await logAudit({
 action: 'QC_SUBMITTED',
 entityType: 'qcRecord',
 entityId: qcRef.id,
 userId: auth.uid,
 userRole: auth.role,
 changes: { decision, resolutionCost },
 metadata: { garmentId, orderId },
 });

 return { success: true, qcId: qcRef.id };
});

// ===== CREATE INVOICE =====
export const createInvoice = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

 const validation = validateBody(validators.CreateInvoiceSchema, data);
 if (!validation.success) {
 throw new functions.https.HttpsError('invalid-argument', validation.error);
 }

 const auth = await requireRole(['ADMIN', 'STAFF'])(context);
 const { orderId, partnerId, lineItems, subtotal, tax, discount, total } = validation.data;

 const invoiceRef = getDb().collection('invoices').doc();
 const invoiceNumber = `INV/${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;

 await invoiceRef.create({
 invoiceNumber,
 orderId,
 partnerId: partnerId || null,
 lineItems,
 subtotal,
 tax,
 discount,
 total,
 status: 'PENDING_APPROVAL',
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 createdBy: auth.uid,
 });

 await logAudit({
 action: 'INVOICE_CREATED',
 entityType: 'invoice',
 entityId: invoiceRef.id,
 userId: auth.uid,
 userRole: auth.role,
 changes: { invoiceNumber, total },
 metadata: { orderId, partnerId },
 });

 return { success: true, invoiceId: invoiceRef.id, invoiceNumber };
});

// ===== APPROVE INVOICE =====
export const approveInvoice = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

 const validation = validateBody(validators.ApproveInvoiceSchema, data);
 if (!validation.success) {
 throw new functions.https.HttpsError('invalid-argument', validation.error);
 }

 const auth = await requireRole(['ADMIN'])(context);
 const { invoiceId } = validation.data;

 const invoiceSnap = await getDb().collection('invoices').doc(invoiceId).get();
 if (!invoiceSnap.exists) {
 throw new functions.https.HttpsError('not-found', 'Invoice not found');
 }

 await invoiceSnap.ref.update({
 status: 'APPROVED',
 approvedBy: auth.uid,
 approvedAt: admin.firestore.FieldValue.serverTimestamp(),
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await logAudit({
 action: 'INVOICE_APPROVED',
 entityType: 'invoice',
 entityId: invoiceId,
 userId: auth.uid,
 userRole: auth.role,
 changes: { status: { from: 'PENDING_APPROVAL', to: 'APPROVED' } },
 });

 return { success: true };
});

// ===== RECORD PAYMENT =====
export const recordPayment = functions.https.onCall(async (data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

 const validation = validateBody(validators.CreatePaymentSchema, data);
 if (!validation.success) {
 throw new functions.https.HttpsError('invalid-argument', validation.error);
 }

 const auth = await requireRole(['ADMIN'])(context);
 const { invoiceId, partnerId, amount, method, reference, notes } = validation.data;

 const paymentRef = getDb().collection('payments').doc();
 await paymentRef.create({
 invoiceId,
 partnerId,
 amount,
 method,
 reference: reference || null,
 notes: notes || null,
 status: 'COMPLETED',
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 createdBy: auth.uid,
 });

 // Update invoice
 await getDb().collection('invoices').doc(invoiceId).update({
 status: 'PAID',
 paidAmount: admin.firestore.FieldValue.increment(amount),
 balanceAmount: admin.firestore.FieldValue.increment(-amount),
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 // Create wallet transaction
 const walletRef = getDb().collection('walletTransactions').doc();
 await walletRef.set({
 partnerId,
 type: 'CREDIT',
 amount,
 method,
 reference: reference || null,
 invoiceId,
 paymentId: paymentRef.id,
 status: 'COMPLETED',
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await logAudit({
 action: 'PAYMENT_RECORDED',
 entityType: 'payment',
 entityId: paymentRef.id,
 userId: auth.uid,
 userRole: auth.role,
 changes: { amount, method },
 metadata: { invoiceId, partnerId },
 });

 return { success: true, paymentId: paymentRef.id };
});

// ===== INITIALIZE FIRESTORE DATA =====
export const initializeFirestore = functions.https.onCall(async (_data, context) => {
 if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

 const auth = await requireRole(['ADMIN'])(context);

 const batch = getDb().batch();

 // Create sample status data for orders
 const orderRef = getDb().collection('orders').doc('sample-order');
 batch.set(orderRef, {
 orderNumber: 'AMF/26/0001',
 customerName: 'Sample Customer',
 customerPhone: '+91 9876543210',
 customerEmail: 'sample@example.com',
 deliveryDate: '2026-10-01',
 totalGarments: 0,
 garmentType: 'Shirts',
 status: 'RECEIVED',
 totalAmount: 0,
 paidAmount: 0,
 balanceAmount: 0,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 createdBy: auth.uid,
 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 // Create a partner
 const partnerRef = getDb().collection('partners').doc('sample-partner');
 batch.set(partnerRef, {
 name: 'Demo Partner',
 contactPerson: 'Partner Contact',
 phone: '+91 9876543210',
 email: 'partner@demo.com',
 address: 'Mumbai, India',
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 });

 await batch.commit();

 return { success: true, message: 'Firestore initialized with sample data' };
});

