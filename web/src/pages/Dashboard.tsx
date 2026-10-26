import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, Package, AlertTriangle, FileText, TrendingUp,
  Users, Loader2, CheckCircle2, Truck, Clock, Send, ShieldCheck
} from 'lucide-react';
import { fetchDashboardData, fetchOrders, isApiConfigured } from '../lib/api';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

type Period = 'today' | '7days' | '30days' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  '7days': 'Last 7 Days',
  '30days': 'Last 30 Days',
  all: 'Lifetime',
};

const ORDER_STATUSES = [
  { key: 'RECEIVED', label: 'Received / Assigned', color: '#6366f1', bg: '#eef2ff', icon: Loader2 },
  { key: 'IN_PROCESS', label: 'In Process', color: '#f59e0b', bg: '#fef3c7', icon: Clock },
  { key: 'QC_PENDING', label: 'QC Pending', color: '#f97316', bg: '#ffedd5', icon: Send },
  { key: 'QC_APPROVED', label: 'QC Approved', color: '#10b981', bg: '#d1fae5', icon: ShieldCheck },
  { key: 'READY_FOR_DELIVERY', label: 'Ready to Deliver', color: '#8b5cf6', bg: '#ede9fe', icon: Truck },
  { key: 'COMPLETED', label: 'Completed / Delivered', color: '#059669', bg: '#ecfdf5', icon: CheckCircle2 },
  { key: 'QC_REJECTED', label: 'QC Rejected', color: '#ef4444', bg: '#fee2e2', icon: AlertTriangle },
];

