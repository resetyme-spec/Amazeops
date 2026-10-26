import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllOrders } from '../lib/api';

const STATUS_FILTERS = [
 { label: 'All', value: '' },
 { label: 'Assigned', value: 'ASSIGNED' },
 { label: 'In Progress', value: 'IN_PROCESS' },
 { label: 'QC Pending', value: 'QC_PENDING' },
 { label: 'QC Rejected', value: 'QC_REJECTED' },
 { label: 'QC Approved', value: 'QC_APPROVED' },
 { label: 'Delivered', value: 'DELIVERED' },
];

export default function Orders() {
 const { user } = useAuth();
 const [searchParams, setSearchParams] = useSearchParams();
 const [orders, setOrders] = useState([]);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState('');
 const [refreshing, setRefreshing] = useState(false);

 const statusFilter = searchParams.get('status') || '';

 const load = async (isRefresh = false) => {
  if (isRefresh) setRefreshing(true); else setLoading(true);
  const data = await fetchAllOrders();
  setOrders(data);
  if (isRefresh) setRefreshing(false); else setLoading(false);
 };

 useEffect(() => { load(); }, [statusFilter]);

 const filtered = orders.filter(o => {
  if (statusFilter && o.status !== statusFilter && o.qcStatus !== statusFilter) return false;
  if (search) {
   const q = search.toLowerCase();
   return (o.orderId || o.id).toLowerCase().includes(q) || o.customer?.name?.toLowerCase().includes(q);
  }
  return true;
 });

 const getBadge = (o) => {
  if (o.qcStatus === 'QC_REJECTED') return { label: 'QC REJECTED', bg: '#fef2f2', color: '#dc2626' };
  if (o.qcStatus === 'QC_APPROVED') return { label: 'QC APPROVED', bg: '#f0fdf4', color: '#16a34a' };
  if (o.qcStatus === 'QC_PENDING') return { label: 'QC PENDING', bg: '#eff6ff', color: '#2563eb' };
  if (o.status === 'IN_PROCESS') return { label: 'IN PROGRESS', bg: '#fefce8', color: '#ca8a04' };
  if (o.status === 'ASSIGNED') return { label: 'ASSIGNED', bg: '#f5f3ff', color: '#7c3aed' };
  if (o.status === 'DELIVERED') return { label: 'DELIVERED', bg: '#f0fdf4', color: '#16a34a' };
  return { label: o.status, bg: '#f8fafc', color: '#64748b' };
 };

 if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;

 return (
 <div className="orders-screen">
  <header className="screen-header">
   <h1>All Orders</h1>
   <button className="icon-btn" onClick={() => load(true)} disabled={refreshing}><RefreshCw size={18} className={refreshing ? 'spinning' : ''} /></button>
  </header>

  <div className="search-bar">
   <Search size={16} />
   <input placeholder="Search orders, customers..." value={search} onChange={e => setSearch(e.target.value)} />
  </div>

  <div className="filter-row">
   {STATUS_FILTERS.map(f => (
    <button key={f.value} className={`filter-chip ${statusFilter === f.value ? 'filter-chip--active' : ''}`} onClick={() => setSearchParams(f.value ? `?status=${f.value}` : '')}>
     {f.label}
    </button>
   ))}
  </div>

  <div className="orders-list">
   {filtered.length === 0 ? (
    <div className="empty-state"><Package size={48} /><p>No orders found</p></div>
   ) : filtered.map(order => {
    const badge = getBadge(order);
    const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
    return (
    <Link key={order.id} to={`/orders/${order.id}`} className="order-card">
     <div className="order-card-top">
      <div>
       <span className="order-id">{order.orderId || order.id}</span>
       <span className="order-date">{date}</span>
      </div>
      <span className="status-badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
     </div>
     <div className="order-card-body">
      <p className="order-customer">{order.customer?.name || '—'}</p>
      <p className="order-meta">{order.customer?.category || '—'} · {order.garments?.length || 0} garments · {order.careCategory || '—'}</p>
     </div>
     {order.qcRejection && <p className="rejection-reason">Rejected: {order.qcRejection.reason}</p>}
    </Link>
    );
   })}
  </div>
 </div>
 );
}
