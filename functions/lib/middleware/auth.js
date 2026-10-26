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
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
exports.logAudit = logAudit;
exports.createNotification = createNotification;
exports.notifyRoles = notifyRoles;
const admin = __importStar(require("firebase-admin"));
async function requireAuth(context) {
    if (!context.auth) {
        throw new Error('Unauthorized: No authentication token provided');
    }
    const decoded = context.auth.token;
    const userRef = admin.firestore().collection('users').doc(context.auth.uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        throw new Error('Unauthorized: User not found');
    }
    const userData = userDoc.data();
    return {
        uid: context.auth.uid,
        email: decoded.email || '',
        role: userData.role,
        partnerId: userData.partnerId,
        token: context.auth,
    };
}
function requireRole(allowedRoles) {
    return async (context) => {
        const auth = await requireAuth(context);
        if (!allowedRoles.includes(auth.role)) {
            throw new Error(`Forbidden: Role '${auth.role}' is not authorized`);
        }
        return auth;
    };
}
async function logAudit(params) {
    const { action, entityType, entityId, userId, userRole, changes, metadata } = params;
    await admin.firestore().collection('auditLogs').add({
        action,
        entityType,
        entityId,
        userId,
        userRole,
        changes: changes || null,
        metadata: metadata ? { ...metadata, ipAddress: metadata.ipAddress || null } : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}
async function createNotification(params) {
    const { userId, title, message, type, link } = params;
    await admin.firestore().collection('notifications').add({
        userId,
        title,
        message,
        type,
        link: link || null,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}
async function notifyRoles(roles, title, message, type = 'INFO') {
    const usersSnapshot = await admin.firestore().collection('users')
        .where('role', 'in', roles)
        .get();
    const notifications = usersSnapshot.docs.map(doc => admin.firestore().collection('notifications').add({
        userId: doc.id,
        title,
        message,
        type,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }));
    await Promise.all(notifications);
}
