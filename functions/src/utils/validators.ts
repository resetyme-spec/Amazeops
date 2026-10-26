import { z } from 'zod';

// ===== USER SCHEMAS =====
export const CreateUserSchema = z.object({
 uid: z.string(),
 email: z.string().email(),
 displayName: z.string(),
 phoneNumber: z.string().optional(),
 role: z.enum(['ADMIN', 'STAFF', 'PARTNER']),
 partnerId: z.string().optional(),
});

// ===== PARTNER SCHEMAS =====
export const CreatePartnerSchema = z.object({
 name: z.string().min(1),
 contactPerson: z.string(),
 phone: z.string(),
 email: z.string().email(),
 address: z.string(),
 gstNumber: z.string().optional(),
 bankDetails: z.object({
 accountNumber: z.string(),
 ifscCode: z.string(),
 accountHolderName: z.string(),
 }).optional(),
});

// ===== ORDER SCHEMAS =====
export const CreateOrderSchema = z.object({
 orderNumber: z.string().min(1),
 customerName: z.string(),
 customerPhone: z.string(),
 customerEmail: z.string().email().optional(),
 deliveryDate: z.string(),
 specialInstructions: z.string().optional(),
 totalGarments: z.number().int().positive(),
 garmentType: z.string(),
 estimatedWeight: z.number().positive().optional(),
 address: z.object({
 street: z.string(),
 city: z.string(),
 state: z.string(),
 pincode: z.string(),
 }),
});

// ===== GARMENT SCHEMAS =====
export const CreateGarmentSchema = z.object({
 orderId: z.string(),
 partnerId: z.string().optional(),
 garmentNumber: z.number().int(),
 description: z.string(),
 serviceType: z.string(),
 notes: z.string().optional(),
});

export const UpdateGarmentStatusSchema = z.object({
 status: z.enum(['RECEIVED', 'ASSIGNED', 'IN_PROCESS', 'COMPLETED', 'DELIVERED', 'QC_FAILED', 'CRITICAL_CASE']),
 assignedPartnerId: z.string().optional(),
});

// ===== SUBORDER SCHEMAS =====
export const CreateSubOrderSchema = z.object({
 orderId: z.string(),
 partnerId: z.string(),
 garmentIds: z.array(z.string()),
 notes: z.string().optional(),
});

// ===== CRITICAL CASE SCHEMAS =====
export const CreateCriticalCaseSchema = z.object({
 garmentId: z.string(),
 orderId: z.string(),
 partnerId: z.string().optional(),
 issueType: z.string(),
 description: z.string(),
 severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});

export const QCResultSchema = z.object({
 decision: z.enum(['REPAIR', 'REPLACE', 'REFUND', 'COMPLETE']),
 notes: z.string().optional(),
 resolutionCost: z.number().nonnegative().optional(),
});

// ===== INVOICE SCHEMAS =====
export const CreateInvoiceSchema = z.object({
 orderId: z.string(),
 partnerId: z.string().optional(),
 lineItems: z.array(z.object({
 description: z.string(),
 quantity: z.number().int().positive(),
 unitPrice: z.number().nonnegative(),
 amount: z.number().nonnegative(),
 })),
 subtotal: z.number().nonnegative(),
 tax: z.number().nonnegative(),
 discount: z.number().nonnegative(),
 total: z.number().nonnegative(),
});

export const ApproveInvoiceSchema = z.object({
 invoiceId: z.string(),
});

// ===== PAYMENT SCHEMAS =====
export const CreatePaymentSchema = z.object({
 invoiceId: z.string(),
 partnerId: z.string(),
 amount: z.number().positive(),
 method: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE']),
 reference: z.string().optional(),
 notes: z.string().optional(),
});

// ===== WALLET SCHEMAS =====
export const WalletAdjustmentSchema = z.object({
 partnerId: z.string(),
 type: z.enum(['CREDIT', 'DEBIT']),
 amount: z.number().positive(),
 reason: z.string(),
 relatedId: z.string().optional(),
});

// ===== EXCEPTION SCHEMAS =====
export const CreateExceptionSchema = z.object({
 type: z.string(),
 orderId: z.string().optional(),
 garmentId: z.string().optional(),
 partnerId: z.string().optional(),
 description: z.string(),
 priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

// ===== AUDIT LOG SCHEMAS =====
export const CreateAuditLogSchema = z.object({
 action: z.string(),
 entityType: z.string(),
 entityId: z.string(),
 userId: z.string(),
 userRole: z.string(),
 changes: z.record(z.any()).optional(),
 metadata: z.record(z.any()).optional(),
});

// ===== NOTIFICATION SCHEMAS =====
export const CreateNotificationSchema = z.object({
 userId: z.string(),
 title: z.string(),
 message: z.string(),
 type: z.enum(['INFO', 'WARNING', 'ERROR', 'SUCCESS']),
 link: z.string().optional(),
});

// Type exports
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type CreatePartner = z.infer<typeof CreatePartnerSchema>;
export type CreateOrder = z.infer<typeof CreateOrderSchema>;
export type CreateGarment = z.infer<typeof CreateGarmentSchema>;
export type UpdateGarmentStatus = z.infer<typeof UpdateGarmentStatusSchema>;
export type CreateSubOrder = z.infer<typeof CreateSubOrderSchema>;
export type CreateCriticalCase = z.infer<typeof CreateCriticalCaseSchema>;
export type QCResult = z.infer<typeof QCResultSchema>;
export type CreateInvoice = z.infer<typeof CreateInvoiceSchema>;
export type ApproveInvoice = z.infer<typeof ApproveInvoiceSchema>;
export type CreatePayment = z.infer<typeof CreatePaymentSchema>;
export type WalletAdjustment = z.infer<typeof WalletAdjustmentSchema>;
export type CreateException = z.infer<typeof CreateExceptionSchema>;
export type CreateAuditLog = z.infer<typeof CreateAuditLogSchema>;
export type CreateNotification = z.infer<typeof CreateNotificationSchema>;
