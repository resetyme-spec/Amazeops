// API service - external REST API (configurable via Settings)
import type { Order, Partner, Service, Invoice, CriticalCase, Notification, DashboardStats, Garment, GarmentInfo, AppUser, AppRole, ActivityLogEntry } from '../types';

// Backwards-compat export for pages still using Firestore direct
export const db = null as any;

const DEFAULT_API_URL = 'http://localhost:3002';
const DEFAULT_API_KEY = 'amaze-fab-super-admin-key-2026';
const DEFAULT_API_HEADER = 'x-api-key';

function getApiBase(): string {
 return (localStorage.getItem('apiBaseUrl') || DEFAULT_API_URL).replace(/\/$/, '');
}

function getApiKey(): string {
 return localStorage.getItem('apiKey') || DEFAULT_API_KEY;
}

function getApiHeader(): string {
 return localStorage.getItem('apiHeader') || DEFAULT_API_HEADER;
}

export async function callApi<T>(path: string, options?: RequestInit): Promise<T> {
 const base = getApiBase();
 const url = `${base}${path}`;
 const headerName = getApiHeader();
 const res = await fetch(url, {
  ...options,
  headers: {
   'Content-Type': 'application/json',
   [headerName]: getApiKey(),
   ...(options?.headers || {}),
  },
 });
 if (!res.ok) {
  const text = await res.text().catch(() => 'Unknown error');
  throw new Error(`API ${res.status}: ${text}`);
 }
 return res.json();
}

export function isApiConfigured(): boolean {
 return true;
}

// ===== ORDERS =====
function normalizeOrder(raw: any): any {
 // Map external API fields to admin app format
 // Support both nested customer object and flat fields
 const customerName = raw.customerName || raw.customer_name || raw.clientName || raw.client_name || raw.buyerName || raw.buyer_name ||
  (typeof raw.customer === 'string' ? raw.customer : (raw.customer?.name || raw.customer?.fullName || raw.client?.name || 'Unknown'));
 const customerPhone = raw.customerPhone || raw.customer_phone || raw.phone || raw.clientPhone || raw.client_phone || raw.mobile || raw.mobileNumber ||
  raw.customer?.phone || raw.client?.phone || '';
 const customerCategory = raw.customerCategory || raw.customer_category || raw.clientCategory || raw.client_category || raw.tier || raw.plan ||
  (typeof raw.customer === 'string' ? 'Regular' : (raw.customer?.category || raw.customer?.tier || raw.client?.category || 'Regular'));
 const customerCity = raw.city || raw.customer_city || raw.customerCity || raw.customer?.city || '';
 const customerPincode = raw.pincode || raw.pin_code || raw.pinCode || raw.postal_code || raw.customer?.pincode || '';

 // Debug: log first order's raw fields to understand the format
 if (!raw._dbgLogged) {
  console.log('[normalizeOrder] raw keys:', Object.keys(raw));
  console.log('[normalizeOrder] customer field:', raw.customer);
  console.log('[normalizeOrder] customerName:', customerName);
  raw._dbgLogged = true;
 }

 return {
  id: String(raw.order_no || raw.orderNumber || raw.order_number || raw.orderId || raw.order_code || raw.id || raw._id || `ORD-${Date.now()}`),
  orderId: String(raw.order_no || raw.orderNumber || raw.order_number || raw.orderId || raw.order_code || raw.id || raw._id || `ORD-${Date.now()}`),
  orderNumber: String(raw.order_no || raw.orderNumber || raw.order_number || raw.orderId || raw.order_code || raw.id || raw._id || `ORD-${Date.now()}`),
  status: String(raw.status || raw.orderStatus || raw.state || 'RECEIVED'),
  city: customerCity,
  pincode: customerPincode,
  customer: {
   name: customerName,
   category: customerCategory,
   phone: customerPhone,
   city: customerCity,
   pincode: customerPincode,
  },
  garments: Array.isArray(raw.garments) ? raw.garments.map((g: any) => {
   const gc = typeof g.garmentCategory === 'object' && g.garmentCategory !== null ? (g.garmentCategory.name || g.garmentCategory.code || 'Normal') : (g.garmentCategory || g.garmentCategory === 0 ? String(g.garmentCategory) : (g.category || g.tier || 'Normal'));
   const cat = typeof g.category === 'object' && g.category !== null ? (g.category.name || g.category.code || 'Normal') : (g.category ? String(g.category) : 'Normal');
   const gType = g.garmentType || g.garment_type || g.name || g.type || 'Garment';
    return {
     garmentId: g.garmentId || g.garment_id_code || g.garment_id || g.id || g._id || `GAR-${Math.random().toString(36).slice(2, 8)}`,
    qrCode: g.qrCode || g.qr_code || g.code || '',
    category: cat,
    garmentCategory: gc,
    garmentType: gType,
     name: gType,
     serviceType: g.serviceType || g.service_type || (g.service?.name) || '—',
    status: g.status || 'PENDING',
   };
  }) : [],
  subOrders: Array.isArray(raw.subOrders) ? raw.subOrders.map((s: any) => ({
   id: s.id || s._id,
   orderId: s.orderId || s.order_id,
   subOrderCode: s.subOrderCode || s.code || s.sub_order_code,
   partnerId: s.partnerId || s.partner_id || s.partner?.id,
   partnerCode: s.partnerCode || s.partner_code || s.partner?.code,
   partnerName: s.partnerName || s.partner_name || s.partner?.name,
   garmentCategory: s.garmentCategory || s.category || '',
   garmentIds: Array.isArray(s.garmentIds) ? s.garmentIds : (s.garment_ids || s.garments || []),
   status: s.status || 'ASSIGNED',
   notes: s.notes || s.remark || '',
  })) : [],
  careCategory: raw.careCategory || raw.care_category || raw.careType || 'Normal',
  createdAt: raw.createdAt || raw.created_at || raw.created || new Date().toISOString(),
  updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || new Date().toISOString(),
 };
}

