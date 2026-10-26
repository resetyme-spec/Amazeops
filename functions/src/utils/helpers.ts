import { z } from 'zod';
import * as validators from './validators';

export function validateBody<T extends z.ZodSchema>(
 schema: T,
 data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: string } {
 const result = schema.safeParse(data);
 if (!result.success) {
 return {
 success: false,
 error: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
 };
 }
 return { success: true, data: result.data };
}

export function generateId(prefix: string): string {
 return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function generateOrderNumber(): string {
 const year = new Date().getFullYear().toString().slice(-2);
 const month = String(new Date().getMonth() + 1).padStart(2, '0');
 const random = Math.floor(1000 + Math.random() * 9000);
 return `AMF/${year}${month}/${random}`;
}

export function formatCurrency(amount: number): string {
 return new Intl.NumberFormat('en-IN', {
 style: 'currency',
 currency: 'INR',
 minimumFractionDigits: 2,
 }).format(amount);
}

export function formatDate(timestamp: { toDate: () => Date }): string {
 return timestamp.toDate().toLocaleDateString('en-IN', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 });
}

export function getStatusBadgeColor(status: string): string {
 const colors: Record<string, string> = {
 RECEIVED: '#3b82f6',
 ASSIGNED: '#8b5cf6',
 IN_PROCESS: '#f59e0b',
 COMPLETED: '#10b981',
 DELIVERED: '#059669',
 QC_FAILED: '#ef4444',
 CRITICAL_CASE: '#dc2626',
 PENDING: '#f59e0b',
 APPROVED: '#10b981',
 REJECTED: '#ef4444',
 PAID: '#10b981',
 PARTIAL: '#f59e0b',
 PENDING_QC: '#3b82f6',
 PENDING_APPROVAL: '#8b5cf6',
 };
 return colors[status] || '#6b7280';
}

export function getPriorityColor(priority: string): string {
 const colors: Record<string, string> = {
 LOW: '#10b981',
 MEDIUM: '#f59e0b',
 HIGH: '#f97316',
 CRITICAL: '#ef4444',
 };
 return colors[priority] || '#6b7280';
}

export function getSeverityColor(severity: string): string {
 const colors: Record<string, string> = {
 LOW: '#10b981',
 MEDIUM: '#f59e0b',
 HIGH: '#f97316',
 CRITICAL: '#ef4444',
 };
 return colors[severity] || '#6b7280';
}
