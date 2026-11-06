import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package, Clock, ShieldCheck, ShieldAlert, CheckCircle2,
  LogOut, RefreshCw, FileText, QrCode, Menu
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchOrdersByPartner, fetchOrdersForStaff, fetchGarmentLifetimeHistory } from '../lib/api';
import QRScannerModal from '../components/QRScannerModal';
import GarmentHistoryModal from '../components/GarmentHistoryModal';
import SideDrawer from '../components/SideDrawer';
import PullToRefresh from '../components/PullToRefresh';

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
  const { user, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState({ open: false, data: null, loading: false });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  const handleScanSuccess = async (code) => {
    setScannerOpen(false);
    setHistoryModal({ open: true, data: null, loading: true });
    try {
      const hist = await fetchGarmentLifetimeHistory(code);
      setHistoryModal({ open: true, data: hist, loading: false });
    } catch (err) {
      alert(`Could not load garment history: ${err.message}`);
      setHistoryModal({ open: false, data: null, loading: false });
    }
  };

  const loadData = async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      let ordersData = [];
      if (user.isStaff || user.isAdmin) {
        ordersData = await fetchOrdersForStaff(user);
      } else {
        ordersData = await fetchOrdersByPartner(user.id);
      }
      setOrders(ordersData || []);
    } catch (err) {
      console.error('Failed to load dashboard orders:', err);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const handleRefresh = () => loadData(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;
  if (!user) return null;

  const stats = {
    newOrders: orders.filter(o => o.status === 'ASSIGNED' || o.status === 'RECEIVED').length,
    inProgress: orders.filter(o => o.status === 'IN_PROCESS').length,
    qcPending: orders.filter(o => o.qcStatus === 'QC_PENDING' || o.status === 'QC_SENT').length,
    qcRejected: orders.filter(o => o.qcStatus === 'QC_REJECTED' || o.status === 'QC_REJECTED').length,
    qcApproved: orders.filter(o => o.qcStatus === 'QC_APPROVED').length,
    completed: orders.filter(o => o.status === 'COMPLETED' || o.qcStatus === 'QC_APPROVED').length,
  };

  const todayNew = orders.filter(o => {
    if (!o.createdAt) return false;
    const d = new Date(o.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={refreshing}>
      <div className="dashboard-screen">
        <header className="dashboard-header">
          <div>
            <p className="header-greeting">Welcome back,</p>
            <p className="header-name">{user.name}</p>
            <p className="header-role">
              {user.isStaff
                ? `STAFF ${user.canApproveQc ? '· QC' : ''} ${user.canViewInvoices ? '· INVOICES' : ''}`
                : user.role}
            </p>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="hamburger-btn"
            title="Open Menu"
            aria-label="Open menu"
          >
            <Menu size={22} color="#ffffff" />
          </button>
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

      {/* Quick Action: Scan Garment Tag */}
      <div style={{ padding: '0 16px 14px' }}>
        <button
          onClick={() => setScannerOpen(true)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            color: '#fff',
            padding: '14px 20px',
            borderRadius: 14,
            border: 'none',
            fontSize: 15,
            fontWeight: 800,
            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            cursor: 'pointer',
          }}
        >
          <QrCode size={20} /> Scan Garment Tag & History
        </button>
      </div>

      <div className="stat-grid">
        <StatCard label="NEW" value={todayNew} icon={Package} gradient="linear-gradient(135deg,#667eea,#764ba2)" link="/orders" count="NEW" />
        <StatCard label="IN PROGRESS" value={stats.inProgress} icon={Clock} gradient="linear-gradient(135deg,#f59e0b,#d97706)" link="/orders" count="IN PROCESS" />
        <StatCard label="QC PENDING" value={stats.qcPending} icon={ShieldCheck} gradient="linear-gradient(135deg,#3b82f6,#2563eb)" link="/orders" count="QC PENDING" />
        <StatCard label="QC REJECTED" value={stats.qcRejected} icon={ShieldAlert} gradient="linear-gradient(135deg,#ef4444,#dc2626)" link="/orders" count="REJECTED" />
        <StatCard label="QC APPROVED" value={stats.qcApproved} icon={CheckCircle2} gradient="linear-gradient(135deg,#22c55e,#16a34a)" link="/orders" count="QC APPROVED" />
        <StatCard label="COMPLETED" value={stats.completed} icon={CheckCircle2} gradient="linear-gradient(135deg,#10b981,#059669)" link="/orders?status=COMPLETED" count="COMPLETED" />
      </div>

      {/* Only display Invoices link if user has invoice permissions */}
      {user.canViewInvoices !== false && (
        <div style={{ padding: '0 16px 20px' }}>
          <Link
            to="/invoices"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#fff',
              padding: '16px 18px',
              borderRadius: 14,
              border: '1.5px solid #e0e7ff',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.08)',
              textDecoration: 'none',
              color: '#0f172a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
                <FileText size={22} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Invoices & Settlement</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                  {user.isStaff ? 'Check & verify partner billing records' : 'View rate card settlements, GST & payouts'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5', display: 'flex', alignItems: 'center', gap: 4 }}>
              View →
            </div>
          </Link>
        </div>
      )}

      <QRScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      <GarmentHistoryModal
        isOpen={historyModal.open}
        onClose={() => setHistoryModal({ open: false, data: null, loading: false })}
        data={historyModal.data}
      />

      <SideDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenScanner={() => setScannerOpen(true)}
      />
    </div>
  </PullToRefresh>
  );
}
