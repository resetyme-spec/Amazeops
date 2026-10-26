// API service for Staff App - plain JavaScript

const DEFAULT_API_URL = 'http://localhost:3002';
const DEFAULT_API_KEY = 'dummy-app-key-2025';

function getApiBase() {
 return (localStorage.getItem('apiBaseUrl') || DEFAULT_API_URL).replace(/\/$/, '');
}

function getApiKey() {
 return localStorage.getItem('apiKey') || DEFAULT_API_KEY;
}

async function callApi(path, options) {
 const base = getApiBase();
 const url = `${base}${path}`;
 const res = await fetch(url, {
  ...options,
  headers: {
   'Content-Type': 'application/json',
   'x-api-key': getApiKey(),
   ...(options?.headers || {}),
  },
 });
 if (!res.ok) {
  const text = await res.text().catch(() => 'Unknown error');
  throw new Error(`API ${res.status}: ${text}`);
 }
 return res.json();
}

export function isApiConfigured() {
 return !!localStorage.getItem('apiBaseUrl');
}

// ===== AUTH =====
export async function loginStaff(email, password) {
 try {
  const users = await fetchUsers();
  const user = users.find(u => u.email === email && u.role === 'STAFF' && u.isActive);
  if (!user) return null;
  return { user, token: btoa(user.id + ':' + Date.now()) };
 } catch (e) { console.error('loginStaff error:', e); return null; }
}

// ===== ORDERS (Staff sees ALL orders) =====
export async function fetchAllOrders(status) {
 if (!isApiConfigured()) return [];
 try {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await callApi(`/api/orders${qs}`);
  const apiOrders = data.orders || [];
  // Merge in qcStatus from Firestore (partner app writes QC there)
  try {
   const { getDocs, collection } = await import('firebase/firestore');
   const snap = await getDocs(collection(db, 'orders'));
   const qcMap = {};
   snap.docs.forEach(d => {
    const data = d.data();
    if (data.qcStatus) qcMap[d.id] = { qcStatus: data.qcStatus, qcSubmittedAt: data.qcSubmittedAt, qcGarments: data.qcGarments, qcRejection: data.qcRejection, qcApprovedBy: data.qcApprovedBy };
   });
   return apiOrders.map(o => ({ ...o, ...(qcMap[o.id] || qcMap[o.orderId] || {}) }));
  } catch (e) { /* Firestore optional */ }
  return apiOrders;
 } catch (e) { console.error('fetchAllOrders error:', e); return []; }
}

export async function fetchOrderById(orderId) {
 if (!isApiConfigured()) return null;
 try {
  const data = await callApi(`/api/orders/${encodeURIComponent(orderId)}`);
  const order = data.order || null;
  if (order) {
   // Merge in qcStatus from Firestore
   try {
    const { getDoc } = await import('firebase/firestore');
    const { doc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'orders', orderId));
    if (snap.exists()) {
     const fd = snap.data();
     order.qcStatus = fd.qcStatus || order.qcStatus;
     order.qcSubmittedAt = fd.qcSubmittedAt || order.qcSubmittedAt;
     order.qcGarments = fd.qcGarments || order.qcGarments;
     order.qcRejection = fd.qcRejection || order.qcRejection;
     order.qcApprovedBy = fd.qcApprovedBy || order.qcApprovedBy;
    }
   } catch (e) { /* Firestore optional */ }
  }
  return order;
 } catch (e) { console.error('fetchOrderById error:', e); return null; }
}

// ===== QC ACTIONS =====
export async function approveQC(orderId, actor, comment) {
 return callApi(`/api/orders/${encodeURIComponent(orderId)}/qc/approve`, {
  method: 'POST',
  body: JSON.stringify({ approvedBy: actor.name, comments: comment, _actorId: actor.id, _actorName: actor.name, _actorRole: actor.role }),
 });
}

export async function rejectQC(orderId, reason, comments, actor) {
 return callApi(`/api/orders/${encodeURIComponent(orderId)}/qc/reject`, {
  method: 'POST',
  body: JSON.stringify({ reason, comments, rejectedBy: actor.name, _actorId: actor.id, _actorName: actor.name, _actorRole: actor.role }),
 });
}

// ===== UPDATE ORDER STATUS =====
export async function updateOrderStatus(orderId, status, actor) {
 return callApi(`/api/orders/${encodeURIComponent(orderId)}`, {
  method: 'PATCH',
  body: JSON.stringify({ status, _actorId: actor.id, _actorName: actor.name, _actorRole: actor.role, _comment: actor.comment }),
 });
}

// ===== ACTIVITY LOGS =====
export async function fetchActivityLogs(filters) {
 if (!isApiConfigured()) return [];
 try {
  const params = new URLSearchParams();
  if (filters?.orderId) params.set('orderId', filters.orderId);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const data = await callApi(`/api/activity-logs${qs ? '?' + qs : ''}`);
  return data.logs || [];
 } catch (e) { console.error('fetchActivityLogs error:', e); return []; }
}

// ===== DASHBOARD =====
export async function fetchDashboardData() {
 if (!isApiConfigured()) return null;
 try {
  const data = await callApi('/api/dashboard');
  return data;
 } catch (e) { console.error('fetchDashboardData error:', e); return null; }
}

// ===== USERS =====
export async function fetchUsers() {
 if (!isApiConfigured()) return [];
 try {
  const data = await callApi('/api/users');
  return data.users || [];
 } catch (e) { console.error('fetchUsers error:', e); return []; }
}
