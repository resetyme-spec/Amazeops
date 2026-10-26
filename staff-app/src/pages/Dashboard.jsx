import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, Settings, LogOut, ShieldCheck, Clock, CheckCircle2, XCircle, Package, Truck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchDashboardData } from '../lib/api';

function StatCard({ label, value, icon: Icon, gradient, link }) {
 return (
 <Link to={link} className="stat-card" style={{ background: gradient }}>
 <div className="stat-card-icon"><Icon size={22} /></div>
 <span className="stat-card-label">{label}</span>
 <span className="stat-card-value">{value}</span>
 </Link>
 );
}

export default function Dashboard() {
 const { user, logout } = useAuth();
 const navigate = useNavigate();
 const [stats, setStats] = useState({ totalOrders: 0, activeOrders: 0, completedOrders: 0, deliveredOrders: 0, criticalCases: 0, totalRevenue: 0, pendingInvoices: 0, activePartners: 0 });
 const [qcQueue, setQcQueue] = useState([]);
 const [recent, setRecent] = useState([]);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);

 const load = async (isRefresh = false) => {
  if (isRefresh) setRefreshing(true); else setLoading(true);
  const data = await fetchDashboardData();
  if (data) {
   setStats(data.stats);
   setRecent(data.recentOrders.slice(0, 5));
   const pending = data.recentOrders.filter(o => o.qcStatus === 'QC_PENDING');
   setQcQueue(pending);
  }
  if (isRefresh) setRefreshing(false); else setLoading(false);
 };

 useEffect(() => { load(); }, []);

 if (!user) { navigate('/login'); return null; }

 const handleLogout = () => { logout(); navigate('/login'); };

 if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;

 return (
 <div className="dashboard-screen">
  <header className="dashboard-header">
   <div>
    <p className="header-greeting">Staff Dashboard</p>
    <h1 className="header-name">{user.name}</h1>
    <span className="header-role">{user.email}</span>
   </div>
   <div className="header-actions">
    <button className="icon-btn" onClick={() => load(true)} disabled={refreshing}><RefreshCw size={18} className={refreshing ? 'spinning' : ''} /></button>
    <button className="icon-btn" onClick={() => navigate('/settings')}><Settings size={18} /></button>
    <button className="icon-btn icon-btn-danger" onClick={handleLogout}><LogOut size={18} /></button>
   </div>
  </header>

  {/* QC Alert */}
  {qcQueue.length > 0 && (
  <Link to="/qc" className="qc-alert-card">
   <div className="qc-alert-icon"><ShieldCheck size={24} /></div>
   <div className="qc-alert-body">
    <span className="qc-alert-label">QC Review Queue</span>
    <span className="qc-alert-value">{qcQueue.length} order{qcQueue.length !== 1 ? 's' : ''} awaiting review</span>
   </div>
   <div className="qc-alert-arrow">›</div>
  </Link>
  )}

  {/* Stats Grid */}
  <div className="stat-grid">
   <StatCard label="Total Orders" value={stats.totalOrders} icon={Package} gradient="linear-gradient(135deg,#6366f1,#8b5cf6)" link="/orders" />
   <StatCard label="Active Orders" value={stats.activeOrders} icon={Clock} gradient="linear-gradient(135deg,#f59e0b,#fbbf24)" link="/orders" />
   <StatCard label="QC Pending" value={qcQueue.length} icon={ShieldCheck} gradient="linear-gradient(135deg,#06b6d4,#22d3ee)" link="/qc" />
   <StatCard label="Delivered" value={stats.deliveredOrders} icon={Truck} gradient="linear-gradient(135deg,#10b981,#34d399)" link="/orders?status=DELIVERED" />
  </div>

  {/* Recent Orders */}
  <div className="recent-section">
   <div className="recent-header">
    <span className="recent-title">Recent Orders</span>
    <Link to="/orders" className="recent-link">View All ›</Link>
   </div>
   <div className="recent-list">
    {recent.length === 0 ? (
     <div className="empty-state-mini"><Package size={32} /><p>No orders yet</p></div>
    ) : recent.map(order => (
     <Link key={order.id} to={`/orders/${order.id}`} className="recent-card">
      <div className="recent-card-left">
       <span className="recent-order-id">{order.orderId || order.id}</span>
       <span className="recent-customer">{order.customer?.name || '—'}</span>
      </div>
      <span className={`recent-status ${order.qcStatus === 'QC_PENDING' ? 'recent-pending' : order.qcStatus === 'QC_APPROVED' ? 'recent-approved' : order.qcStatus === 'QC_REJECTED' ? 'recent-rejected' : 'recent-active'}`}>
       {order.qcStatus === 'QC_PENDING' ? 'QC Pending' : order.qcStatus === 'QC_APPROVED' ? 'Approved' : order.qcStatus === 'QC_REJECTED' ? 'Rejected' : order.status}
      </span>
     </Link>
    ))}
   </div>
  </div>
 </div>
 );
}
