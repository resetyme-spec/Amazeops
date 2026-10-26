import { useEffect, useState } from 'react';
import { fetchCriticalCases } from '../lib/api';
import type { CriticalCase } from '../types';

export default function CriticalCasesPage() {
 const [cases, setCases] = useState<CriticalCase[]>([]);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 fetchCriticalCases().then(setCases).catch(console.error).finally(() => setLoading(false));
 }, []);

 if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

 const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
 const sorted = [...cases].sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));

 return (
 <div className="page">
 <div className="page-header">
 <div><h1>Critical Cases</h1><p className="page-subtitle">Priority issues requiring attention</p></div>
 </div>
 {sorted.length === 0 ? (
 <div className="card"><div className="card-body"><p className="text-muted">No open critical cases</p></div></div>
 ) : (
 <div className="table-container">
 <table className="data-table">
 <thead><tr><th>Severity</th><th>Issue</th><th>Description</th><th>Status</th></tr></thead>
 <tbody>
 {sorted.map(c => (
 <tr key={c.id}>
 <td><span className={`badge badge-${c.severity.toLowerCase()}`}>{c.severity}</span></td>
 <td>{c.issueType.replace('_', ' ')}</td>
 <td>{c.description}</td>
 <td><span className={`badge badge-${c.status.toLowerCase()}`}>{c.status}</span></td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 );
}
