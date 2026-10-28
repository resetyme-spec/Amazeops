import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package, Clock, Search, RefreshCw, Eye, X, Shirt, CheckCircle2, Truck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchOrdersByPartner, acceptOrder, initiateDelivery } from '../lib/api';

const TIER_COLORS = {
  SIGNATURE: '#d97706',
  GOLD: '#d97706',
  PRISTINE: '#ea580c',
  ORANGE: '#ea580c',
  YELLOW: '#ea580c',
  PREMIUM: '#2563eb',
  BLUE: '#2563eb',
};
const TIER_BG = {
  SIGNATURE: '#fef3c7',
  GOLD: '#fef3c7',
  PRISTINE: '#ffedd5',
  ORANGE: '#ffedd5',
  YELLOW: '#ffedd5',
  PREMIUM: '#eff6ff',
  BLUE: '#eff6ff',
};
const STATUS_FILTERS = [
 { label: 'All', value: '' },
 { label: 'Assigned', value: 'ASSIGNED' },
 { label: 'In Progress', value: 'IN_PROCESS' },
 { label: 'QC Sent', value: 'QC_SENT' },
 { label: 'QC Pending', value: 'QC_PENDING' },
 { label: 'QC Rejected', value: 'QC_REJECTED' },
 { label: 'QC Approved', value: 'QC_APPROVED' },
 { label: 'Ready to Deliver', value: 'READY_FOR_DELIVERY' },
 { label: 'Rejected', value: 'REJECTED' },
 { label: 'Completed', value: 'DELIVERED' },
];

function careBadge(cat) {
 const raw = String(cat || 'PREMIUM').toUpperCase();
 const c = raw.includes('SIGNATURE') || raw === 'GOLD' ? 'SIGNATURE' : raw.includes('PRISTINE') || raw === 'ORANGE' || raw === 'YELLOW' ? 'PRISTINE' : 'PREMIUM';
 const label = c === 'SIGNATURE' ? 'Signature' : c === 'PRISTINE' ? 'Pristine' : 'Premium';
 const icon = c === 'SIGNATURE' ? '👑' : c === 'PRISTINE' ? '✨' : '💎';
 const color = TIER_COLORS[c];
 const bg = TIER_BG[c];
 const border = c === 'SIGNATURE' ? '#fde68a' : c === 'PRISTINE' ? '#fed7aa' : '#bfdbfe';
 return (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, color, border: `1px solid ${border}`, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
   {icon} {label}
  </span>
 );
}

function customerLabel(name, category, defaultColor = '#0f172a') {
 const c = (category || '').toLowerCase();
 const isPrime = c.includes('prime');
 const isSignature = c.includes('signature');
 return (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
   <span style={{ color: defaultColor, fontWeight: 800, fontSize: 14 }}>{name}</span>
   {isPrime && (
    <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '1px 7px', borderRadius: 5, fontWeight: 800 }}>
     👑 PRIME
    </span>
   )}
   {isSignature && (
    <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '1px 7px', borderRadius: 5, fontWeight: 800 }}>
     ✨ SIGNATURE
    </span>
   )}
  </span>
 );
}

function StatCard({ label, value, color, bg, border, active, onClick }) {
 return (
  <button
   type="button"
   onClick={onClick}
   style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '9px 16px',
    borderRadius: 12,
    background: active ? color : bg,
    border: `2px solid ${active ? color : (border || 'transparent')}`,
    minWidth: 92,
    flexShrink: 0,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: active ? `0 4px 14px ${color}45` : '0 1px 3px rgba(0,0,0,0.03)',
    transform: active ? 'scale(1.03)' : 'scale(1)',
   }}
  >
   <span style={{ fontSize: 20, fontWeight: 800, color: active ? '#ffffff' : color, lineHeight: 1.1 }}>{value}</span>
   <span style={{ fontSize: 10, color: active ? '#ffffff' : color, fontWeight: 800, textTransform: 'uppercase', marginTop: 4, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{label}</span>
  </button>
 );
}