export async function fetchOrders(status?: string): Promise<any[]> {
 if (!isApiConfigured()) return [];
 try {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await callApi<any>(`/api/orders${qs}`);
  const list = Array.isArray(data.orders) ? data.orders : (Array.isArray(data) ? data : []);
  const normalized = list.map(normalizeOrder);
  // Deduplicate: prefer orderId, fallback to customer+garment types (external API returns inconsistent IDs)
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  return normalized.filter((o: any) => {
   const idKey = String(o.orderId || '');
   if (idKey) {
    if (seenIds.has(idKey)) return false;
    seenIds.add(idKey);
   }
   const contentKey = `${o.customer?.name || ''}|${(o.garments || []).map((g: any) => g.garmentCategory || g.category).sort().join(',')}`;
   if (contentKey.length > 1) {
    if (seenContent.has(contentKey)) return false;
    seenContent.add(contentKey);
   }
   return true;
  });
 } catch (e) {
  console.error('fetchOrders error:', e);
  return [];
 }
}

export async function fetchOrderById(orderId: string): Promise<any | null> {
 if (!isApiConfigured()) return null;
 try {
  const data = await callApi<any>(`/api/orders/${encodeURIComponent(orderId)}`);
  const raw = data.order || data;
  return normalizeOrder(raw);
 } catch (e) {
  console.error('fetchOrderById error:', e);
  return null;
 }
}

// ===== GARMENTS =====
export async function fetchGarments(orderId?: string): Promise<Garment[]> {
 if (!isApiConfigured()) return [];
 try {
  const path = orderId ? `/api/garments?orderId=${encodeURIComponent(orderId)}` : '/api/garments';
  const data = await callApi<{ garments: Garment[] }>(path);
  return data.garments || [];
 } catch (e) {
  console.error('fetchGarments error:', e);
  return [];
 }
}

