import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export interface AuthContext {
 uid: string;
 email: string;
 role: 'ADMIN' | 'STAFF' | 'PARTNER';
 partnerId?: string;
 token: functions.https.CallableContext['auth'] & admin.auth.DecodedIdToken;
}

export async function requireAuth(context: functions.https.CallableContext): Promise<AuthContext> {
 if (!context.auth) {
 throw new Error('Unauthorized: No authentication token provided');
 }

 const decoded = context.auth.token;
 const userRef = admin.firestore().collection('users').doc(context.auth.uid);
 const userDoc = await userRef.get();

 if (!userDoc.exists) {
 throw new Error('Unauthorized: User not found');
 }

 const userData = userDoc.data()!;

 return {
 uid: context.auth.uid,
 email: decoded.email || '',
 role: userData.role,
 partnerId: userData.partnerId,
 token: context.auth as any,
 };
}

export function requireRole(allowedRoles: string[]) {
 return async (context: functions.https.CallableContext): Promise<AuthContext> => {
 const auth = await requireAuth(context);
 if (!allowedRoles.includes(auth.role)) {
 throw new Error(`Forbidden: Role '${auth.role}' is not authorized`);
 }
 return auth;
 };
}

export async function logAudit(params: {
 action: string;
 entityType: string;
 entityId: string;
 userId: string;
 userRole: string;
 changes?: Record<string, any>;
 metadata?: Record<string, any>;
 }) {
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

export async function createNotification(params: {
 userId: string;
 title: string;
 message: string;
 type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
 link?: string;
}) {
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

export async function notifyRoles(
 roles: string[],
 title: string,
 message: string,
 type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' = 'INFO'
) {
 const usersSnapshot = await admin.firestore().collection('users')
 .where('role', 'in', roles)
 .get();

 const notifications = usersSnapshot.docs.map(doc =>
 admin.firestore().collection('notifications').add({
 userId: doc.id,
 title,
 message,
 type,
 read: false,
 createdAt: admin.firestore.FieldValue.serverTimestamp(),
 })
);

 await Promise.all(notifications);
}
