"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = validateBody;
exports.generateId = generateId;
exports.generateOrderNumber = generateOrderNumber;
exports.formatCurrency = formatCurrency;
exports.formatDate = formatDate;
exports.getStatusBadgeColor = getStatusBadgeColor;
exports.getPriorityColor = getPriorityColor;
exports.getSeverityColor = getSeverityColor;
function validateBody(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        return {
            success: false,
            error: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        };
    }
    return { success: true, data: result.data };
}
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
function generateOrderNumber() {
    const year = new Date().getFullYear().toString().slice(-2);
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `AMF/${year}${month}/${random}`;
}
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
    }).format(amount);
}
function formatDate(timestamp) {
    return timestamp.toDate().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}
function getStatusBadgeColor(status) {
    const colors = {
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
function getPriorityColor(priority) {
    const colors = {
        LOW: '#10b981',
        MEDIUM: '#f59e0b',
        HIGH: '#f97316',
        CRITICAL: '#ef4444',
    };
    return colors[priority] || '#6b7280';
}
function getSeverityColor(severity) {
    const colors = {
        LOW: '#10b981',
        MEDIUM: '#f59e0b',
        HIGH: '#f97316',
        CRITICAL: '#ef4444',
    };
    return colors[severity] || '#6b7280';
}
