"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateNotificationSchema = exports.CreateAuditLogSchema = exports.CreateExceptionSchema = exports.WalletAdjustmentSchema = exports.CreatePaymentSchema = exports.ApproveInvoiceSchema = exports.CreateInvoiceSchema = exports.QCResultSchema = exports.CreateCriticalCaseSchema = exports.CreateSubOrderSchema = exports.UpdateGarmentStatusSchema = exports.CreateGarmentSchema = exports.CreateOrderSchema = exports.CreatePartnerSchema = exports.CreateUserSchema = void 0;
const zod_1 = require("zod");
// ===== USER SCHEMAS =====
exports.CreateUserSchema = zod_1.z.object({
    uid: zod_1.z.string(),
    email: zod_1.z.string().email(),
    displayName: zod_1.z.string(),
    phoneNumber: zod_1.z.string().optional(),
    role: zod_1.z.enum(['ADMIN', 'STAFF', 'PARTNER']),
    partnerId: zod_1.z.string().optional(),
});
// ===== PARTNER SCHEMAS =====
exports.CreatePartnerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    contactPerson: zod_1.z.string(),
    phone: zod_1.z.string(),
    email: zod_1.z.string().email(),
    address: zod_1.z.string(),
    gstNumber: zod_1.z.string().optional(),
    bankDetails: zod_1.z.object({
        accountNumber: zod_1.z.string(),
        ifscCode: zod_1.z.string(),
        accountHolderName: zod_1.z.string(),
    }).optional(),
});
// ===== ORDER SCHEMAS =====
exports.CreateOrderSchema = zod_1.z.object({
    orderNumber: zod_1.z.string().min(1),
    customerName: zod_1.z.string(),
    customerPhone: zod_1.z.string(),
    customerEmail: zod_1.z.string().email().optional(),
    deliveryDate: zod_1.z.string(),
    specialInstructions: zod_1.z.string().optional(),
    totalGarments: zod_1.z.number().int().positive(),
    garmentType: zod_1.z.string(),
    estimatedWeight: zod_1.z.number().positive().optional(),
    address: zod_1.z.object({
        street: zod_1.z.string(),
        city: zod_1.z.string(),
        state: zod_1.z.string(),
        pincode: zod_1.z.string(),
    }),
});
// ===== GARMENT SCHEMAS =====
exports.CreateGarmentSchema = zod_1.z.object({
    orderId: zod_1.z.string(),
    partnerId: zod_1.z.string().optional(),
    garmentNumber: zod_1.z.number().int(),
    description: zod_1.z.string(),
    serviceType: zod_1.z.string(),
    notes: zod_1.z.string().optional(),
});
exports.UpdateGarmentStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['RECEIVED', 'ASSIGNED', 'IN_PROCESS', 'COMPLETED', 'DELIVERED', 'QC_FAILED', 'CRITICAL_CASE']),
    assignedPartnerId: zod_1.z.string().optional(),
});
// ===== SUBORDER SCHEMAS =====
exports.CreateSubOrderSchema = zod_1.z.object({
    orderId: zod_1.z.string(),
    partnerId: zod_1.z.string(),
    garmentIds: zod_1.z.array(zod_1.z.string()),
    notes: zod_1.z.string().optional(),
});
// ===== CRITICAL CASE SCHEMAS =====
exports.CreateCriticalCaseSchema = zod_1.z.object({
    garmentId: zod_1.z.string(),
    orderId: zod_1.z.string(),
    partnerId: zod_1.z.string().optional(),
    issueType: zod_1.z.string(),
    description: zod_1.z.string(),
    severity: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});
exports.QCResultSchema = zod_1.z.object({
    decision: zod_1.z.enum(['REPAIR', 'REPLACE', 'REFUND', 'COMPLETE']),
    notes: zod_1.z.string().optional(),
    resolutionCost: zod_1.z.number().nonnegative().optional(),
});
// ===== INVOICE SCHEMAS =====
exports.CreateInvoiceSchema = zod_1.z.object({
    orderId: zod_1.z.string(),
    partnerId: zod_1.z.string().optional(),
    lineItems: zod_1.z.array(zod_1.z.object({
        description: zod_1.z.string(),
        quantity: zod_1.z.number().int().positive(),
        unitPrice: zod_1.z.number().nonnegative(),
        amount: zod_1.z.number().nonnegative(),
    })),
    subtotal: zod_1.z.number().nonnegative(),
    tax: zod_1.z.number().nonnegative(),
    discount: zod_1.z.number().nonnegative(),
    total: zod_1.z.number().nonnegative(),
});
exports.ApproveInvoiceSchema = zod_1.z.object({
    invoiceId: zod_1.z.string(),
});
// ===== PAYMENT SCHEMAS =====
exports.CreatePaymentSchema = zod_1.z.object({
    invoiceId: zod_1.z.string(),
    partnerId: zod_1.z.string(),
    amount: zod_1.z.number().positive(),
    method: zod_1.z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE']),
    reference: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
// ===== WALLET SCHEMAS =====
exports.WalletAdjustmentSchema = zod_1.z.object({
    partnerId: zod_1.z.string(),
    type: zod_1.z.enum(['CREDIT', 'DEBIT']),
    amount: zod_1.z.number().positive(),
    reason: zod_1.z.string(),
    relatedId: zod_1.z.string().optional(),
});
// ===== EXCEPTION SCHEMAS =====
exports.CreateExceptionSchema = zod_1.z.object({
    type: zod_1.z.string(),
    orderId: zod_1.z.string().optional(),
    garmentId: zod_1.z.string().optional(),
    partnerId: zod_1.z.string().optional(),
    description: zod_1.z.string(),
    priority: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH']),
});
// ===== AUDIT LOG SCHEMAS =====
exports.CreateAuditLogSchema = zod_1.z.object({
    action: zod_1.z.string(),
    entityType: zod_1.z.string(),
    entityId: zod_1.z.string(),
    userId: zod_1.z.string(),
    userRole: zod_1.z.string(),
    changes: zod_1.z.record(zod_1.z.any()).optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
// ===== NOTIFICATION SCHEMAS =====
exports.CreateNotificationSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    title: zod_1.z.string(),
    message: zod_1.z.string(),
    type: zod_1.z.enum(['INFO', 'WARNING', 'ERROR', 'SUCCESS']),
    link: zod_1.z.string().optional(),
});
