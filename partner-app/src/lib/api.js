// API service for Partner App
// Syncs order status back to the main API so admin panel reflects changes

import { db, auth } from './firebase';
import { collection, doc, getDoc, query, where, orderBy, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const SETTINGS_DOC = 'settings/integrations';

// Load API config from Firestore (same as admin app)
let API_BASE = '';
let API_KEY = '';
let API_HEADER = 'x-api-key';

async function loadApiConfig() {
 try {
  const snap = await getDoc(doc(db, SETTINGS_DOC));
  if (snap.exists()) {
   const d = snap.data();
   API_BASE = (d.apiUrl || 'http://localhost:3002').replace(/\/$/, '');
   API_KEY = d.apiKey || 'amaze-fab-super-admin-key-2026';
   API_HEADER = d.apiHeader || 'x-api-key';
  } else {
   API_BASE = 'http://localhost:3002';
   API_KEY = 'amaze-fab-super-admin-key-2026';
   API_HEADER = 'x-api-key';
  }
 } catch (e) {
  API_BASE = 'http://localhost:3002';
  API_KEY = 'amaze-fab-super-admin-key-2026';
  API_HEADER = 'x-api-key';
 }
}

// Call once on module load (Firestore async — config may not be ready immediately)
loadApiConfig();

function apiHeaders() {
 return { 'Content-Type': 'application/json', [API_HEADER]: API_KEY };
}

async function callApi(path, options = {}) {
 if (!API_BASE) await loadApiConfig();
 const res = await fetch(`${API_BASE}${path}`, {
  ...options,
  headers: { ...apiHeaders(), ...(options.headers || {}) },
 });
 if (!res.ok) {
  const text = await res.text().catch(() => '');
  throw new Error(`API ${res.status}: ${text}`);
 }
 return res.json();
}

// Backwards compat alias
const callDummy = callApi;

// Resolve the Firestore partnerId for the logged-in Firebase UID
async function getFirestorePartnerId(uid) {
 try {
  // Method 1: check users doc for partnerId
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
   const pid = snap.data().partnerId;
   if (pid) return pid;
   // Method 2: look up by email in partners collection
   const email = snap.data().email;
   if (email) {
    const pq = query(collection(db, 'partners'), where('email', '==', email));
    const psnap = await getDocs(pq);
    if (!psnap.empty) return psnap.docs[0].id;
   }
  }
 } catch (e) { console.error('getFirestorePartnerId error:', e); }
 return null;
}

// Fetch full order details from real API as fallback
async function fetchFullOrderFromApi(orderId) {
 try {
  const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}`, {
   headers: apiHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.order || data;
 } catch (e) { return null; }
}

// Fetch garment details from API as fallback
async function fetchGarmentsFromApi(orderId) {
 try {
  const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}`, {
   headers: apiHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.order?.garments || data.garments || [];
 } catch (e) { return null; }
}

