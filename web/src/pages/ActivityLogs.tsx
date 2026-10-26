import { useEffect, useState } from 'react';
import { Search, Activity } from 'lucide-react';
import { fetchActivityLogs, fetchUsers } from '../lib/api';
import type { ActivityLogEntry, AppUser } from '../types';

export default function ActivityLogsPage() {
 const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
 const [users, setUsers] = useState<AppUser[]>([]);
 const [loading, setLoading] = useState(true);
 const [filterUserId, setFilterUserId] = useState('');
 const [filterOrderId, setFilterOrderId] = useState('');
 const [filterAction, setFilterAction] = useState('');
 const [search, setSearch] = useState('');

 const load = () => {
  setLoading(true);
  Promise.all([
   fetchActivityLogs({
    userId: filterUserId || undefined,
    orderId: filterOrderId || undefined,
    action: filterAction || undefined,
    limit: 200,
   }),
   fetchUsers(),
  ])
   .then(([l, u]) => { setLogs(l); setUsers(u); })
   .catch(console.error)
   .finally(() => setLoading(false));
 };

 useEffect(() => { load(); }, [filterUserId, filterOrderId, filterAction]);

 const actionLabels: Record<string, { label: string; color: string }> = {
  ORDER_ACCEPTED: { label: 'Order Accepted', color: '#6366f1' },
  QC_SUBMITTED: { label: 'QC Submitted', color: '#f59e0b' },
  QC_APPROVED: { label: 'QC Approved', color: '#10b981' },
  QC_REJECTED: { label: 'QC Rejected', color: '#ef4444' },
  STATUS_CHANGE: { label: 'Status Change', color: '#8b5cf6' },
  USER_CREATED: { label: 'User Created', color: '#06b6d4' },
  USER_DELETED: { label: 'User Deleted', color: '#ef4444' },
  DELIVERY_INITIATED: { label: 'Delivery Initiated', color: '#10b981' },
 };

 const filtered = search
  ? logs.filter(l =>
     l.userName?.toLowerCase().includes(search.toLowerCase()) ||
     l.orderId?.toLowerCase().includes(search.toLowerCase()) ||
     l.action?.toLowerCase().includes(search.toLowerCase()) ||
     l.comments?.toLowerCase().includes(search.toLowerCase())
    )
  : logs;

 if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

 return (
 <div className="page">
  <div className="page-header" style={{ marginBottom: 24 }}>
   <div><h1>Activity Logs</h1><p className="page-subtitle">Complete audit trail of all actions</p></div>
   <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <div style={{ position: 'relative' }}>
     <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
     <input className="form-input" placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, width: 220 }} />
    </div>
   </div>
  </div>

  {/* Filters */}
  <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
   <select className="select" value={filterUserId} onChange={e => setFilterUserId(e.target.value)} style={{ width: 180 }}>
    <option value="">All Users</option>
    {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
   </select>
   <input className="form-input" placeholder="Order ID filter..." value={filterOrderId} onChange={e => setFilterOrderId(e.target.value)} style={{ width: 160 }} />
   <select className="select" value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ width: 180 }}>
    <option value="">All Actions</option>
    {Object.keys(actionLabels).map(a => <option key={a} value={a}>{actionLabels[a].label}</option>)}
   </select>
  </div>

  {/* Logs Table */}
  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
   <table className="data-table">
    <thead>
     <tr>
      <th>Time</th><th>User</th><th>Role</th><th>Action</th>
      <th>Order</th><th>Sub-Order</th><th>Details</th>
     </tr>
    </thead>
    <tbody>
     {filtered.length === 0 ? (
      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
       <Activity size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
       <div>No activity logs yet</div></td></tr>
     ) : filtered.map(log => {
      const info = actionLabels[log.action] || { label: log.action, color: '#64748b' };
      return (
      <tr key={log.id}>
       <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
        {log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
       </td>
       <td style={{ fontWeight: 600, color: '#0f172a' }}>{log.userName}</td>
       <td><span className={`badge badge-${log.role.toLowerCase()}`}>{log.role}</span></td>
       <td>
        <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: info.color + '20', color: info.color, letterSpacing: '0.01em' }}>
         {info.label}
        </span>
       </td>
       <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6366f1' }}>{log.orderId || '—'}</span></td>
       <td style={{ fontSize: 12, color: '#64748b' }}>{log.subOrderId || '—'}</td>
       <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {log.previousValue && <span style={{ color: '#ef4444' }}>{log.previousValue}</span>}
        {log.previousValue && log.newValue ? ' → ' : ''}
        {log.newValue && <span style={{ color: '#10b981' }}>{log.newValue}</span>}
        {log.comments && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{log.comments}</div>}
       </td>
      </tr>
      );
     })}
    </tbody>
   </table>
  </div>

  {filtered.length > 0 && (
   <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
    Showing {filtered.length} of {logs.length} logs
   </div>
  )}
 </div>
 );
}
