import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { fetchActivityLogs, fetchUsers } from '../lib/api';

export default function ActivityLogs() {
 const [logs, setLogs] = useState([]);
 const [users, setUsers] = useState([]);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState('');
 const [filterUserId, setFilterUserId] = useState('');
 const [filterAction, setFilterAction] = useState('');

 const load = () => {
  setLoading(true);
  Promise.all([
   fetchActivityLogs({
    userId: filterUserId || undefined,
    action: filterAction || undefined,
    limit: 200,
   }),
   fetchUsers(),
  ])
   .then(([l, u]) => { setLogs(l); setUsers(u); })
   .catch(console.error)
   .finally(() => setLoading(false));
 };

 useEffect(() => { load(); }, [filterUserId, filterAction]);

 const actionLabels = {
  ORDER_ACCEPTED: { label: 'Order Accepted', color: '#6366f1' },
  QC_SUBMITTED: { label: 'QC Submitted', color: '#f59e0b' },
  QC_APPROVED: { label: 'QC Approved', color: '#10b981' },
  QC_REJECTED: { label: 'QC Rejected', color: '#ef4444' },
  STATUS_CHANGE: { label: 'Status Change', color: '#8b5cf6' },
  DELIVERY_INITIATED: { label: 'Delivery Initiated', color: '#06b6d4' },
 };

 const filtered = search
  ? logs.filter(l => l.userName?.toLowerCase().includes(search.toLowerCase()) || l.orderId?.toLowerCase().includes(search.toLowerCase()) || l.action?.toLowerCase().includes(search.toLowerCase()))
  : logs;

 if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;

 return (
 <div className="page">
  <header className="screen-header"><h1>Activity Logs</h1></header>

  <div className="search-bar" style={{ marginTop: 12 }}>
   <Search size={16} />
   <input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} />
  </div>

  <div className="filter-row" style={{ padding: '0 16px 12px' }}>
   <select className="select" value={filterUserId} onChange={e => setFilterUserId(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '8px 10px' }}>
    <option value="">All Users</option>
    {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
   </select>
   <select className="select" value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '8px 10px' }}>
    <option value="">All Actions</option>
    {Object.keys(actionLabels).map(a => <option key={a} value={a}>{actionLabels[a].label}</option>)}
   </select>
  </div>

  <div style={{ padding: '0 16px' }}>
   {filtered.length === 0 ? (
    <div className="empty-state"><Search size={32} /><p>No logs found</p></div>
   ) : (
    <div className="logs-list">
     {filtered.map(log => {
      const info = actionLabels[log.action] || { label: log.action, color: '#64748b' };
      return (
      <div key={log.id} className="log-card">
       <div className="log-card-header">
        <span className="log-action" style={{ background: info.color + '18', color: info.color }}>{info.label}</span>
        <span className="log-time">{log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
       </div>
       <div className="log-card-body">
        <span className="log-user">{log.userName}</span>
        <span className={`log-role badge-${log.role.toLowerCase()}`}>{log.role}</span>
       </div>
       {log.orderId && <div className="log-order">Order: {log.orderId}</div>}
       {log.comments && <div className="log-comments">{log.comments}</div>}
      </div>
      );
     })}
    </div>
   )}
  </div>
 </div>
 );
}