// ===== PARTNERS =====
export async function fetchPartners(): Promise<Partner[]> {
 if (!isApiConfigured()) return [];
 try {
  const data = await callApi<{ partners: Partner[] }>('/api/partners');
  return data.partners || [];
 } catch (e) {
  console.error('fetchPartners error:', e);
  return [];
 }
}

// ===== SERVICES =====
export async function fetchServices(): Promise<Service[]> {
 if (!isApiConfigured()) return [];
 try {
  const data = await callApi<{ services: Service[] }>('/api/services');
  return data.services || [];
 } catch (e) {
  console.error('fetchServices error:', e);
  return [];
 }
}

// ===== INVOICES =====
export async function fetchInvoices(status?: string): Promise<Invoice[]> {
 if (!isApiConfigured()) return [];
 try {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await callApi<{ invoices: Invoice[] }>(`/api/invoices${qs}`);
  return data.invoices || [];
 } catch (e) {
  console.error('fetchInvoices error:', e);
  return [];
 }
}

// ===== CRITICAL CASES =====
export async function fetchCriticalCases(): Promise<CriticalCase[]> {
 if (!isApiConfigured()) return [];
 try {
  const data = await callApi<{ cases: CriticalCase[] }>('/api/critical-cases');
  return data.cases || [];
 } catch (e) {
  console.error('fetchCriticalCases error:', e);
  return [];
 }
}

// ===== NOTIFICATIONS =====
export async function fetchNotifications(userId: string): Promise<Notification[]> {
 if (!isApiConfigured()) return [];
 try {
  const data = await callApi<{ notifications: Notification[] }>(`/api/notifications?userId=${encodeURIComponent(userId)}`);
  return data.notifications || [];
 } catch (e) {
  console.error('fetchNotifications error:', e);
  return [];
 }
}

// ===== DASHBOARD STATS =====
export async function fetchDashboardStats(): Promise<DashboardStats> {
 if (!isApiConfigured()) {
  return {
   totalOrders: 0, activeOrders: 0, completedOrders: 0, deliveredOrders: 0,
   criticalCases: 0, totalRevenue: 0, pendingInvoices: 0, activePartners: 0,
  };
 }
 try {
  const data = await callApi<DashboardStats>('/api/stats');
  return data;
 } catch (e) {
  console.error('fetchDashboardStats error:', e);
  return {
   totalOrders: 0, activeOrders: 0, completedOrders: 0, deliveredOrders: 0,
   criticalCases: 0, totalRevenue: 0, pendingInvoices: 0, activePartners: 0,
  };
 }
}

