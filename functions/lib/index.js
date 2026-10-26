"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.admin_instance = exports.db_instance = exports.weeklyPartnerSummary = exports.dailyDeliveryReminder = exports.paymentOnCreate = exports.invoiceOnUpdate = exports.invoiceOnCreate = exports.qcRecordOnCreate = exports.subOrderOnUpdate = exports.subOrderOnCreate = exports.criticalCaseOnUpdate = exports.criticalCaseOnCreate = exports.garmentOnUpdate = exports.garmentOnCreate = exports.orderOnUpdate = exports.orderOnCreate = exports.apiInitializeFirestore = exports.apiRecordPayment = exports.apiApproveInvoice = exports.apiCreateInvoice = exports.apiSubmitQCResult = exports.apiCreateCriticalCase = exports.apiDeleteService = exports.apiUpdateService = exports.apiCreateService = exports.apiDeletePartner = exports.apiUpdatePartner = exports.apiCreatePartner = exports.apiAssignGarmentsToPartner = exports.apiAddGarmentsToOrder = exports.apiCreateOrder = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const orderService_1 = require("./services/orderService");
const callableFunctions_1 = require("./services/callableFunctions");
// Initialize Firebase Admin — emulator-safe (no production creds)
admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();
// ===== CALLABLE (HTTP) FUNCTIONS =====
exports.apiCreateOrder = callableFunctions_1.createOrder;
exports.apiAddGarmentsToOrder = callableFunctions_1.addGarmentsToOrder;
exports.apiAssignGarmentsToPartner = callableFunctions_1.assignGarmentsToPartner;
exports.apiCreatePartner = callableFunctions_1.createPartner;
exports.apiUpdatePartner = callableFunctions_1.updatePartner;
exports.apiDeletePartner = callableFunctions_1.deletePartner;
exports.apiCreateService = callableFunctions_1.createService;
exports.apiUpdateService = callableFunctions_1.updateService;
exports.apiDeleteService = callableFunctions_1.deleteService;
exports.apiCreateCriticalCase = callableFunctions_1.createCriticalCase;
exports.apiSubmitQCResult = callableFunctions_1.submitQCResult;
exports.apiCreateInvoice = callableFunctions_1.createInvoice;
exports.apiApproveInvoice = callableFunctions_1.approveInvoice;
exports.apiRecordPayment = callableFunctions_1.recordPayment;
exports.apiInitializeFirestore = callableFunctions_1.initializeFirestore;
// ===== FIRESTORE TRIGGERS =====
// Orders
exports.orderOnCreate = functions.firestore
    .document('orders/{orderId}')
    .onCreate((snap) => (0, orderService_1.onOrderCreated)(snap));
exports.orderOnUpdate = functions.firestore
    .document('orders/{orderId}')
    .onUpdate((change) => (0, orderService_1.onOrderUpdated)(change));
// Garments
exports.garmentOnCreate = functions.firestore
    .document('garments/{garmentId}')
    .onCreate((snap) => (0, orderService_1.onGarmentCreated)(snap));
exports.garmentOnUpdate = functions.firestore
    .document('garments/{garmentId}')
    .onUpdate((change) => (0, orderService_1.onGarmentStatusUpdated)(change));
// Critical Cases
exports.criticalCaseOnCreate = functions.firestore
    .document('criticalCases/{caseId}')
    .onCreate((snap) => (0, orderService_1.onCriticalCaseCreated)(snap));
exports.criticalCaseOnUpdate = functions.firestore
    .document('criticalCases/{caseId}')
    .onUpdate((change) => (0, orderService_1.onCriticalCaseUpdated)(change));
// Sub-Orders
exports.subOrderOnCreate = functions.firestore
    .document('orders/{orderId}/subOrders/{subOrderId}')
    .onCreate((snap) => (0, orderService_1.onSubOrderCreated)(snap));
exports.subOrderOnUpdate = functions.firestore
    .document('orders/{orderId}/subOrders/{subOrderId}')
    .onUpdate((change) => (0, orderService_1.onSubOrderUpdated)(change));
// QC Records
exports.qcRecordOnCreate = functions.firestore
    .document('qcRecords/{qcId}')
    .onCreate((snap) => (0, orderService_1.onQCRecordCreated)(snap));
// Invoices
exports.invoiceOnCreate = functions.firestore
    .document('invoices/{invoiceId}')
    .onCreate((snap) => (0, orderService_1.onInvoiceCreated)(snap));
exports.invoiceOnUpdate = functions.firestore
    .document('invoices/{invoiceId}')
    .onUpdate((change) => (0, orderService_1.onInvoiceUpdated)(change));
// Payments
exports.paymentOnCreate = functions.firestore
    .document('payments/{paymentId}')
    .onCreate((snap) => (0, orderService_1.onPaymentCreated)(snap));
// ===== SCHEDULED FUNCTIONS =====
// Daily reminder for pending deliveries
exports.dailyDeliveryReminder = functions.pubsub.schedule('0 9 * * *').onRun(async (context) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const snapshot = await db.collection('orders')
        .where('status', 'in', ['IN_PROCESS', 'COMPLETED'])
        .where('deliveryDate', '==', tomorrowStr)
        .get();
    const userNotifications = {};
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
exports.weeklyPartnerSummary = functions.pubsub.schedule('0 8 * * 1').onRun(async (context) => {
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
exports.db_instance = db;
exports.admin_instance = admin;
