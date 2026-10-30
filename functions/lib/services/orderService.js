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
exports.onOrderCreated = onOrderCreated;
exports.onOrderUpdated = onOrderUpdated;
exports.onGarmentCreated = onGarmentCreated;
exports.onGarmentStatusUpdated = onGarmentStatusUpdated;
exports.onCriticalCaseCreated = onCriticalCaseCreated;
exports.onCriticalCaseUpdated = onCriticalCaseUpdated;
exports.onSubOrderCreated = onSubOrderCreated;
exports.calculateOverallOrderStatus = calculateOverallOrderStatus;
exports.syncSubOrderStatusAndNotify = syncSubOrderStatusAndNotify;
exports.onSubOrderUpdated = onSubOrderUpdated;
exports.onQCRecordCreated = onQCRecordCreated;
exports.onInvoiceCreated = onInvoiceCreated;
exports.onInvoiceUpdated = onInvoiceUpdated;
exports.onPaymentCreated = onPaymentCreated;
const admin = __importStar(require("firebase-admin"));
const auth_1 = require("../middleware/auth");
// ===== ORDER TRIGGERS =====
async function onOrderCreated(snap) {
    const order = snap.data();
    // Create timeline event
    await snap.ref.collection('timeline').add({
        action: 'ORDER_CREATED',
        description: `Order ${order.orderNumber} created`,
        createdBy: order.createdBy || 'system',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Notify all staff
    await (0, auth_1.notifyRoles)(['ADMIN', 'STAFF'], 'New Order Created', `Order ${order.orderNumber} has been placed by ${order.customerName}`);
    await (0, auth_1.logAudit)({
        action: 'ORDER_CREATED',
        entityType: 'order',
        entityId: snap.id,
        userId: order.createdBy || 'system',
        userRole: order.createdByRole || 'STAFF',
        changes: { orderNumber: order.orderNumber, customerName: order.customerName },
    });
}
async function onOrderUpdated(change) {
    const order = change.after.data();
    const prevData = change.before.data();
    const changes = {};
    Object.keys(order).forEach(key => {
        if (key !== 'updatedAt' && JSON.stringify(order[key]) !== JSON.stringify(prevData[key])) {
            changes[key] = { from: prevData[key], to: order[key] };
        }
    });
    if (Object.keys(changes).length > 0) {
        await change.after.ref.collection('timeline').add({
            action: 'ORDER_UPDATED',
            description: `Order ${order.orderNumber} updated`,
            changes,
            createdBy: order.updatedBy || 'system',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (order.status === 'DELIVERED' && prevData.status !== 'DELIVERED') {
            await (0, auth_1.notifyRoles)(['ADMIN'], 'Order Delivered', `Order ${order.orderNumber} has been marked as delivered`);
        }
        await (0, auth_1.logAudit)({
            action: 'ORDER_UPDATED',
            entityType: 'order',
            entityId: change.after.id,
            userId: order.updatedBy || 'system',
            userRole: order.updatedByRole || 'STAFF',
            changes,
        });
    }
}
// ===== GARMENT TRIGGERS =====
async function onGarmentCreated(snap) {
    const garment = snap.data();
    await (0, auth_1.logAudit)({
        action: 'GARMENT_CREATED',
        entityType: 'garment',
        entityId: snap.id,
        userId: garment.createdBy || 'system',
        userRole: garment.createdByRole || 'STAFF',
        changes: { garmentNumber: garment.garmentNumber, serviceType: garment.serviceType },
    });
}
async function onGarmentStatusUpdated(change) {
    const garment = change.after.data();
    const prevData = change.before.data();
    if (garment.status === prevData.status)
        return;
    // Timeline event
    await change.after.ref.collection('timeline').add({
        action: 'STATUS_CHANGED',
        description: `Garment #${garment.garmentNumber}: ${prevData.status} → ${garment.status}`,
        createdBy: garment.updatedBy || 'system',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // If assigned to a partner, create notification
    if (garment.assignedPartnerId && garment.status === 'ASSIGNED') {
        const partnerUser = await admin.firestore().collection('users')
            .where('partnerId', '==', garment.assignedPartnerId)
            .get();
        const notifs = partnerUser.docs.map(userDoc => (0, auth_1.createNotification)({
            userId: userDoc.id,
            title: 'New Garment Assigned',
            message: `Garment #${garment.garmentNumber} has been assigned to your partner`,
            type: 'INFO',
            link: `/garments/${change.after.id}`,
        }));
        await Promise.all(notifs);
    }
    // If QC failed, create critical case automatically
    if (garment.status === 'QC_FAILED' && prevData.status !== 'QC_FAILED') {
        const orderDoc = await admin.firestore().collection('orders').doc(garment.orderId).get();
        const orderData = orderDoc.data();
        await admin.firestore().collection('criticalCases').add({
            garmentId: change.after.id,
            orderId: garment.orderId,
            partnerId: garment.assignedPartnerId || null,
            issueType: 'QC_FAILURE',
            description: `Garment #${garment.garmentNumber} failed quality check`,
            severity: 'MEDIUM',
            status: 'OPEN',
            autoGenerated: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: 'system',
        });
        await (0, auth_1.notifyRoles)(['ADMIN', 'STAFF'], 'QC Failure Detected', `Garment #${garment.garmentNumber} failed QC on order ${orderData?.orderNumber}`);
    }
    await (0, auth_1.logAudit)({
        action: 'GARMENT_STATUS_CHANGED',
        entityType: 'garment',
        entityId: change.after.id,
        userId: garment.updatedBy || 'system',
        userRole: garment.updatedByRole || 'STAFF',
        changes: { status: { from: prevData.status, to: garment.status } },
    });
}
// ===== CRITICAL CASE TRIGGERS =====
async function onCriticalCaseCreated(snap) {
    const criticalCase = snap.data();
    await (0, auth_1.notifyRoles)(['ADMIN', 'STAFF'], 'Critical Case Created', `Critical case for garment #${criticalCase.garmentId} (${criticalCase.issueType}) — Severity: ${criticalCase.severity}`, 'WARNING');
    await (0, auth_1.logAudit)({
        action: 'CRITICAL_CASE_CREATED',
        entityType: 'criticalCase',
        entityId: snap.id,
        userId: criticalCase.createdBy || 'system',
        userRole: criticalCase.createdByRole || 'STAFF',
        changes: { issueType: criticalCase.issueType, severity: criticalCase.severity },
        metadata: { garmentId: criticalCase.garmentId, orderId: criticalCase.orderId },
    });
}
async function onCriticalCaseUpdated(change) {
    const criticalCase = change.after.data();
    const prevData = change.before.data();
    if (criticalCase.status === prevData.status)
        return;
    if (criticalCase.status === 'RESOLVED' && prevData.status !== 'RESOLVED') {
        await (0, auth_1.notifyRoles)(['ADMIN'], 'Critical Case Resolved', `Critical case for garment #${criticalCase.garmentId} has been resolved`);
        await (0, auth_1.logAudit)({
            action: 'CRITICAL_CASE_RESOLVED',
            entityType: 'criticalCase',
            entityId: change.after.id,
            userId: criticalCase.resolvedBy || 'system',
            userRole: criticalCase.resolvedByRole || 'ADMIN',
            changes: { status: { from: prevData.status, to: criticalCase.status } },
            metadata: { garmentId: criticalCase.garmentId, orderId: criticalCase.orderId },
        });
    }
}
// ===== SUB-ORDER TRIGGERS =====
async function onSubOrderCreated(snap) {
    const subOrder = snap.data();
    const partnerUser = await admin.firestore().collection('users')
        .where('partnerId', '==', subOrder.partnerId)
        .get();
    const notifs = partnerUser.docs.map(userDoc => (0, auth_1.createNotification)({
        userId: userDoc.id,
        title: 'New Sub-Order Assigned',
        message: `You have been assigned ${subOrder.garmentIds.length} garment(s) for processing`,
        type: 'INFO',
        link: `/sub-orders/${snap.id}`,
    }));
    await Promise.all(notifs);
    if (subOrder.orderId) {
        const orderRef = admin.firestore().collection('orders').doc(subOrder.orderId);
        const orderSnap = await orderRef.get();
        if (orderSnap.exists) {
            await orderRef.collection('timeline').add({
                action: 'SUB_ORDER_CREATED',
                description: `Sub-order created for ${subOrder.garmentIds.length} garments`,
                createdBy: 'system',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
    }
}
const API_KEY = 'amaze-fab-super-admin-key-2026';
function calculateOverallOrderStatus(subOrders) {
    if (!subOrders || subOrders.length === 0)
        return 'RECEIVED';
    const statuses = subOrders.map(s => String(s.status || '').toUpperCase());
    // If all are DELIVERED or COMPLETED
    if (statuses.every(s => s === 'DELIVERED' || s === 'COMPLETED')) {
        return 'DELIVERED';
    }
    // If all are READY_TO_DELIVER or DELIVERED / COMPLETED
    if (statuses.every(s => ['READY_TO_DELIVER', 'QC_APPROVED', 'COMPLETED', 'DELIVERED'].includes(s))) {
        return 'READY_TO_DELIVER';
    }
    // If any is QC_REJECTED
    if (statuses.some(s => s === 'QC_REJECTED' || s === 'REJECTED')) {
        return 'QC_REJECTED';
    }
    // If any is QC_PENDING or QC_SENT
    if (statuses.some(s => ['QC_PENDING', 'QC_SENT', 'QC_IN_PROGRESS'].includes(s))) {
        return 'QC_PENDING';
    }
    // If any is IN_PROCESS / IN_PROGRESS / ACCEPTED / PROCESSING
    if (statuses.some(s => ['IN_PROCESS', 'IN_PROGRESS', 'ACCEPTED', 'PROCESSING', 'QC_APPROVED', 'READY_TO_DELIVER'].includes(s))) {
        return 'IN_PROCESS';
    }
    // If all are ASSIGNED
    return 'ASSIGNED';
}
async function syncSubOrderStatusAndNotify(targetId, newStatus, extraData = {}) {
    const db = admin.firestore();
    const now = new Date().toISOString();
    // 1. Resolve sub-order or main order
    let subDocSnap = await db.collection('subOrders').doc(targetId).get();
    if (!subDocSnap.exists) {
        const q = await db.collection('subOrders').where('subOrderCode', '==', targetId).limit(1).get();
        if (!q.empty) {
            subDocSnap = q.docs[0];
        }
        else {
            const q2 = await db.collection('subOrders').where('subOrderNumber', '==', targetId).limit(1).get();
            if (!q2.empty) {
                subDocSnap = q2.docs[0];
            }
        }
    }
    let mainOrderId = '';
    let subOrderId = null;
    let updatedSubOrderData = null;
    if (subDocSnap.exists) {
        subOrderId = subDocSnap.id;
        const subData = subDocSnap.data() || {};
        mainOrderId = subData.mainOrderNumber || subData.orderId || '';
        // Update target sub-order
        const subUpdatePayload = {
            status: newStatus,
            updatedAt: now,
            ...extraData,
        };
        await db.collection('subOrders').doc(subOrderId).set(subUpdatePayload, { merge: true });
    }
    else {
        mainOrderId = targetId;
        if (extraData.subOrderNumber || extraData.subOrderId) {
            const sId = String(extraData.subOrderNumber || extraData.subOrderId);
            const sSnap = await db.collection('subOrders').doc(sId).get();
            if (sSnap.exists) {
                subOrderId = sId;
                await db.collection('subOrders').doc(sId).set({
                    status: newStatus,
                    updatedAt: now,
                    ...extraData,
                }, { merge: true });
            }
        }
    }
    // 2. Fetch all sibling sub-orders for this main order
    let siblingSubOrders = [];
    if (mainOrderId) {
        let subsSnap = await db.collection('subOrders').where('orderId', '==', mainOrderId).get();
        if (subsSnap.empty) {
            subsSnap = await db.collection('subOrders').where('mainOrderNumber', '==', mainOrderId).get();
        }
        siblingSubOrders = subsSnap.docs.map(doc => {
            const d = doc.data();
            const isTarget = subOrderId ? doc.id === subOrderId : false;
            const effectiveStatus = isTarget ? newStatus : (d.status || 'ASSIGNED');
            return {
                subOrderNumber: d.subOrderNumber || d.subOrderCode || doc.id,
                subOrderCode: d.subOrderCode || d.subOrderNumber || doc.id,
                partnerName: d.partnerName || '',
                partnerCode: d.partnerCode || '',
                partnerId: d.partnerId || '',
                status: effectiveStatus,
                partnerGeoLocation: d.partnerGeoLocation || null,
                distance: d.distance || (d.distanceKm != null ? `${d.distanceKm} km` : ''),
                distanceKm: d.distanceKm != null ? Number(d.distanceKm) : null,
                careCategory: d.careCategory || d.garmentCategory || '',
                garmentCount: d.garmentCount || (Array.isArray(d.garmentIds) ? d.garmentIds.length : 0),
                garmentIds: d.garmentIds || [],
                updatedAt: isTarget ? now : (d.updatedAt || now),
            };
        });
    }
    // 3. Compute overall status
    const overallStatus = siblingSubOrders.length > 0
        ? calculateOverallOrderStatus(siblingSubOrders)
        : newStatus;
    // 4. Update parent order in orders collection
    if (mainOrderId) {
        const parentUpdate = {
            status: overallStatus,
            updatedAt: now,
        };
        if (siblingSubOrders.length > 0) {
            parentUpdate.subOrders = siblingSubOrders;
        }
        if (newStatus === 'QC_PENDING' || extraData.qcSubmission) {
            parentUpdate.qcStatus = 'QC_PENDING';
            if (extraData.qcSubmission)
                parentUpdate.qcSubmission = extraData.qcSubmission;
        }
        else if (newStatus === 'READY_TO_DELIVER' || newStatus === 'QC_APPROVED') {
            parentUpdate.qcStatus = 'APPROVED';
            parentUpdate.qcApproved = true;
        }
        else if (newStatus === 'DELIVERED') {
            parentUpdate.deliveryStatus = 'COMPLETED';
            parentUpdate.deliveredAt = now;
        }
        await db.collection('orders').doc(mainOrderId).set(parentUpdate, { merge: true });
    }
    if (subOrderId) {
        updatedSubOrderData = siblingSubOrders.find(s => s.subOrderNumber === subOrderId || s.subOrderCode === subOrderId) || {
            subOrderNumber: subOrderId,
            status: newStatus,
            updatedAt: now,
        };
    }
    // 5. Send outbound webhook notification to external Customer App
    const custUrl = process.env.CUSTOMER_APP_URL || 'http://localhost:5000';
    let notifySuccess = false;
    if (mainOrderId) {
        try {
            const resp = await fetch(`${custUrl}/api/orders/${encodeURIComponent(mainOrderId)}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': API_KEY,
                },
                body: JSON.stringify({
                    mainOrderNumber: mainOrderId,
                    overallStatus,
                    updatedSubOrder: updatedSubOrderData,
                    totalSubOrders: siblingSubOrders.length,
                    subOrders: siblingSubOrders,
                    timestamp: now,
                }),
            });
            notifySuccess = resp.ok;
        }
        catch (e) {
            // Non-fatal if customer app is async / offline
        }
    }
    return {
        success: true,
        mainOrderId,
        subOrderId,
        overallStatus,
        updatedSubOrder: updatedSubOrderData,
        subOrders: siblingSubOrders,
        customerAppNotified: notifySuccess,
    };
}
async function onSubOrderUpdated(change) {
    const subOrder = change.after.data();
    const prevData = change.before.data();
    if (subOrder.status === prevData.status)
        return;
    const subOrderId = change.after.id;
    await syncSubOrderStatusAndNotify(subOrderId, subOrder.status, subOrder);
    if (subOrder.status === 'COMPLETED' && prevData.status !== 'COMPLETED') {
        if (subOrder.orderId) {
            await (0, auth_1.notifyRoles)(['ADMIN', 'STAFF'], 'Sub-Order Completed', `Sub-order for ${subOrder.garmentIds?.length || 0} garments has been completed by partner`);
        }
    }
}
// ===== QC RECORD TRIGGERS =====
async function onQCRecordCreated(snap) {
    const qcRecord = snap.data();
    await (0, auth_1.notifyRoles)(['ADMIN'], 'QC Record Created', `QC record created for garment #${qcRecord.garmentId}`, 'INFO');
}
// ===== INVOICE TRIGGERS =====
async function onInvoiceCreated(snap) {
    const invoice = snap.data();
    await (0, auth_1.notifyRoles)(['ADMIN'], 'Invoice Pending Approval', `Invoice #${invoice.invoiceNumber} of ${invoice.total} requires approval`, 'INFO');
    if (invoice.partnerId) {
        const partnerUser = await admin.firestore().collection('users')
            .where('partnerId', '==', invoice.partnerId)
            .get();
        const notifs = partnerUser.docs.map(userDoc => (0, auth_1.createNotification)({
            userId: userDoc.id,
            title: 'New Invoice Created',
            message: `Invoice #${invoice.invoiceNumber} has been created`,
            type: 'INFO',
            link: `/invoices/${snap.id}`,
        }));
        await Promise.all(notifs);
    }
}
async function onInvoiceUpdated(change) {
    const invoice = change.after.data();
    const prevData = change.before.data();
    if (invoice.status === 'APPROVED' && prevData.status !== 'APPROVED') {
        if (invoice.partnerId) {
            const partnerUser = await admin.firestore().collection('users')
                .where('partnerId', '==', invoice.partnerId)
                .get();
            const notifs = partnerUser.docs.map(userDoc => (0, auth_1.createNotification)({
                userId: userDoc.id,
                title: 'Invoice Approved',
                message: `Invoice #${invoice.invoiceNumber} has been approved for payment`,
                type: 'SUCCESS',
                link: `/invoices/${change.after.id}`,
            }));
            await Promise.all(notifs);
        }
    }
}
// ===== PAYMENT TRIGGERS =====
async function onPaymentCreated(snap) {
    const payment = snap.data();
    // Create wallet transaction
    const walletRef = admin.firestore().collection('walletTransactions').doc();
    await walletRef.set({
        partnerId: payment.partnerId,
        type: 'CREDIT',
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference || null,
        invoiceId: payment.invoiceId,
        paymentId: snap.id,
        status: 'COMPLETED',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Notify partner
    const partnerUser = await admin.firestore().collection('users')
        .where('partnerId', '==', payment.partnerId)
        .get();
    const notifs = partnerUser.docs.map(userDoc => (0, auth_1.createNotification)({
        userId: userDoc.id,
        title: 'Payment Received',
        message: `Payment of ₹${payment.amount} has been processed for your account`,
        type: 'SUCCESS',
    }));
    await Promise.all(notifs);
    await (0, auth_1.logAudit)({
        action: 'PAYMENT_RECORDED',
        entityType: 'payment',
        entityId: snap.id,
        userId: payment.createdBy || 'system',
        userRole: payment.createdByRole || 'ADMIN',
        changes: { amount: payment.amount, method: payment.method, partnerId: payment.partnerId },
        metadata: { invoiceId: payment.invoiceId },
    });
}
