import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Clock, ShieldCheck, ShieldAlert, Truck, CheckCircle2, LogOut, RefreshCw, Settings } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { fetchOrdersByPartner } from '../lib/api';

function StatCard({ label, value, icon: Icon, gradient, link, count }) {
 return (
  <Link to={link} className="stat-card" style={{ background: gradient }}>
  <div className="stat-card-icon"><Icon size={22} /></div>
  <div className="stat-card-body">
   <span className="stat-card-label">{label}</span>
   <span className="stat-card-value">{value}</span>
  </div>
  <div className="stat-card-count">{count}</div>
  </Link>
 );
}

export default function Dashboard() {
 const [user, setUser] = useState(null);
 const [orders, setOrders] = useState([]);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const navigate = useNavigate();

 useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (fbUser) => {
  if (!fbUser) { navigate('/login'); return; }

  // Get user profile from Firestore
  const userRef = doc(db, 'users', fbUser.uid);
  const userDoc = await getDoc(userRef);
  if (userDoc.exists()) {
  const data = userDoc.data();
  setUser({
   id: fbUser.uid,
   email: fbUser.email,
   name: data.name || fbUser.email?.split('@')[0],
   role: data.role,
   partnerId: data.partnerId,
  });

  // Fetch orders for this partner (pass UID, function resolves partnerId)
  const ordersData = await fetchOrdersByPartner(fbUser.uid);
  setOrders(ordersData);
  } else {
  // Create user profile on first login
  try {
  await setDoc(userRef, {
   email: fbUser.email,
   name: fbUser.displayName || fbUser.email?.split('@')[0],
   role: 'PARTNER',
   isActive: true,
   mustChangePassword: false,
   createdAt: new Date(),
  });
  setUser({
   id: fbUser.uid,
   email: fbUser.email,
   name: fbUser.email?.split('@')[0],
   role: 'PARTNER',
   partnerId: null,
  });
  } catch (err) {
  console.error('Failed to create user profile:', err);
  }
  }
  setLoading(false);
  });
  return unsub;
 }, []);

 const handleRefresh = async () => {
  setRefreshing(true);
  if (user) {
  const ordersData = await fetchOrdersByPartner(user.id);
  setOrders(ordersData);
  }
  setRefreshing(false);
 };

 const handleLogout = () => {
  auth.signOut();
  navigate('/login');
 };

 if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;
 if (!user) return null;

 const stats = {
  newOrders: orders.filter(o => o.status === 'ASSIGNED' || o.status === 'RECEIVED').length,
  inProgress: orders.filter(o => o.status === 'IN_PROCESS').length,
  qcPending: orders.filter(o => o.qcStatus === 'QC_PENDING').length,
  qcRejected: orders.filter(o => o.qcStatus === 'QC_REJECTED').length,
  qcApproved: orders.filter(o => o.qcStatus === 'QC_APPROVED').length,
  deliveryPending: orders.filter(o => o.qcStatus === 'QC_APPROVED' && (!o.deliveryStatus || o.deliveryStatus === 'PENDING')).length,
 };

 const todayNew = orders.filter(o => {
  if (!o.createdAt) return false;
  const d = new Date(o.createdAt);
  const now = new Date();
  return d.toDateString() === now.toDateString();
 }).length;

 return (
  <div className="dashboard-screen">
  <header className="dashboard-header">
   <div>
   <p className="header-greeting">Welcome back,</p>
   <p className="header-name">{user.name}</p>
   <p className="header-role">{user.role}</p>
   </div>
   <div className="header-actions">
   <button onClick={handleRefresh} disabled={refreshing} className="icon-btn" title="Refresh">
    <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
   </button>
   <button onClick={handleLogout} className="icon-btn" title="Logout">
    <LogOut size={18} />
   </button>
   </div>
  </header>

  <div className="summary-card">
   <div className="summary-title">
    <span>Overview</span>
    <span className="summary-date">{new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
   </div>
   <div className="summary-stats">
    <div className="summary-item"><span className="summary-value">{todayNew}</span><span className="summary-label">NEW</span></div>
    <div className="summary-divider"></div>
    <div className="summary-item"><span className="summary-value">{stats.inProgress}</span><span className="summary-label">IN PROGRESS</span></div>
    <div className="summary-divider"></div>
    <div className="summary-item"><span className="summary-value">{stats.qcPending}</span><span className="summary-label">QC PENDING</span></div>
    <div className="summary-divider"></div>
    <div className="summary-item"><span className="summary-value">{stats.qcRejected}</span><span className="summary-label">REJECTED</span></div>
   </div>
  </div>

  <div className="stat-grid">
   <StatCard label="NEW" value={todayNew} icon={Package} gradient="linear-gradient(135deg,#667eea,#764ba2)" link="/orders" count="NEW" />
   <StatCard label="IN PROGRESS" value={stats.inProgress} icon={Clock} gradient="linear-gradient(135deg,#f59e0b,#d97706)" link="/orders" count="IN PROCESS" />
   <StatCard label="QC PENDING" value={stats.qcPending} icon={ShieldCheck} gradient="linear-gradient(135deg,#3b82f6,#2563eb)" link="/orders" count="QC PENDING" />
   <StatCard label="QC REJECTED" value={stats.qcRejected} icon={ShieldAlert} gradient="linear-gradient(135deg,#ef4444,#dc2626)" link="/orders" count="REJECTED" />
   <StatCard label="QC APPROVED" value={stats.qcApproved} icon={CheckCircle2} gradient="linear-gradient(135deg,#22c55e,#16a34a)" link="/orders" count="QC APPROVED" />
   <StatCard label="DELIVERY" value={stats.deliveryPending} icon={Truck} gradient="linear-gradient(135deg,#a855f7,#7c3aed)" link="/orders" count="PENDING" />
  </div>
  </div>
 );
}