const MAIN_STATS_CONFIG = [
  { title: 'Total Orders', key: 'totalOrders', icon: ShoppingCart, gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', shadow: 'rgba(99,102,241,0.3)' },
  { title: 'Active Orders', key: 'activeOrders', icon: Package, gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', shadow: 'rgba(245,158,11,0.3)' },
  { title: 'Critical Cases', key: 'criticalCases', icon: AlertTriangle, gradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)', shadow: 'rgba(239,68,68,0.3)' },
];

const QC_STATS_CONFIG = [
  { title: 'QC Sent', key: 'qcSent', icon: Send, gradient: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', shadow: 'rgba(59,130,246,0.3)' },
  { title: 'QC Approved', key: 'qcApproved', icon: ShieldCheck, gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', shadow: 'rgba(16,185,129,0.3)' },
  { title: 'Ready for Delivery', key: 'readyForDelivery', icon: Truck, gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)', shadow: 'rgba(139,92,246,0.3)' },
];

const SECONDARY_STATS_CONFIG = [
  { title: 'Pending Invoices', key: 'pendingInvoices', icon: FileText, gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)', shadow: 'rgba(139,92,246,0.3)' },
  { title: 'Total Revenue', key: 'totalRevenue', icon: TrendingUp, gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', shadow: 'rgba(16,185,129,0.3)', format: (v: any) => '₹' + (v ?? 0).toLocaleString('en-IN') },
  { title: 'Active Partners', key: 'activePartners', icon: Users, gradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)', shadow: 'rgba(6,182,212,0.3)' },
];

function getPeriodRange(period: Period): { start: number; end: number } {
  const now = Date.now();
  switch (period) {
    case 'today': return { start: new Date().setHours(0, 0, 0, 0), end: now };
    case '7days': return { start: now - 7 * 24 * 60 * 60 * 1000, end: now };
    case '30days': return { start: now - 30 * 24 * 60 * 60 * 1000, end: now };
    case 'all': return { start: 0, end: now };
  }
}

function deriveStatus(order: any, subs: any[]): string {
  const oStatus = (order.status || '').toUpperCase();
  const oDeliv = ((order.deliveryStatus || order.delivery_status || '') as string).toUpperCase();
  if (oStatus === 'READY_FOR_DELIVERY' || oDeliv === 'READY_FOR_DELIVERY') return 'READY_FOR_DELIVERY';
  if (subs.some(s => (s.status || '').toUpperCase() === 'READY_FOR_DELIVERY' || ((s.deliveryStatus || '') as string).toUpperCase() === 'READY_FOR_DELIVERY')) {
    return 'READY_FOR_DELIVERY';
  }

  // If any sub is QC rejected
  if (oStatus === 'QC_REJECTED' || subs.some(s => (s.status || '').toUpperCase() === 'QC_REJECTED')) {
    return 'QC_REJECTED';
  }
  // If any sub is QC pending / QC sent
  if (oStatus === 'QC_PENDING' || subs.some(s => {
    const st = (s.status || '').toUpperCase();
    return st === 'QC_PENDING' || st === 'QC_SENT';
  })) {
    return 'QC_PENDING';
  }
  // If all subs QC approved or order is QC_APPROVED
  if (oStatus === 'QC_APPROVED' || (subs.length > 0 && subs.every(s => (s.status || '').toUpperCase() === 'QC_APPROVED'))) {
    return 'QC_APPROVED';
  }
  // If all subs completed
  if (oStatus === 'COMPLETED' || oStatus === 'DELIVERED' || (subs.length > 0 && subs.every(s => (s.status || '').toUpperCase() === 'COMPLETED' || (s.status || '').toUpperCase() === 'DELIVERED'))) {
    return 'COMPLETED';
  }
  // If any sub is in process
  if (oStatus === 'IN_PROCESS' || subs.some(s => {
    const st = (s.status || '').toUpperCase();
    return st === 'IN_PROCESS' || st === 'COMPLETED' || st === 'DELIVERED' || st === 'READY_FOR_DELIVERY' || st === 'QC_APPROVED';
  })) {
    return 'IN_PROCESS';
  }
  // If subs assigned
  if (subs.some(s => (s.status || '').toUpperCase() === 'ASSIGNED')) {
    return 'ASSIGNED';
  }
  return order.status || 'RECEIVED';
}

function getStatusBadge(status: string) {
  const s = (status || '').toUpperCase();
  if (s === 'READY_FOR_DELIVERY') return { label: 'READY TO DELIVER', color: '#059669', bg: '#ecfdf5' };
  if (s === 'QC_APPROVED') return { label: 'QC APPROVED', color: '#16a34a', bg: '#f0fdf4' };
  if (s === 'QC_PENDING' || s === 'QC_SENT') return { label: 'QC PENDING', color: '#2563eb', bg: '#eff6ff' };
  if (s === 'QC_REJECTED') return { label: 'QC REJECTED', color: '#dc2626', bg: '#fef2f2' };
  if (s === 'IN_PROCESS' || s === 'IN_PROGRESS') return { label: 'IN PROGRESS', color: '#ca8a04', bg: '#fefce8' };
  if (s === 'ASSIGNED') return { label: 'ASSIGNED', color: '#7c3aed', bg: '#f5f3ff' };
  if (s === 'COMPLETED') return { label: 'COMPLETED', color: '#059669', bg: '#ecfdf5' };
  if (s === 'DELIVERED') return { label: 'DELIVERED', color: '#0284c7', bg: '#e0f2fe' };
  return { label: s || 'RECEIVED', color: '#6366f1', bg: '#eef2ff' };
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('30days');
  const [stats, setStats] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const configured = isApiConfigured();

  async function load() {
    setLoading(true);
    setError('');

    try {
      // 1. Fetch API orders
      let apiOrders: any[] = [];
      try {
        const d = await fetchDashboardData();
        if (d?.recentOrders) apiOrders = d.recentOrders;
      } catch {}
      if (!apiOrders.length) {
        try { apiOrders = await fetchOrders(); } catch {}
      }

      // 2. Fetch Firestore collections individually so failure in one never blocks the others
      let fsOrders: any[] = [];
      try {
        const snap = await getDocs(collection(db, 'orders'));
        fsOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { console.warn('Dashboard orders read error:', e); }

      let fsSubOrders: any[] = [];
      try {
        const snap = await getDocs(collection(db, 'subOrders'));
        fsSubOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { console.warn('Dashboard subOrders read error:', e); }

      let fsPartners: any[] = [];
      try {
        const snap = await getDocs(collection(db, 'partners'));
        fsPartners = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { console.warn('Dashboard partners read error:', e); }

      let fsQcRecords: any[] = [];
      try {
        const snap = await getDocs(collection(db, 'qcRecords'));
        fsQcRecords = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {}

      let fsCriticalCases: any[] = [];
      try {
        const snap = await getDocs(collection(db, 'criticalCases'));
        fsCriticalCases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {}

      let fsInvoices: any[] = [];
      try {
        const snap = await getDocs(collection(db, 'invoices'));
        fsInvoices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {}

      // 3. SubOrders mapping by orderId
      const subOrdersByOrder = new Map<string, any[]>();
      fsSubOrders.forEach(so => {
        const oid = String(so.orderId);
        if (!subOrdersByOrder.has(oid)) subOrdersByOrder.set(oid, []);
        subOrdersByOrder.get(oid)!.push(so);
      });

      // 4. Merge API and Firestore orders (Firestore is source of truth for garments/status)
      const ordersMap = new Map<string, any>();
      fsOrders.forEach(fo => {
        const key = String(fo.orderNumber || fo.orderId || fo.id);
        ordersMap.set(key, fo);
      });
      apiOrders.forEach(ao => {
        const key = String(ao.orderNumber || ao.orderId || ao.id);
        const existing = ordersMap.get(key);
        if (existing) {
          ordersMap.set(key, {
            ...ao,
            ...existing,
            status: existing.status || ao.status,
            qcStatus: existing.qcStatus || ao.qcStatus,
            deliveryStatus: existing.deliveryStatus || ao.deliveryStatus,
            garments: existing.garments || ao.garments,
          });
        } else {
          ordersMap.set(key, ao);
        }
      });

      const mergedOrders = Array.from(ordersMap.values()).filter(o => !o.id?.startsWith('local-'));

      // 5. Enrich orders with derived status and critical count
      const enrichedOrders = mergedOrders.map(order => {
        const oid = String(order.orderNumber || order.orderId || order.id);
        const subs = subOrdersByOrder.get(oid) || [];
        const derivedStatus = deriveStatus(order, subs);
        const garments = Array.isArray(order.garments) ? order.garments : [];
        const isReassignedGarment = (g: any) => g.isReassigned === true || g.criticalStatus === 'REASSIGNED' || !!g.adminCriticalComment;
        const criticalCount = garments.filter((g: any) => g.isCritical && !isReassignedGarment(g)).length;
        const reassignedCount = garments.filter((g: any) => isReassignedGarment(g)).length;
        return {
          ...order,
          derivedStatus,
          subOrders: subs,
          criticalCount,
          reassignedCount,
        };
      });

      // 6. Period filtering
      const range = getPeriodRange(period);
      const filtered = period === 'all' ? enrichedOrders : enrichedOrders.filter(o => {
        const created = o.createdAt ? new Date(o.createdAt).getTime() : 0;
        return created >= range.start && created <= range.end;
      });

      // 7. Compute Metric Stats
      const totalOrders = filtered.length;
      const activeOrders = filtered.filter(o =>
        !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.derivedStatus)
      ).length;

      // Critical Cases: sum of critical garments across orders, with fallback to open critical cases
      const garmentsCriticalCount = filtered.reduce((acc, o) => acc + (o.criticalCount || 0), 0);
      const openCasesCount = fsCriticalCases.filter((c: any) => c.status !== 'RESOLVED' && c.status !== 'CLOSED').length;
      const criticalCases = Math.max(garmentsCriticalCount, openCasesCount);

      // QC Sent:
      const qcSentOrders = filtered.filter(o =>
        o.derivedStatus === 'QC_PENDING' || o.derivedStatus === 'QC_SENT' || o.qcStatus === 'QC_PENDING' || o.qcStatus === 'QC_SENT' ||
        (o.subOrders || []).some((s: any) => s.status === 'QC_PENDING' || s.status === 'QC_SENT' || s.qcStatus === 'QC_PENDING')
      ).length;
      const qcSentRecords = fsQcRecords.filter((q: any) => q.status === 'QC_PENDING' || q.status === 'QC_SENT').length;
      const qcSent = Math.max(qcSentOrders, qcSentRecords);

      // QC Approved:
      const qcApprovedOrders = filtered.filter(o =>
        o.derivedStatus === 'QC_APPROVED' || o.qcStatus === 'QC_APPROVED' ||
        (o.subOrders || []).some((s: any) => s.status === 'QC_APPROVED' || s.qcStatus === 'QC_APPROVED')
      ).length;
      const qcApprovedRecords = fsQcRecords.filter((q: any) => q.status === 'QC_APPROVED').length;
      const qcApproved = Math.max(qcApprovedOrders, qcApprovedRecords);

      // Ready for Delivery:
      const readyForDelivery = filtered.filter(o =>
        o.derivedStatus === 'READY_FOR_DELIVERY' || o.status === 'READY_FOR_DELIVERY' || o.deliveryStatus === 'READY_FOR_DELIVERY' ||
        (o.subOrders || []).some((s: any) => s.status === 'READY_FOR_DELIVERY' || s.deliveryStatus === 'READY_FOR_DELIVERY')
      ).length;

      // Active Partners:
      let activePartners = fsPartners.filter((p: any) => p.active !== false).length;
      if (activePartners === 0 && fsSubOrders.length > 0) {
        const uniquePartners = new Set(fsSubOrders.map((s: any) => s.partnerId || s.partnerName).filter(Boolean));
        activePartners = uniquePartners.size;
      }

      // Invoices & Revenue:
      const pendingInvoices = fsInvoices.filter((i: any) => i.status === 'PENDING' || i.status === 'PENDING_APPROVAL').length;
      const totalRevenue = fsInvoices.filter((i: any) => i.status === 'PAID').reduce((sum: number, i: any) => sum + (Number(i.total) || 0), 0);

      // 8. Order Pipeline Status Breakdown across all filtered orders
      const pipelineCounts: Record<string, number> = {};
      filtered.forEach(o => {
        const s = o.derivedStatus || 'RECEIVED';
        if (s === 'READY_FOR_DELIVERY') {
          pipelineCounts['READY_FOR_DELIVERY'] = (pipelineCounts['READY_FOR_DELIVERY'] || 0) + 1;
        } else if (s === 'QC_APPROVED') {
          pipelineCounts['QC_APPROVED'] = (pipelineCounts['QC_APPROVED'] || 0) + 1;
        } else if (s === 'QC_PENDING' || s === 'QC_SENT') {
          pipelineCounts['QC_PENDING'] = (pipelineCounts['QC_PENDING'] || 0) + 1;
        } else if (s === 'QC_REJECTED') {
          pipelineCounts['QC_REJECTED'] = (pipelineCounts['QC_REJECTED'] || 0) + 1;
        } else if (s === 'IN_PROCESS' || s === 'IN_PROGRESS') {
          pipelineCounts['IN_PROCESS'] = (pipelineCounts['IN_PROCESS'] || 0) + 1;
        } else if (s === 'COMPLETED') {
          pipelineCounts['COMPLETED'] = (pipelineCounts['COMPLETED'] || 0) + 1;
        } else if (s === 'DELIVERED') {
          pipelineCounts['DELIVERED'] = (pipelineCounts['DELIVERED'] || 0) + 1;
        } else if (s === 'CANCELLED' || s === 'REJECTED') {
          pipelineCounts['CANCELLED'] = (pipelineCounts['CANCELLED'] || 0) + 1;
        } else {
          pipelineCounts['RECEIVED'] = (pipelineCounts['RECEIVED'] || 0) + 1;
        }
      });

      setStats({
        totalOrders,
        activeOrders,
        criticalCases,
        qcSent,
        qcApproved,
        readyForDelivery,
        activePartners,
        pendingInvoices,
        totalRevenue,
        pipelineCounts,
        filteredTotal: filtered.length,
      });

      // Sort recent orders descending by createdAt
      const sortedRecent = [...enrichedOrders].sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });
      setRecentOrders(sortedRecent.slice(0, 5));
    } catch (e: any) {
      console.error('Dashboard load failed:', e);
      setError(e.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [period]);

  const pipelineCounts = stats?.pipelineCounts || {};
  const totalForPct = stats?.filteredTotal || 1;

  if (!configured) {
    return (
      <div className="page">
        <div className="page-header"><div><h1>Dashboard</h1><p className="page-subtitle">Connect an API to see data.</p></div></div>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h2 style={{ marginBottom: 8 }}>No Data Source Connected</h2>
          <p className="text-muted" style={{ maxWidth: 400, margin: '0 auto 24px' }}>Go to Settings to connect your API.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

  if (error) {
    return (
      <div className="page">
        <div className="page-header"><div><h1>Dashboard</h1></div></div>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>
          <button className="btn btn-primary" onClick={() => { load(); }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', marginBottom: 6, lineHeight: 1.1 }}>Dashboard</h1>
          <p style={{ fontSize: 16, color: '#64748b', fontWeight: 400 }}>Welcome back! Here's what's happening across your operations.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 12 }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '7px 16px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: period === p ? '#fff' : 'transparent', color: period === p ? '#6366f1' : '#64748b',
                boxShadow: period === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Main Stats: Total Orders, Active Orders, Critical Cases */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 18 }}>
        {MAIN_STATS_CONFIG.map(cfg => (
          <StatCard key={cfg.title} title={cfg.title} value={stats?.[cfg.key] ?? 0} icon={cfg.icon} gradient={cfg.gradient} shadow={cfg.shadow} />
        ))}
      </div>

      {/* QC Stats: QC Sent, QC Approved, Ready for Delivery */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 18 }}>
        {QC_STATS_CONFIG.map(cfg => (
          <StatCard key={cfg.title} title={cfg.title} value={stats?.[cfg.key] ?? 0} icon={cfg.icon} gradient={cfg.gradient} shadow={cfg.shadow} />
        ))}
      </div>

      {/* Secondary Stats: Pending Invoices, Total Revenue, Active Partners */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 32 }}>
        {SECONDARY_STATS_CONFIG.map(cfg => (
          <StatCard key={cfg.title} title={cfg.title} value={cfg.format ? cfg.format(stats?.[cfg.key]) : (stats?.[cfg.key] ?? 0)} icon={cfg.icon} gradient={cfg.gradient} shadow={cfg.shadow} />
        ))}
      </div>

      {/* Pipeline + Recent Orders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Order Pipeline */}
        <div style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', borderRadius: 20, padding: '24px 26px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 4px 24px -4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>Order Pipeline</h2>
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, background: '#f1f5f9', padding: '4px 12px', borderRadius: 20 }}>{PERIOD_LABELS[period]}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ORDER_STATUSES.map(status => {
              const count = pipelineCounts[status.key] || 0;
              const pct = totalForPct > 0 ? Math.round((count / totalForPct) * 100) : 0;
              const Icon = status.icon;
              return (
                <div key={status.key} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: status.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} color={status.color} strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#334155' }}>{status.label}</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: status.color, letterSpacing: '-0.01em' }}>{count}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', minWidth: 28, textAlign: 'right' }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 7, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: status.color, borderRadius: 4, transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Orders */}
        <div style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', borderRadius: 20, padding: '24px 26px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 4px 24px -4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>Recent Orders</h2>
            <Link to="/orders" style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
          </div>
          {recentOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
              <Package size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
              <p style={{ fontSize: 14, fontWeight: 500 }}>No orders yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentOrders.map(o => {
                const c = o.customer || {};
                const displayId = o.id || o.orderId || '—';
                const badge = getStatusBadge(o.derivedStatus || o.status);
                const initials = (c.name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <Link
                    key={displayId}
                    to={"/orders/" + displayId}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '14px 16px',
                      background: 'linear-gradient(135deg, #fafbfc 0%, #f8fafc 100%)',
                      border: '1px solid #f1f5f9', borderRadius: 14, gap: 14,
                      textDecoration: 'none', transition: 'all 0.2s', cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLAnchorElement;
                      el.style.background = '#f1f5f9';
                      el.style.borderColor = '#e2e8f0';
                      el.style.transform = 'translateX(2px)';
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLAnchorElement;
                      el.style.background = 'linear-gradient(135deg, #fafbfc 0%, #f8fafc 100%)';
                      el.style.borderColor = '#f1f5f9';
                      el.style.transform = 'translateX(0)';
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
                    }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#6366f1', letterSpacing: '0.02em', marginBottom: 2 }}>{displayId}</div>
                      <div style={{ fontWeight: 500, fontSize: 13.5, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || '—'}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {o.criticalCount > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#dc2626', padding: '3px 8px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <AlertTriangle size={10} /> {o.criticalCount} Critical
                        </span>
                      )}
                      <span style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color, letterSpacing: '0.02em' }}>
                        {badge.label}
                      </span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500, minWidth: 70, textAlign: 'right' }}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, gradient, shadow }: { title: string; value: number | string; icon: any; gradient: string; shadow: string }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(20px)', borderRadius: 18, padding: '22px 24px',
        border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 4px 24px -4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', gap: 18, transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = 'translateY(-4px) scale(1.01)';
        el.style.boxShadow = '0 12px 32px -8px ' + shadow;
        el.style.borderColor = 'rgba(203,213,225,0.8)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = 'translateY(0) scale(1)';
        el.style.boxShadow = '0 4px 24px -4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)';
        el.style.borderColor = 'rgba(226,232,240,0.8)';
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: 14, background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: '0 6px 20px ' + shadow,
      }}>
        <Icon size={24} color="#fff" strokeWidth={2.5} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</div>
        <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginTop: 5 }}>{title}</div>
      </div>
    </div>
  );
}
