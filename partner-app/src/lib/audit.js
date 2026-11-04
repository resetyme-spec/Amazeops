// Centralized Audit & Activity Logging for Partner & Staff Actions
import { db } from './firebase';
import { collection, doc, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Log an operational action performed by Staff or Partner.
 * Writes to both the central 'activityLogs' collection and the order's 'timeline'.
 *
 * @param {Object} params
 * @param {string} params.action - e.g. 'QC_APPROVED', 'QC_REJECTED', 'INVOICE_CHECKED', 'STATUS_CHANGE'
 * @param {string} [params.orderId] - Parent order ID
 * @param {string} [params.subOrderId] - Partner sub-order ID
 * @param {string} [params.partnerId] - Partner ID
 * @param {string} [params.previousValue] - e.g. 'QC_PENDING'
 * @param {string} [params.newValue] - e.g. 'COMPLETED'
 * @param {string} [params.comments] - Rejection reason, approval notes, or audit comment
 * @param {Object} [params.metadata] - Extra details (garments, device, etc.)
 * @param {Object} params.actor - The logged in user object (id, name, role)
 */
export async function logStaffActivity({
  action,
  orderId,
  subOrderId,
  partnerId,
  previousValue = null,
  newValue = null,
  comments = null,
  metadata = {},
  actor,
}) {
  if (!actor || !action) return;

  const nowIso = new Date().toISOString();
  const logId = `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const logEntry = {
    logId,
    userId: actor.id || 'unknown',
    userName: actor.name || actor.email || 'Staff Member',
    role: actor.role || 'STAFF',
    action,
    orderId: orderId || null,
    subOrderId: subOrderId || null,
    partnerId: partnerId || null,
    previousValue: previousValue || null,
    newValue: newValue || null,
    comments: comments || null,
    metadata: {
      ...metadata,
      platform: typeof window !== 'undefined' && window.Capacitor ? 'Android/Capacitor' : 'Web Browser',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    },
    timestamp: nowIso,
    createdAt: serverTimestamp(),
  };

  // 1. Add to central activityLogs collection (queried by Admin Activity Logs page)
  try {
    await addDoc(collection(db, 'activityLogs'), logEntry);
    console.log(`[Audit] Logged action ${action} by ${actor.name} (${actor.role}) for order ${subOrderId || orderId}`);
  } catch (err) {
    console.warn('[Audit] Could not write to activityLogs collection:', err);
  }

  // 2. Add to parent order timeline if parent orderId is present
  if (orderId) {
    try {
      const description = comments
        ? `${actor.name} (${actor.role}): ${action} — ${comments}`
        : `${actor.name} (${actor.role}): ${action} (${previousValue || ''} → ${newValue || ''})`;

      await addDoc(collection(db, 'orders', orderId, 'timeline'), {
        action,
        description,
        createdBy: actor.name || 'staff',
        userId: actor.id,
        role: actor.role || 'STAFF',
        subOrderId: subOrderId || null,
        comments: comments || null,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[Audit] Could not write to order timeline:', err);
    }
  }

  // 3. Add to sub-order timeline if subOrderId is present
  if (subOrderId) {
    try {
      const description = comments
        ? `${actor.name} (${actor.role}): ${action} — ${comments}`
        : `${actor.name} (${actor.role}): ${action} (${previousValue || ''} → ${newValue || ''})`;

      await addDoc(collection(db, 'subOrders', subOrderId, 'timeline'), {
        action,
        description,
        createdBy: actor.name || 'staff',
        userId: actor.id,
        role: actor.role || 'STAFF',
        comments: comments || null,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      // Sub-orders might not always have timeline subcollection, skip gracefully
    }
  }

  return logEntry;
}