// Read sub-orders for current partner from Firestore
export async function fetchOrdersByPartner(partnerId) {
 try {
  const firestorePartnerId = await getFirestorePartnerId(partnerId);
  console.log('[dbg] fetchOrdersByPartner uid=', partnerId, 'resolved partnerId=', firestorePartnerId);
  if (!firestorePartnerId) {
   console.warn('No partnerId for user', partnerId);
   return [];
  }

  // Get all sub-orders for this partner
  const q = query(collection(db, 'subOrders'), where('partnerId', '==', firestorePartnerId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  console.log('[dbg] subOrders found:', snap.size);
  const subOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (subOrders.length === 0) return [];

  // Fetch parent orders from Firestore for context
  const orderIds = [...new Set(subOrders.map(s => s.orderId).filter(Boolean))];
  const ordersMap = {};
  for (const oid of orderIds) {
   try {
    const osnap = await getDoc(doc(db, 'orders', oid));
    if (osnap.exists()) ordersMap[osnap.id] = osnap.data();
   } catch (e) { /* skip */ }
  }

  // For orders missing from Firestore, fetch from real API
  const missingIds = orderIds.filter(oid => !ordersMap[oid]);
  if (missingIds.length > 0) {
   const apiResults = await Promise.all(missingIds.map(oid => fetchFullOrderFromApi(oid)));
   apiResults.forEach((order, i) => {
    if (order) ordersMap[missingIds[i]] = order;
   });
  }

  // Fetch QC records for these orders
  const qcMap = {};
  try {
   const qcSnap = await getDocs(query(collection(db, 'qcRecords'), where('orderId', 'in', orderIds.slice(0, 10))));
   qcSnap.docs.forEach(d => { qcMap[d.data().orderId] = d.data(); });
  } catch (e) { /* skip */ }

  // Return sub-orders merged with parent order data
  return subOrders.map(sub => {
   const parent = ordersMap[sub.orderId] || {};
   const parentGarments = parent.garments || [];
   const garments = sub.garmentIds && sub.garmentIds.length > 0
    ? parentGarments.filter(g => sub.garmentIds.includes(g.garmentId || g.qrCode || g.id))
    : parentGarments;

   const qc = qcMap[sub.orderId];
   const qcStatus = qc?.status || sub.qcStatus || (sub.status === 'QC_REJECTED' ? 'QC_REJECTED' : '');

   const reasonText = qc?.rejectionReason || sub.rejectionReason || parent.rejectionReason || '';
   const hasAnyRejection = garments.some(g => (
    g.qcStatus === 'QC_REJECTED' ||
    g.qcRejection ||
    qc?.rejectedGarments?.[g.garmentId] ||
    (reasonText && (reasonText.toLowerCase().includes(g.garmentId.toLowerCase()) || (g.qrCode && reasonText.toLowerCase().includes(g.qrCode.toLowerCase()))))
   ));
   const allPassed = garments.length > 0 && garments.every(g => g.qcStatus === 'QC_PASSED') && !hasAnyRejection;

   const isReadyForDelivery = sub.status === 'READY_FOR_DELIVERY' || sub.deliveryStatus === 'READY_FOR_DELIVERY' || parent.status === 'READY_FOR_DELIVERY' || parent.deliveryStatus === 'READY_FOR_DELIVERY';
   const isQcRej = !isReadyForDelivery && (qcStatus === 'QC_REJECTED' || sub.status === 'QC_REJECTED' || parent.status === 'QC_REJECTED' || hasAnyRejection || !!sub.rejectionReason || !!qc?.rejectionReason);
   const isQcApp = !isReadyForDelivery && !isQcRej && (qcStatus === 'QC_APPROVED' || sub.status === 'QC_APPROVED' || parent.status === 'QC_APPROVED' || parent.qcStatus === 'QC_APPROVED' || allPassed);
   const isQcPen = !isReadyForDelivery && !isQcApp && !isQcRej && (qcStatus === 'QC_PENDING' || sub.status === 'QC_SENT');
   const subStatus = isReadyForDelivery ? 'READY_FOR_DELIVERY' : isQcRej ? 'QC_REJECTED' : isQcApp ? 'QC_APPROVED' : isQcPen ? 'QC_SENT' : sub.status;
   const finalQcStatus = isReadyForDelivery ? 'QC_APPROVED' : isQcRej ? 'QC_REJECTED' : isQcApp ? 'QC_APPROVED' : qcStatus;

   const qcRejection = isQcApp ? null : ((qc?.rejectionReason ? {
    reason: qc.rejectionReason,
    comments: qc.rejectionComments,
    rejectedBy: qc.rejectedBy,
    rejectedAt: qc.rejectedAt,
    photos: qc.rejectionPhotos || [],
   } : null) || (sub.rejectionReason ? {
    reason: sub.rejectionReason,
    comments: sub.rejectionComments,
    rejectedBy: sub.rejectedBy,
    rejectedAt: sub.rejectedAt,
   } : null) || parent.qcRejection);

   console.log('[dbg] order', sub.orderId, 'status:', subStatus, 'qcStatus:', finalQcStatus);
   return {
    id: sub.id,
    orderId: sub.orderId,
    subOrderCode: sub.subOrderCode,
    partnerId: sub.partnerId,
    partnerCode: sub.partnerCode,
    partnerName: sub.partnerName,
    garmentCategory: sub.garmentCategory,
    garmentIds: sub.garmentIds,
    garments,
    garmentCount: garments.length,
    services: parent.services || [],
    status: subStatus,
    qcStatus: finalQcStatus,
    qcRejection,
    rejectedGarments: isQcApp ? {} : (qc?.rejectedGarments || parent.rejectedGarments || {}),
    qcSubmittedAt: qc?.submittedAt || sub.qcSubmittedAt,
    qcSubmittedBy: qc?.submittedBy || sub.qcSubmittedBy,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
    customer: parent.customer || null,
    careCategory: parent.careCategory || '',
   };
  });
 } catch (e) {
  console.error('fetchOrdersByPartner error:', e);
  return [];
 }
}

// Fetch single sub-order by document ID or orderId, merged with parent order data
export async function fetchOrderById(id) {
 try {
  // Try as document ID first (partner app routes use sub-order doc ID)
  const snap = await getDoc(doc(db, 'subOrders', id));
  if (!snap.exists()) {
   // Fall back to orderId field
   const q = query(collection(db, 'subOrders'), where('orderId', '==', id));
   const qsnap = await getDocs(q);
   const subs = qsnap.docs.map(d => ({ id: d.id, ...d.data() }));
   if (!subs.length) return null;
   // Merge parent order data for the first result
   return mergeWithParent(subs[0]);
  }
  return mergeWithParent({ id: snap.id, ...snap.data() });
 } catch (e) { console.error('fetchOrderById error:', e); return null; }
}

async function mergeWithParent(sub) {
  let result = { ...sub };
  let parent = {};
  const parentSnap = await getDoc(doc(db, 'orders', sub.orderId));
  if (parentSnap.exists()) {
   parent = parentSnap.data();
   const parentGarments = parent.garments || [];
   const garments = sub.garmentIds?.length > 0
    ? parentGarments.filter(g => sub.garmentIds.includes(g.garmentId || g.qrCode || g.id))
    : parentGarments;
   result = { ...result, garments, customer: parent.customer || sub.customer, careCategory: parent.careCategory || sub.careCategory, parentStatus: parent.status };
  } else {
   // Fallback: fetch parent order from API
   try {
    const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(sub.orderId)}`, { headers: apiHeaders() });
    if (res.ok) {
     const data = await res.json();
     parent = data.order || data;
     const parentGarments = parent.garments || [];
     const garments = sub.garmentIds?.length > 0
      ? parentGarments.filter(g => sub.garmentIds.includes(g.garmentId || g.qrCode || g.id))
      : parentGarments;
     result = { ...result, garments, customer: parent.customer || sub.customer, careCategory: parent.careCategory || sub.careCategory, parentStatus: parent.status };
    }
   } catch (e) { /* skip */ }
  }

  // Also attach latest qcRecord for this order
  let matchedQc = null;
  try {
   const qcSnap = await getDocs(collection(db, 'qcRecords'));
   const allQcs = qcSnap.docs.map(d => ({ id: d.id, ...d.data() }));
   const matchingQcs = allQcs.filter(q =>
    q.orderId === sub.orderId ||
    q.orderId === sub.id ||
    q.subOrderId === sub.id ||
    q.subOrderId === sub.orderId ||
    q.id === sub.orderId ||
    q.id === sub.id
   );

   // Prioritize QC_REJECTED record if exists, otherwise sort descending by newest
   matchingQcs.sort((a, b) => {
    if (a.status === 'QC_REJECTED' && b.status !== 'QC_REJECTED') return -1;
    if (b.status === 'QC_REJECTED' && a.status !== 'QC_REJECTED') return 1;
    const dateA = new Date(a.rejectedAt || a.updatedAt || a.submittedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.rejectedAt || b.updatedAt || b.submittedAt || b.createdAt || 0).getTime();
    return dateB - dateA;
   });
   matchedQc = matchingQcs[0] || null;
  } catch (e) { /* non-critical */ }

  const combinedRejectedGarments = {
   ...(parent?.rejectedGarments || {}),
   ...(matchedQc?.rejectedGarments || {}),
   ...(sub?.rejectedGarments || {}),
  };

  const reasonText = (
   matchedQc?.rejectionReason ||
   sub.rejectionReason ||
   parent?.rejectionReason ||
   ''
  );
  const commentsText = (
   matchedQc?.rejectionComments ||
   sub.rejectionComments ||
   parent?.rejectionComments ||
   ''
  );
  const rejectedByText = (
   matchedQc?.rejectedBy ||
   sub.rejectedBy ||
   parent?.rejectedBy ||
   'Admin'
  );
  const rejectedAtText = (
   matchedQc?.rejectedAt ||
   sub.rejectedAt ||
   parent?.rejectedAt ||
   sub.updatedAt ||
   new Date().toISOString()
  );
  const rejectionPhotos = (
   matchedQc?.rejectionPhotos ||
   sub.rejectionPhotos ||
   parent?.rejectionPhotos ||
   []
  );

  const isOrderQcRejected = (
   sub.status === 'QC_REJECTED' ||
   result.qcStatus === 'QC_REJECTED' ||
   matchedQc?.status === 'QC_REJECTED' ||
   parent?.status === 'QC_REJECTED' ||
   parent?.qcStatus === 'QC_REJECTED' ||
   !!sub.rejectionReason ||
   !!matchedQc?.rejectionReason ||
   Object.keys(combinedRejectedGarments).length > 0
  );

  if (matchedQc) {
   result.qcRecord = matchedQc;
   if (matchedQc.garmentUpdates) {
    result.garmentUpdates = matchedQc.garmentUpdates;
   }
  }

  if (isOrderQcRejected) {
   result.status = 'QC_REJECTED';
   result.qcStatus = 'QC_REJECTED';
   result.qcRejection = {
    reason: reasonText || 'QC defect identified',
    comments: commentsText,
    rejectedBy: rejectedByText,
    rejectedAt: rejectedAtText,
    photos: rejectionPhotos,
   };
   result.rejectedGarments = combinedRejectedGarments;
  } else if (matchedQc?.status === 'QC_APPROVED' || sub.status === 'QC_APPROVED' || parent?.status === 'QC_APPROVED') {
   result.qcStatus = 'QC_APPROVED';
   result.status = 'QC_APPROVED';
  } else if (matchedQc?.status) {
   result.qcStatus = matchedQc.status;
  }

  // Reconcile garments
  result.garments = (result.garments || []).map(g => {
   const directRej = combinedRejectedGarments[g.garmentId] || g.qcRejection;
   const isExplicitlyRejected = g.qcStatus === 'QC_REJECTED' || !!directRej;
   const isMentionedInReason = !!reasonText && (
    reasonText.toLowerCase().includes(g.garmentId.toLowerCase()) ||
    (g.qrCode && reasonText.toLowerCase().includes(g.qrCode.toLowerCase()))
   );

   if (isExplicitlyRejected || isMentionedInReason) {
    return {
     ...g,
     qcStatus: 'QC_REJECTED',
     qcRejection: directRej || {
      reason: reasonText,
      comments: commentsText,
      rejectedBy: rejectedByText,
      rejectedAt: rejectedAtText,
      photos: rejectionPhotos,
     },
    };
   }

   if (isOrderQcRejected) {
    return {
     ...g,
     qcStatus: 'QC_PASSED',
    };
   }

   if (result.qcStatus === 'QC_APPROVED' || sub.status === 'QC_APPROVED' || g.qcStatus === 'QC_PASSED') {
    return {
     ...g,
     qcStatus: 'QC_PASSED',
    };
   }
   return g;
  });

  // If order is QC_REJECTED but no garment was flagged, flag all garments in this sub-order as rejected
  if (isOrderQcRejected && !result.garments.some(g => g.qcStatus === 'QC_REJECTED')) {
   result.garments = result.garments.map(g => ({
    ...g,
    qcStatus: 'QC_REJECTED',
    qcRejection: {
     reason: reasonText || 'QC defect identified',
     comments: commentsText,
     rejectedBy: rejectedByText,
     rejectedAt: rejectedAtText,
     photos: rejectionPhotos,
    },
   }));
  }

  const isReadyForDelivery = (
   sub.status === 'READY_FOR_DELIVERY' ||
   sub.deliveryStatus === 'READY_FOR_DELIVERY' ||
   result.status === 'READY_FOR_DELIVERY' ||
   result.deliveryStatus === 'READY_FOR_DELIVERY'
  );
  const hasRejections = result.garments.some(g => g.qcStatus === 'QC_REJECTED' || !!g.qcRejection);
  const allGarmentsPassed = result.garments.length > 0 && result.garments.every(g => g.qcStatus === 'QC_PASSED');

  if (isReadyForDelivery) {
   result.status = 'READY_FOR_DELIVERY';
   result.deliveryStatus = 'READY_FOR_DELIVERY';
   result.qcStatus = 'QC_APPROVED';
   result.qcRejection = null;
   result.rejectedGarments = {};
  } else if (isOrderQcRejected || hasRejections) {
   result.status = 'QC_REJECTED';
   result.qcStatus = 'QC_REJECTED';
  } else if (allGarmentsPassed && !hasRejections) {
   result.qcStatus = 'QC_APPROVED';
   if (result.status === 'QC_SENT' || result.status === 'QC_PENDING' || result.status === 'IN_PROCESS') {
    result.status = 'QC_APPROVED';
   }
   result.qcRejection = null;
   result.rejectedGarments = {};
  }

  return result;
}

// Partner actions — write to Firestore so admin panel picks them up

// Accept order → IN_PROCESS
export async function acceptOrder(orderId, actor) {
 try {
  // orderId here is the sub-order document ID — update it directly
  const ref = doc(db, 'subOrders', orderId);
  await updateDoc(ref, { status: 'IN_PROCESS', acceptedAt: new Date().toISOString(), acceptedBy: actor.name });
  // Also update parent order status in dummy API
  try {
   const subSnap = await getDoc(ref);
   const parentId = subSnap.data()?.orderId;
   if (parentId) await callDummy(`/api/orders/${parentId}`, { method: 'PATCH', body: JSON.stringify({ status: 'IN_PROCESS' }) });
  } catch (e) { /* non-critical */ }
  return { success: true };
 } catch (e) { console.error('acceptOrder error:', e); throw e; }
}

// Reject order with reason
export async function rejectOrder(orderId, actor, reason) {
 try {
  // Update sub-order directly by doc ID
  const subRef = doc(db, 'subOrders', orderId);
  await updateDoc(subRef, {
   status: 'REJECTED', rejectedAt: new Date().toISOString(), rejectedBy: actor.name, rejectionReason: reason,
  });
  // Also try to update parent order — find it from the sub-order
  const subSnap = await getDoc(subRef);
  const parentId = subSnap.data()?.orderId;
  if (parentId) {
   try {
    await updateDoc(doc(db, 'orders', parentId), { status: 'REJECTED', rejectedAt: new Date().toISOString(), rejectedBy: actor.name, rejectionReason: reason });
   } catch (e) { /* parent may not exist */ }
  }
  return { success: true };
 } catch (e) { console.error('rejectOrder error:', e); throw e; }
}

// Mark garment as critical
export async function markGarmentCritical(orderId, garmentId, actor, { comments, photos }) {
 try {
  // Resolve parent orderId — input may be sub-order doc ID
  let parentOrderId = orderId;
  try {
   const subSnap = await getDoc(doc(db, 'subOrders', orderId));
   if (subSnap.exists()) parentOrderId = subSnap.data().orderId || orderId;
  } catch (e) { /* may be parent ID */ }

  const parentRef = doc(db, 'orders', parentOrderId);
  const snap = await getDoc(parentRef);
  if (!snap.exists()) throw new Error('Order not found in Firestore');
  const data = snap.data();
  const garments = (data.garments || []).map(g => {
   if (g.garmentId === garmentId) {
    return { ...g, isCritical: true, criticalComments: comments, criticalPhotos: photos, criticalMarkedAt: new Date().toISOString(), criticalMarkedBy: actor.name };
   }
   return g;
  });
  await setDoc(parentRef, { ...data, garments }, { merge: true });
  return { success: true };
 } catch (e) { console.error('markGarmentCritical error:', e); throw e; }
}

export async function acceptSubOrder(subOrderId, partnerId, actor) {
 try {
  return callDummy(`/api/partners/${encodeURIComponent(partnerId)}/sub-orders/${encodeURIComponent(subOrderId)}/accept`, {
   method: 'POST',
   body: JSON.stringify({ _actorId: actor.id, _actorName: actor.name, _actorRole: actor.role }),
  });
 } catch (e) { console.error('acceptSubOrder error:', e); return null; }
}

export async function submitQC(orderId, garmentUpdates, actor, isReQC = false) {
 try {
  // Resolve parent orderId from sub-order
  let parentOrderId = orderId;
  let subDoc = null;
  try {
   const subSnap = await getDoc(doc(db, 'subOrders', orderId));
   if (subSnap.exists()) {
    subDoc = { id: subSnap.id, ...subSnap.data() };
    parentOrderId = subDoc.orderId || orderId;
   }
  } catch (e) { /* use orderId as fallback */ }

  // Check if there is an existing qcRecord for this order
  let existingQcDoc = null;
  try {
   const qcSnap = await getDocs(query(collection(db, 'qcRecords'), where('orderId', 'in', [parentOrderId, orderId].filter(Boolean))));
   if (!qcSnap.empty) {
    existingQcDoc = qcSnap.docs[0];
   }
  } catch (e) { /* skip */ }

  const nowIso = new Date().toISOString();
  const qcData = {
   orderId: parentOrderId,
   subOrderId: subDoc ? subDoc.id : orderId,
   garmentUpdates,
   status: 'QC_PENDING',
   submittedAt: nowIso,
   submittedBy: actor.name,
   actorId: actor.id,
   updatedAt: nowIso,
  };
  if (actor.partnerId || subDoc?.partnerId) qcData.partnerId = actor.partnerId || subDoc?.partnerId;

  if (existingQcDoc) {
   const updatePayload = {
    ...qcData,
    rejectionReason: '',
    rejectionComments: '',
    resubmittedAt: nowIso,
    resubmittedBy: actor.name,
   };
   if (isReQC) {
    updatePayload.rejectedGarments = {};
   }
   await updateDoc(existingQcDoc.ref, updatePayload);
  } else {
   const qcRef = doc(collection(db, 'qcRecords'));
   await setDoc(qcRef, { id: qcRef.id, ...qcData });
  }

  // Update sub-order status to QC_SENT
  try {
   await updateDoc(doc(db, 'subOrders', orderId), {
    status: 'QC_SENT',
    qcStatus: 'QC_PENDING',
    rejectionReason: '',
    rejectionComments: '',
    qcSubmittedAt: nowIso,
    updatedAt: nowIso,
   });
  } catch (e) { /* non-critical */ }

  // Update parent order in Firestore so admin sees the new updates immediately
  try {
   const parentRef = doc(db, 'orders', parentOrderId);
   const parentSnap = await getDoc(parentRef);
   if (parentSnap.exists()) {
    const pData = parentSnap.data();
    const pGarments = (pData.garments || []).map(g => {
     const upd = garmentUpdates.find(u => u.garmentId === g.garmentId);
     if (upd) {
      const clone = {
       ...g,
       brand: upd.brand || g.brand,
       comments: upd.comments || g.comments,
       photos: upd.photos || g.photos,
       garmentQuality: upd.garmentQuality !== undefined ? upd.garmentQuality : (g.garmentQuality || 5),
       solvents: upd.solvents || g.solvents || [],
       status: 'QC_PENDING',
       qcStatus: 'QC_PENDING',
      };
      if (isReQC) {
       delete clone.qcRejection;
      }
      return clone;
     }
     return g;
    });
    await updateDoc(parentRef, {
     garments: pGarments,
     status: 'QC_PENDING',
     rejectionReason: '',
     rejectionComments: '',
     updatedAt: nowIso,
    });
   }
  } catch (e) { console.warn('Could not update parent order on submitQC:', e); }

  return { success: true };
 } catch (e) {
  console.error('submitQC error:', e);
  throw e;
 }
}

export async function submitGarmentReQC(subOrderId, garmentId, reworkData, actor) {
 try {
  const nowIso = new Date().toISOString();
  let parentOrderId = subOrderId;
  let subDoc = null;

  try {
   const subSnap = await getDoc(doc(db, 'subOrders', subOrderId));
   if (subSnap.exists()) {
    subDoc = { id: subSnap.id, ...subSnap.data() };
    parentOrderId = subDoc.orderId || subOrderId;
   }
  } catch (e) { /* fallback */ }

  // 1. Update subOrders document
  try {
   const subRef = doc(db, 'subOrders', subOrderId);
   const currentSub = subDoc || (await getDoc(subRef)).data() || {};
   const existingUpdates = currentSub.garmentUpdates || [];
   const otherUpdates = existingUpdates.filter(u => u.garmentId !== garmentId);
   const newGarmentUpdate = {
    garmentId,
    brand: reworkData.brand || '',
    comments: reworkData.comments || '',
    photos: reworkData.photos || {},
    garmentQuality: reworkData.garmentQuality !== undefined ? reworkData.garmentQuality : 5,
    solvents: reworkData.solvents || [],
    reworkSubmittedAt: nowIso,
    reworkSubmittedBy: actor.name,
    status: 'QC_PENDING',
    qcStatus: 'QC_PENDING',
   };
   const updatedGarmentUpdates = [...otherUpdates, newGarmentUpdate];

   const rejectedGarmentsMap = { ...(currentSub.rejectedGarments || {}) };
   delete rejectedGarmentsMap[garmentId];

   const remainingRejectedKeys = Object.keys(rejectedGarmentsMap);
   const allResolved = remainingRejectedKeys.length === 0;

   const subUpdatePayload = {
    garmentUpdates: updatedGarmentUpdates,
    rejectedGarments: rejectedGarmentsMap,
    updatedAt: nowIso,
   };

   if (allResolved) {
    subUpdatePayload.status = 'QC_SENT';
    subUpdatePayload.qcStatus = 'QC_PENDING';
    subUpdatePayload.rejectionReason = '';
    subUpdatePayload.rejectionComments = '';
   }

   await updateDoc(subRef, subUpdatePayload);
  } catch (e) {
   console.warn('Could not update subOrder on submitGarmentReQC:', e);
  }

  // 2. Update qcRecords document
  try {
   const qcSnap = await getDocs(query(collection(db, 'qcRecords'), where('orderId', 'in', [parentOrderId, subOrderId].filter(Boolean))));
   if (!qcSnap.empty) {
    const existingQcDoc = qcSnap.docs[0];
    const qcData = existingQcDoc.data() || {};
    const existingUpdates = qcData.garmentUpdates || [];
    const otherUpdates = existingUpdates.filter(u => u.garmentId !== garmentId);
    const updatedGarmentUpdates = [...otherUpdates, {
     garmentId,
     brand: reworkData.brand || '',
     comments: reworkData.comments || '',
     photos: reworkData.photos || {},
     reworkSubmittedAt: nowIso,
     reworkSubmittedBy: actor.name,
     status: 'QC_PENDING',
     qcStatus: 'QC_PENDING',
    }];

    const rejectedGarmentsMap = { ...(qcData.rejectedGarments || {}) };
    delete rejectedGarmentsMap[garmentId];
    const allResolved = Object.keys(rejectedGarmentsMap).length === 0;

    const qcUpdatePayload = {
     garmentUpdates: updatedGarmentUpdates,
     rejectedGarments: rejectedGarmentsMap,
     updatedAt: nowIso,
     resubmittedAt: nowIso,
     resubmittedBy: actor.name,
    };
    if (allResolved) {
     qcUpdatePayload.status = 'QC_PENDING';
     qcUpdatePayload.rejectionReason = '';
     qcUpdatePayload.rejectionComments = '';
    }
    await updateDoc(existingQcDoc.ref, qcUpdatePayload);
   }
  } catch (e) {
   console.warn('Could not update qcRecord on submitGarmentReQC:', e);
  }

  // 3. Update orders document
  try {
   const parentRef = doc(db, 'orders', parentOrderId);
   const parentSnap = await getDoc(parentRef);
   if (parentSnap.exists()) {
    const pData = parentSnap.data();
    const pGarments = (pData.garments || []).map(g => {
     if (g.garmentId === garmentId) {
      const clone = {
       ...g,
       brand: reworkData.brand || g.brand,
       comments: reworkData.comments || g.comments,
       photos: reworkData.photos || g.photos,
       garmentQuality: reworkData.garmentQuality !== undefined ? reworkData.garmentQuality : (g.garmentQuality || 5),
       solvents: reworkData.solvents || g.solvents || [],
       status: 'QC_PENDING',
       qcStatus: 'QC_PENDING',
       reworkSubmittedAt: nowIso,
       reworkSubmittedBy: actor.name,
      };
      delete clone.qcRejection;
      return clone;
     }
     return g;
    });

    const anyStillRejected = pGarments.some(g => g.qcStatus === 'QC_REJECTED' || !!g.qcRejection);
    const parentUpdatePayload = {
     garments: pGarments,
     updatedAt: nowIso,
    };
    if (!anyStillRejected) {
     parentUpdatePayload.status = 'QC_PENDING';
     parentUpdatePayload.rejectionReason = '';
     parentUpdatePayload.rejectionComments = '';
    }
    await updateDoc(parentRef, parentUpdatePayload);
   }
  } catch (e) {
   console.warn('Could not update parent order on submitGarmentReQC:', e);
  }

  return { success: true };
 } catch (e) {
  console.error('submitGarmentReQC error:', e);
  throw e;
 }
}

export async function initiateDelivery(orderId, actor) {
 try {
  const nowIso = new Date().toISOString();
  let parentOrderId = orderId;
  let subDocId = orderId;

  // Resolve sub-order doc & parent orderId
  try {
   const subSnap = await getDoc(doc(db, 'subOrders', orderId));
   if (subSnap.exists()) {
    subDocId = subSnap.id;
    parentOrderId = subSnap.data().orderId || orderId;
   } else {
    const q = query(collection(db, 'subOrders'), where('orderId', '==', orderId));
    const qSnap = await getDocs(q);
    if (!qSnap.empty) {
     subDocId = qSnap.docs[0].id;
    }
   }
  } catch (e) { /* ignore */ }

  // 1. Update subOrders document
  try {
   await updateDoc(doc(db, 'subOrders', subDocId), {
    status: 'READY_FOR_DELIVERY',
    deliveryStatus: 'READY_FOR_DELIVERY',
    deliveryInitiatedAt: nowIso,
    deliveryInitiatedBy: actor.name,
    updatedAt: nowIso,
   });
  } catch (e) {
   console.warn('Could not update subOrders in initiateDelivery:', e);
  }

  // 2. Update parent order document
  try {
   await updateDoc(doc(db, 'orders', parentOrderId), {
    status: 'READY_FOR_DELIVERY',
    deliveryStatus: 'READY_FOR_DELIVERY',
    deliveryInitiatedAt: nowIso,
    deliveryInitiatedBy: actor.name,
    updatedAt: nowIso,
   });
  } catch (e) {
   console.warn('Could not update orders in initiateDelivery:', e);
  }

  // 3. Fallback dummy API call
  try {
   await callDummy(`/api/orders/${encodeURIComponent(parentOrderId)}/delivery/initiate`, {
    method: 'POST',
    body: JSON.stringify({ initiatedBy: actor.name, _actorId: actor.id, _actorName: actor.name, _actorRole: actor.role }),
   });
  } catch (e) { /* non-critical fallback */ }

  return { success: true };
 } catch (e) {
  console.error('initiateDelivery error:', e);
  throw e;
 }
}

// Activity logs
export async function fetchActivityLogs(filters = {}) {
 try {
  const params = new URLSearchParams();
  if (filters.orderId) params.set('orderId', filters.orderId);
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const data = await callDummy(`/api/activity-logs${qs ? '?' + qs : ''}`);
  return data.logs || [];
 } catch (e) { console.error('fetchActivityLogs error:', e); return []; }
}

// Dashboard data
export async function fetchDashboardData() {
 try {
  const data = await callDummy('/api/dashboard');
  return data;
 } catch (e) { console.error('fetchDashboardData error:', e); return null; }
}
 