export default function Orders() {
 const { user } = useAuth();
 const [searchParams, setSearchParams] = useSearchParams();
 const [orders, setOrders] = useState([]);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState('');
 const [refreshing, setRefreshing] = useState(false);
 const [viewModal, setViewModal] = useState({ open: false, order: null });
 const [acceptingId, setAcceptingId] = useState(null);
 const [deliveringId, setDeliveringId] = useState(null);

 const statusFilter = searchParams.get('status') || '';

 const load = async (isRefresh = false) => {
 if (!user) return;
 if (isRefresh) setRefreshing(true); else setLoading(true);
 const data = await fetchOrdersByPartner(user.id);
 setOrders(data);
 if (isRefresh) setRefreshing(false); else setLoading(false);
 };

 useEffect(() => { load(); }, [user?.id, statusFilter]);

 const filtered = orders.filter(o => {
  if (statusFilter) {
   if (statusFilter === 'READY_FOR_DELIVERY') {
    if (o.status !== 'READY_FOR_DELIVERY' && o.deliveryStatus !== 'READY_FOR_DELIVERY') return false;
   } else if (statusFilter === 'QC_APPROVED') {
    if (o.status === 'READY_FOR_DELIVERY') return false;
    if (o.status !== 'QC_APPROVED' && o.qcStatus !== 'QC_APPROVED') return false;
   } else if (statusFilter === 'QC_REJECTED') {
    if (o.status !== 'QC_REJECTED' && o.qcStatus !== 'QC_REJECTED') return false;
   } else if (statusFilter === 'QC_SENT') {
    if (o.status !== 'QC_SENT' && o.qcStatus !== 'QC_PENDING') return false;
   } else if (statusFilter === 'QC_PENDING') {
    if (o.status !== 'QC_PENDING' && o.qcStatus !== 'QC_PENDING') return false;
   } else if (o.status !== statusFilter) {
    return false;
   }
  }
  if (search) {
   const q = search.toLowerCase();
   return (o.orderId || '').toLowerCase().includes(q) || (o.customer?.name || '').toLowerCase().includes(q) || (o.customer?.category || '').toLowerCase().includes(q);
  }
  return true;
 });

 const stats = {
  TOTAL: orders.length,
  ASSIGNED: orders.filter(o => o.status === 'ASSIGNED' || o.status === 'RECEIVED').length,
  IN_PROCESS: orders.filter(o => o.status === 'IN_PROCESS').length,
  QC_SENT: orders.filter(o => o.status === 'QC_SENT' || o.qcStatus === 'QC_PENDING').length,
  QC_APPROVED: orders.filter(o => (o.qcStatus === 'QC_APPROVED' || o.status === 'QC_APPROVED') && o.status !== 'READY_FOR_DELIVERY' && o.deliveryStatus !== 'READY_FOR_DELIVERY').length,
  READY_FOR_DELIVERY: orders.filter(o => o.status === 'READY_FOR_DELIVERY' || o.deliveryStatus === 'READY_FOR_DELIVERY').length,
  QC_REJECTED: orders.filter(o => o.status === 'QC_REJECTED' || o.qcStatus === 'QC_REJECTED').length,
  COMPLETED: orders.filter(o => o.status === 'COMPLETED' || o.status === 'DELIVERED').length,
 };

 const handleQuickAccept = async (orderId) => {
  if (!user) return;
  setAcceptingId(orderId);
  try {
   await acceptOrder(orderId, user);
   await load();
  } catch (e) { console.error(e); }
  setAcceptingId(null);
 };

 const handleQuickInitiateDelivery = async (orderId) => {
  if (!user) return;
  setDeliveringId(orderId);
  try {
   await initiateDelivery(orderId, user);
   await load();
  } catch (e) {
   console.error('Initiate delivery failed:', e);
   alert('Failed to initiate delivery: ' + (e.message || String(e)));
  } finally {
   setDeliveringId(null);
  }
 };

 const getOrderTheme = (order) => {
  const isReady = order.status === 'READY_FOR_DELIVERY' || order.deliveryStatus === 'READY_FOR_DELIVERY';
  const isQcRej = order.qcStatus === 'QC_REJECTED' || order.status === 'QC_REJECTED';
  const isQcApp = (order.qcStatus === 'QC_APPROVED' || order.status === 'QC_APPROVED') && !isReady && order.status !== 'DELIVERED' && order.status !== 'COMPLETED';
  const isQcSent = order.status === 'QC_SENT' || order.qcStatus === 'QC_PENDING';
  const isInProc = order.status === 'IN_PROCESS';
  const isAssigned = order.status === 'ASSIGNED' || order.status === 'RECEIVED';
  const isDelivered = order.status === 'DELIVERED' || order.status === 'COMPLETED';

  if (isReady) {
   return {
    key: 'READY_FOR_DELIVERY',
    label: 'READY TO DELIVER',
    headerBg: '#047857',
    bodyBg: '#ecfdf5',
    borderColor: '#6ee7b7',
    customerColor: '#064e3b',
    accentColor: '#059669',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeColor: '#ffffff',
    badgeBorder: 'rgba(255, 255, 255, 0.45)',
    Icon: Truck,
   };
  }

  if (isQcRej) {
   return {
    key: 'QC_REJECTED',
    label: 'QC REJECTED',
    headerBg: '#b91c1c',
    bodyBg: '#fef2f2',
    borderColor: '#fca5a5',
    customerColor: '#7f1d1d',
    accentColor: '#dc2626',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeColor: '#ffffff',
    badgeBorder: 'rgba(255, 255, 255, 0.45)',
    Icon: AlertTriangle,
   };
  }

  if (isQcApp) {
   return {
    key: 'QC_APPROVED',
    label: 'QC APPROVED',
    headerBg: '#15803d',
    bodyBg: '#f0fdf4',
    borderColor: '#86efac',
    customerColor: '#14532d',
    accentColor: '#16a34a',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeColor: '#ffffff',
    badgeBorder: 'rgba(255, 255, 255, 0.45)',
    Icon: CheckCircle2,
   };
  }

  if (isQcSent) {
   return {
    key: 'QC_SENT',
    label: 'QC SENT',
    headerBg: '#1d4ed8',
    bodyBg: '#eff6ff',
    borderColor: '#93c5fd',
    customerColor: '#1e3a8a',
    accentColor: '#2563eb',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeColor: '#ffffff',
    badgeBorder: 'rgba(255, 255, 255, 0.45)',
    Icon: Clock,
   };
  }

  if (isInProc) {
   return {
    key: 'IN_PROCESS',
    label: 'IN PROGRESS',
    headerBg: '#b45309',
    bodyBg: '#fffbeb',
    borderColor: '#fcd34d',
    customerColor: '#78350f',
    accentColor: '#d97706',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeColor: '#ffffff',
    badgeBorder: 'rgba(255, 255, 255, 0.45)',
    Icon: RefreshCw,
   };
  }

  if (isAssigned) {
   return {
    key: 'ASSIGNED',
    label: 'ASSIGNED',
    headerBg: '#6d28d9',
    bodyBg: '#f5f3ff',
    borderColor: '#c4b5fd',
    customerColor: '#4c1d95',
    accentColor: '#7c3aed',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeColor: '#ffffff',
    badgeBorder: 'rgba(255, 255, 255, 0.45)',
    Icon: Package,
   };
  }

  if (isDelivered) {
   return {
    key: 'DELIVERED',
    label: 'DELIVERED',
    headerBg: '#0f766e',
    bodyBg: '#f0fdfa',
    borderColor: '#5eead4',
    customerColor: '#134e4a',
    accentColor: '#0d9488',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    badgeColor: '#ffffff',
    badgeBorder: 'rgba(255, 255, 255, 0.45)',
    Icon: CheckCircle2,
   };
  }

  return {
   key: 'OTHER',
   label: order.status || 'RECEIVED',
   headerBg: '#334155',
   bodyBg: '#f8fafc',
   borderColor: '#cbd5e1',
   customerColor: '#0f172a',
   accentColor: '#64748b',
   badgeBg: 'rgba(255, 255, 255, 0.22)',
   badgeColor: '#ffffff',
   badgeBorder: 'rgba(255, 255, 255, 0.45)',
   Icon: Package,
  };
 };

 if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;

 return (
 <div className="orders-screen">
 <header className="screen-header">
 <h1>Orders</h1>
 <button className="icon-btn" onClick={() => load(true)} disabled={refreshing}><RefreshCw size={18} className={refreshing ? 'spinning' : ''} /></button>
 </header>

 <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', overflowX: 'auto' }}>
  <StatCard
   label="All"
   value={stats.TOTAL}
   color="#334155"
   bg="#f1f5f9"
   border="#cbd5e1"
   active={statusFilter === ''}
   onClick={() => setSearchParams('')}
  />
  <StatCard
   label="Assigned"
   value={stats.ASSIGNED}
   color="#6d28d9"
   bg="#f5f3ff"
   border="#c4b5fd"
   active={statusFilter === 'ASSIGNED'}
   onClick={() => setSearchParams(statusFilter === 'ASSIGNED' ? '' : '?status=ASSIGNED')}
  />
  <StatCard
   label="In Progress"
   value={stats.IN_PROCESS}
   color="#b45309"
   bg="#fffbeb"
   border="#fcd34d"
   active={statusFilter === 'IN_PROCESS'}
   onClick={() => setSearchParams(statusFilter === 'IN_PROCESS' ? '' : '?status=IN_PROCESS')}
  />
  <StatCard
   label="QC Sent"
   value={stats.QC_SENT}
   color="#1d4ed8"
   bg="#eff6ff"
   border="#93c5fd"
   active={statusFilter === 'QC_SENT' || statusFilter === 'QC_PENDING'}
   onClick={() => setSearchParams(statusFilter === 'QC_SENT' ? '' : '?status=QC_SENT')}
  />
  <StatCard
   label="QC Approved"
   value={stats.QC_APPROVED}
   color="#15803d"
   bg="#f0fdf4"
   border="#86efac"
   active={statusFilter === 'QC_APPROVED'}
   onClick={() => setSearchParams(statusFilter === 'QC_APPROVED' ? '' : '?status=QC_APPROVED')}
  />
  <StatCard
   label="Ready to Deliver"
   value={stats.READY_FOR_DELIVERY}
   color="#047857"
   bg="#ecfdf5"
   border="#6ee7b7"
   active={statusFilter === 'READY_FOR_DELIVERY'}
   onClick={() => setSearchParams(statusFilter === 'READY_FOR_DELIVERY' ? '' : '?status=READY_FOR_DELIVERY')}
  />
  <StatCard
   label="QC Rejected"
   value={stats.QC_REJECTED}
   color="#b91c1c"
   bg="#fef2f2"
   border="#fca5a5"
   active={statusFilter === 'QC_REJECTED'}
   onClick={() => setSearchParams(statusFilter === 'QC_REJECTED' ? '' : '?status=QC_REJECTED')}
  />
  <StatCard
   label="Completed"
   value={stats.COMPLETED}
   color="#0f766e"
   bg="#f0fdfa"
   border="#5eead4"
   active={statusFilter === 'DELIVERED'}
   onClick={() => setSearchParams(statusFilter === 'DELIVERED' ? '' : '?status=DELIVERED')}
  />
 </div>

 <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
  <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
   <Search size={16} />
   <input placeholder="Search orders, customers..." value={search} onChange={e => setSearch(e.target.value)} />
  </div>
  <select value={statusFilter} onChange={e => setSearchParams(e.target.value ? `?status=${e.target.value}` : '')} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 600, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
   {STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
  </select>
 </div>

 <div className="orders-list">
 {filtered.length === 0 ? (
 <div className="empty-state"><Package size={48} /><p>No orders found</p></div>
 ) : filtered.map(order => {
 const theme = getOrderTheme(order);
 const StatusIcon = theme.Icon;
 const garmentCount = order.garments?.length || 0;
 const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
 const isQcApp = (order.qcStatus === 'QC_APPROVED' || order.status === 'QC_APPROVED') && order.status !== 'READY_FOR_DELIVERY' && order.deliveryStatus !== 'READY_FOR_DELIVERY' && order.status !== 'DELIVERED' && order.status !== 'COMPLETED';

 return (
 <div
  key={order.id}
  className="order-card"
  style={{
   background: theme.bodyBg,
   border: `1.5px solid ${theme.borderColor}`,
   boxShadow: '0 3px 10px rgba(0,0,0,0.06)',
   borderRadius: 14,
   overflow: 'hidden',
   display: 'flex',
   flexDirection: 'column',
   transition: 'all 0.15s ease',
  }}
 >
  {/* Bold Dark Header Banner */}
  <div
   className="order-card-header-banner"
   style={{
    background: theme.headerBg,
    padding: '9px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
   }}
  >
   <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 13, letterSpacing: '0.02em', fontFamily: 'monospace' }}>
     {order.orderId || order.id}
    </span>
    <span style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 11, fontWeight: 600 }}>
     {date}
    </span>
   </div>
   <span
    style={{
     background: theme.badgeBg,
     color: theme.badgeColor,
     border: `1px solid ${theme.badgeBorder}`,
     display: 'inline-flex',
     alignItems: 'center',
     gap: 5,
     padding: '3px 10px',
     borderRadius: 20,
     fontSize: 10.5,
     fontWeight: 800,
     letterSpacing: '0.04em',
     textTransform: 'uppercase',
     backdropFilter: 'blur(4px)',
    }}
   >
    <StatusIcon size={12} strokeWidth={2.5} />
    {theme.label}
   </span>
  </div>

  {/* Rich Tinted Card Body with Matching High-Contrast Text */}
  <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
   <Link to={`/orders/${order.id}`} style={{ textDecoration: 'none', display: 'block' }}>
    <div style={{ marginBottom: 4 }}>
     {customerLabel(order.customer?.name || '—', order.customer?.category, theme.customerColor)}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#1e293b', fontWeight: 600 }}>
     <span style={{ background: '#ffffff', border: `1px solid ${theme.borderColor}`, padding: '2px 8px', borderRadius: 6, fontSize: 11, color: '#334155', fontWeight: 600 }}>
      {order.customer?.category || 'Regular Customer'}
     </span>
     <span style={{ color: '#94a3b8' }}>·</span>
     <span style={{ color: '#0f172a', fontWeight: 700 }}>
      {garmentCount} garment{garmentCount !== 1 ? 's' : ''}
     </span>
     <span style={{ color: '#94a3b8' }}>·</span>
     <span>{careBadge(order.careCategory)}</span>
     {order.garments?.some(g => g.isCritical && !g.isReassigned && g.criticalStatus !== 'REASSIGNED' && !g.adminCriticalComment) && (
       <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: '#dc2626', padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3, boxShadow: '0 1px 3px rgba(220,38,38,0.3)' }}>
         <AlertTriangle size={11} /> CRITICAL
       </span>
     )}
     {order.garments?.some(g => g.isReassigned || g.criticalStatus === 'REASSIGNED' || (g.adminCriticalComment && !g.isCritical)) && (
       <span style={{ fontSize: 10, fontWeight: 800, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
         <RefreshCw size={11} /> REASSIGNED
       </span>
     )}
    </div>
   </Link>

   {/* Rejection Alert Box */}
   {(order.qcRejection || order.status === 'QC_REJECTED' || order.qcStatus === 'QC_REJECTED') && (
    <div style={{ padding: '8px 12px', background: '#ffffff', border: '1.5px solid #ef4444', borderRadius: 8, fontSize: 11, color: '#991b1b', boxShadow: '0 1px 3px rgba(239,68,68,0.08)' }}>
     <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 800, marginBottom: 2 }}>
      <AlertTriangle size={13} color="#dc2626" />
      <span>QC Rejected: {order.qcRejection?.reason || 'Rework required'}</span>
     </div>
     {order.qcRejection?.comments && <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>Note: {order.qcRejection.comments}</div>}
    </div>
   )}

   {/* Card Action Buttons */}
   <div className="order-card-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, paddingTop: 8, borderTop: `1px solid ${theme.borderColor}` }}>
    {(order.status === 'ASSIGNED' || order.status === 'RECEIVED') && (
     <button
      className="btn-accept-sm"
      style={{
       background: '#6d28d9',
       border: '1px solid #5b21b6',
       color: '#ffffff',
       display: 'inline-flex',
       alignItems: 'center',
       gap: 5,
       padding: '6px 14px',
       fontSize: 12,
       fontWeight: 700,
       borderRadius: 8,
       cursor: 'pointer',
       boxShadow: '0 1px 3px rgba(109,40,217,0.3)',
      }}
      onClick={(e) => { e.preventDefault(); handleQuickAccept(order.id); }}
      disabled={acceptingId === order.id}
      title="Accept order"
     >
      <CheckCircle2 size={15} /> {acceptingId === order.id ? 'Accepting...' : 'Accept'}
     </button>
    )}
    {isQcApp && (
     <button
      className="btn-accept-sm"
      style={{
       background: '#047857',
       border: '1px solid #065f46',
       color: '#ffffff',
       display: 'inline-flex',
       alignItems: 'center',
       gap: 5,
       padding: '6px 14px',
       fontSize: 12,
       fontWeight: 700,
       borderRadius: 8,
       cursor: 'pointer',
       boxShadow: '0 1px 3px rgba(4,120,87,0.3)',
      }}
      onClick={(e) => { e.preventDefault(); handleQuickInitiateDelivery(order.id); }}
      disabled={deliveringId === order.id}
      title="Initiate delivery"
     >
      <Truck size={14} className={deliveringId === order.id ? 'spinning' : ''} />
      {deliveringId === order.id ? 'Initiating...' : 'Initiate Delivery'}
     </button>
    )}
    <button
     className="btn-view"
     style={{
      background: '#ffffff',
      border: `1.5px solid ${theme.borderColor}`,
      color: theme.customerColor,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 12px',
      fontSize: 12,
      fontWeight: 700,
      borderRadius: 8,
      cursor: 'pointer',
     }}
     onClick={() => setViewModal({ open: true, order })}
     title="View garments"
    >
     <Eye size={15} /> View
    </button>
    <Link
     to={`/orders/${order.id}`}
     className="btn-link"
     style={{
      background: '#ffffff',
      border: `1.5px solid ${theme.borderColor}`,
      color: theme.customerColor,
      padding: '5px 12px',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 700,
      textDecoration: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      marginLeft: 'auto',
     }}
    >
     {order.status === 'IN_PROCESS' ? 'Send to QC →' : 'Details →'}
    </Link>
   </div>
  </div>
 </div>
 );
 })}
 </div>

 {/* Garment Detail Modal */}
 {viewModal.open && viewModal.order && (
 <div className="modal-overlay" onClick={() => setViewModal({ open: false, order: null })}>
 <div className="modal-content" onClick={e => e.stopPropagation()}>
  <div className="modal-header">
  <h2>{viewModal.order.orderId || viewModal.order.id} — Garments</h2>
  <button className="modal-close" onClick={() => setViewModal({ open: false, order: null })}><X size={20} /></button>
  </div>
  <div className="modal-body">
  {(viewModal.order.qcStatus === 'QC_REJECTED' || viewModal.order.status === 'QC_REJECTED' || viewModal.order.qcRejection) && (
   <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
    <div style={{ color: '#dc2626', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
     ⚠️ QC Rejected: {viewModal.order.qcRejection?.reason || 'Rework required'}
    </div>
    {viewModal.order.qcRejection?.comments && (
     <div style={{ fontSize: 12, color: '#374151', marginBottom: 8 }}>
      <strong>Admin Note:</strong> {viewModal.order.qcRejection.comments}
     </div>
    )}
    <Link to={`/orders/${viewModal.order.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', background: '#ea580c', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
     Open Order to Apply Re-QC →
    </Link>
   </div>
  )}
  {viewModal.order.garments && viewModal.order.garments.length > 0 ? (
   <table className="garment-table">
   <thead>
    <tr>
     <th>#</th>
     <th>Item</th>
     <th>Category</th>
     <th>Tier</th>
     <th>Service</th>
     <th>QR Code</th>
    </tr>
   </thead>
   <tbody>
    {viewModal.order.garments.map((g, i) => {
     const tier = (g.garmentCategory || g.category || 'GOLD').toUpperCase();
     const color = TIER_COLORS[tier] || '#6b7280';
     return (
      <tr key={i}>
       <td>{i + 1}</td>
       <td><strong>{g.item || g.category || '—'}</strong></td>
       <td>{g.garmentCategory || g.category || '—'}</td>
       <td style={{ color, fontWeight: 600 }}>{tier}</td>
       <td>{g.serviceType || g.service?.name || '—'}</td>
       <td className="qr-code">{g.qrCode || '—'}</td>
      </tr>
     );
    })}
   </tbody>
   </table>
  ) : (
   <div className="empty-state"><Shirt size={36} /><p>No garments available</p></div>
  )}
  </div>
 </div>
 </div>
 )}
 </div>
 );
}