// Actions (POST/PATCH/DELETE) — ready for when API is connected
export const api = {
 createOrder: (data: Record<string, unknown>) =>
  callApi<{ success: boolean; orderId: string }>('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
 addGarmentsToOrder: (orderId: string, garments: unknown[]) =>
  callApi<{ success: boolean }>(`/api/orders/${encodeURIComponent(orderId)}/garments`, { method: 'POST', body: JSON.stringify({ garments }) }),
 assignGarmentsToPartner: (orderId: string, partnerId: string, garmentIds: string[]) =>
  callApi<{ success: boolean }>(`/api/orders/${encodeURIComponent(orderId)}/assign`, { method: 'POST', body: JSON.stringify({ partnerId, garmentIds }) }),
 createPartner: (data: unknown) =>
  callApi<{ success: boolean; partnerId: string }>('/api/partners', { method: 'POST', body: JSON.stringify(data) }),
 updatePartner: (data: { partnerId: string }) =>
  callApi<{ success: boolean }>(`/api/partners/${encodeURIComponent(data.partnerId)}`, { method: 'PATCH', body: JSON.stringify(data) }),
 deletePartner: (data: { partnerId: string }) =>
  callApi<{ success: boolean }>(`/api/partners/${encodeURIComponent(data.partnerId)}`, { method: 'DELETE' }),
 createCriticalCase: (data: unknown) =>
  callApi<{ success: boolean }>('/api/critical-cases', { method: 'POST', body: JSON.stringify(data) }),
 submitQCResult: (data: unknown) =>
  callApi<{ success: boolean }>('/api/qc', { method: 'POST', body: JSON.stringify(data) }),
 createInvoice: (data: unknown) =>
  callApi<{ success: boolean }>('/api/invoices', { method: 'POST', body: JSON.stringify(data) }),
 approveInvoice: (invoiceId: string, approve: boolean, notes?: string) =>
  callApi<{ success: boolean }>(`/api/invoices/${encodeURIComponent(invoiceId)}/approve`, { method: 'POST', body: JSON.stringify({ approve, notes }) }),
 recordPayment: (data: unknown) =>
  callApi<{ success: boolean }>('/api/payments', { method: 'POST', body: JSON.stringify(data) }),
};

// ===== MOBILE APP API — USERS =====
export async function fetchUsers(role?: string): Promise<AppUser[]> {
 if (!isApiConfigured()) return [];
 try {
  const qs = role ? `?role=${encodeURIComponent(role)}` : '';
  const data = await callApi<{ users: AppUser[] }>(`/api/users${qs}`);
  return data.users || [];
 } catch (e) {
  console.error('fetchUsers error:', e);
  return [];
 }
}

export async function fetchUserById(userId: string): Promise<AppUser | null> {
 if (!isApiConfigured()) return null;
 try {
  const data = await callApi<{ user: AppUser }>(`/api/users/${encodeURIComponent(userId)}`);
  return data.user || null;
 } catch (e) { console.error('fetchUserById error:', e); return null; }
}

export async function createUser(data: Partial<AppUser>): Promise<AppUser | null> {
 try {
  const res = await callApi<{ user: AppUser }>('/api/users', { method: 'POST', body: JSON.stringify(data) });
  return res.user;
 } catch (e) { console.error('createUser error:', e); return null; }
}

export async function updateUser(userId: string, data: Partial<AppUser>): Promise<AppUser | null> {
 try {
  const res = await callApi<{ user: AppUser }>(`/api/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.user;
 } catch (e) { console.error('updateUser error:', e); return null; }
}

export async function deleteUser(userId: string): Promise<boolean> {
 try {
  await callApi<{ success: boolean }>(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  return true;
 } catch (e) { console.error('deleteUser error:', e); return false; }
}

// ===== MOBILE APP API — ROLES =====
export async function fetchRoles(): Promise<AppRole[]> {
 if (!isApiConfigured()) return [];
 try {
  const data = await callApi<{ roles: AppRole[] }>('/api/roles');
  return data.roles || [];
 } catch (e) { console.error('fetchRoles error:', e); return []; }
}

export async function createRole(data: Partial<AppRole>): Promise<AppRole | null> {
 try {
  const res = await callApi<{ role: AppRole }>('/api/roles', { method: 'POST', body: JSON.stringify(data) });
  return res.role;
 } catch (e) { console.error('createRole error:', e); return null; }
}

export async function updateRole(roleId: string, data: Partial<AppRole>): Promise<AppRole | null> {
 try {
  const res = await callApi<{ role: AppRole }>(`/api/roles/${encodeURIComponent(roleId)}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.role;
 } catch (e) { console.error('updateRole error:', e); return null; }
}

export async function deleteRole(roleId: string): Promise<boolean> {
 try {
  await callApi<{ success: boolean }>(`/api/roles/${encodeURIComponent(roleId)}`, { method: 'DELETE' });
  return true;
 } catch (e) { console.error('deleteRole error:', e); return false; }
}

// ===== MOBILE APP API — ACTIVITY LOGS =====
export async function fetchActivityLogs(filters?: { userId?: string; orderId?: string; action?: string; limit?: number }): Promise<ActivityLogEntry[]> {
 if (!isApiConfigured()) return [];
 try {
  const params = new URLSearchParams();
  if (filters?.userId) params.set('userId', filters.userId);
  if (filters?.orderId) params.set('orderId', filters.orderId);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const data = await callApi<{ logs: ActivityLogEntry[] }>(`/api/activity-logs${qs ? '?' + qs : ''}`);
  return data.logs || [];
 } catch (e) { console.error('fetchActivityLogs error:', e); return []; }
}

// ===== MOBILE APP API — PARTNER ORDERS =====
export async function fetchOrdersByPartner(partnerId: string): Promise<Order[]> {
 if (!isApiConfigured()) return [];
 try {
  const data = await callApi<{ orders: Order[] }>(`/api/orders/partner/${encodeURIComponent(partnerId)}`);
  return data.orders || [];
 } catch (e) { console.error('fetchOrdersByPartner error:', e); return []; }
}

// ===== MOBILE APP API — QC ACTIONS =====
export async function submitQC(orderId: string, garmentUpdates: Array<{ garmentId: string; brand?: string; comments?: string; photos?: { front?: string; back?: string; other?: string } }>, actor?: { id: string; name: string; role: string }) {
 return callApi<{ success: boolean; order: Order }>(`/api/orders/${encodeURIComponent(orderId)}/qc/submit`, {
  method: 'POST',
  body: JSON.stringify({ garmentUpdates, submittedBy: actor?.name, _actorId: actor?.id, _actorName: actor?.name, _actorRole: actor?.role }),
 });
}

export async function approveQC(orderId: string, actor?: { id: string; name: string; role: string }, comment?: string) {
 return callApi<{ success: boolean; order: Order }>(`/api/orders/${encodeURIComponent(orderId)}/qc/approve`, {
  method: 'POST',
  body: JSON.stringify({ approvedBy: actor?.name, comments: comment, _actorId: actor?.id, _actorName: actor?.name, _actorRole: actor?.role }),
 });
}

export async function rejectQC(orderId: string, reason: string, comments: string, actor?: { id: string; name: string; role: string }) {
 return callApi<{ success: boolean; order: Order }>(`/api/orders/${encodeURIComponent(orderId)}/qc/reject`, {
  method: 'POST',
  body: JSON.stringify({ reason, comments, rejectedBy: actor?.name, _actorId: actor?.id, _actorName: actor?.name, _actorRole: actor?.role }),
 });
}

// ===== MOBILE APP API — PARTNER ACTIONS =====
export async function acceptOrder(orderId: string, actor?: { id: string; name: string; role: string }) {
 return callApi<{ success: boolean; order: Order }>(`/api/orders/${encodeURIComponent(orderId)}/accept`, {
  method: 'POST',
  body: JSON.stringify({ acceptedBy: actor?.name, _actorId: actor?.id, _actorName: actor?.name, _actorRole: actor?.role }),
 });
}

export async function initiateDelivery(orderId: string, actor?: { id: string; name: string; role: string }) {
 return callApi<{ success: boolean; order: Order }>(`/api/orders/${encodeURIComponent(orderId)}/delivery/initiate`, {
  method: 'POST',
  body: JSON.stringify({ initiatedBy: actor?.name, _actorId: actor?.id, _actorName: actor?.name, _actorRole: actor?.role }),
 });
}

export async function updateOrder(orderId: string, data: Partial<Order>, actor?: { id: string; name: string; role: string; comment?: string }) {
 return callApi<{ success: boolean; order: Order }>(`/api/orders/${encodeURIComponent(orderId)}`, {
  method: 'PATCH',
  body: JSON.stringify({ ...data, _actorId: actor?.id, _actorName: actor?.name, _actorRole: actor?.role, _comment: actor?.comment }),
 });
}

// ===== DASHBOARD DATA =====
export async function fetchDashboardData(): Promise<{ stats: DashboardStats; recentOrders: Order[] } | null> {
 if (!isApiConfigured()) return null;
 try {
  const data = await callApi<{ stats: DashboardStats; recentOrders: Order[] }>('/api/dashboard');
  return data;
 } catch (e) { console.error('fetchDashboardData error:', e); return null; }
}
