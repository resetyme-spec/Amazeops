import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Search, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllOrders } from '../lib/api';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, orderBy } from 'firebase/firestore';

export default function QCPage() {
 const { user } = useAuth();
 const navigate = useNavigate();
 const [orders, setOrders] = useState([]);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState('');
 const [statusFilter, setStatusFilter] = useState('');
 const [actionLoading, setActionLoading] = useState(false);
 const [rejectForm, setRejectForm] = useState(null);

 const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'QC Pending', value: 'QC_PENDING' },
  { label: 'QC Approved', value: 'QC_APPROVED' },
  { label: 'QC Rejected', value: 'QC_REJECTED' },
 ];

 const load = async () => {
  setLoading(true);
  let apiOrders = [];
  try { apiOrders = await fetchAllOrders(); } catch (e) { /* API optional */ }
  // Fetch QC records from Firestore (partner app writes here)
  let qcRecords = [];
  try {
   const snap = await getDocs(collection(db, 'qcRecords'));
   qcRecords = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('Failed to load QC records:', e); }
  // Build QC queue from QC records + API orders
  const apiIds = new Set(apiOrders.map(o => o.id || o.orderId));
  const enriched = apiOrders.map(o => {
   const qc = qcRecords.find(r => r.orderId === o.id || r.orderId === o.orderId);
   if (qc) {
    o.qcStatus = qc.status || 'QC_PENDING';
    o.qcSubmittedAt = qc.submittedAt;
    o.qcSubmittedBy = qc.submittedBy;
    o.qcGarments = qc.garmentUpdates;
    o.qcRejection = qc.rejectionReason ? { reason: qc.rejectionReason, comments: qc.rejectionComments } : null;
   }
   return o;
  });
  const orphanQC = qcRecords
   .filter(q => !apiIds.has(q.orderId))
   .map(q => ({
    id: q.orderId,
    orderId: q.orderId,
    qcStatus: qc.status || 'QC_PENDING',
    qcSubmittedAt: q.submittedAt,
    qcSubmittedBy: q.submittedBy,
    qcGarments: q.garmentUpdates,
    customer: null,
    garments: [],
    careCategory: '—',
    status: 'RECEIVED',
   }));
  setOrders([...enriched, ...orphanQC]);
  setLoading(false);
 };

 useEffect(() => { load(); }, []);

 if (!user) { navigate('/login'); return null; }

 const qcOrders = orders.filter(o => o.qcStatus === 'QC_PENDING' || o.qcStatus === 'QC_REJECTED' || o.qcStatus === 'QC_APPROVED');
 const filtered = qcOrders.filter(o => {
  if (statusFilter && o.qcStatus !== statusFilter) return false;
  if (search) {
   const q = search.toLowerCase();
   return (o.orderId || o.id).toLowerCase().includes(q) || o.customer?.name?.toLowerCase().includes(q);
  }
  return true;
 });

 const handleApprove = async (orderId: string) => {
  setActionLoading(true);
  try {
   const snap = await getDocs(query(collection(db, 'qcRecords'), where('orderId', '==', orderId), orderBy('submittedAt', 'desc')));
   if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, { status: 'QC_APPROVED', approvedAt: serverTimestamp(), approvedBy: user?.name || 'Staff' });
   }
   await load();
  } catch (e: any) { alert(e.message || 'Failed to approve'); }
  setActionLoading(false);
 };

 const handleReject = async () => {
  if (!rejectForm || !rejectForm.reason.trim()) return;
  setActionLoading(true);
  try {
   const snap = await getDocs(query(collection(db, 'qcRecords'), where('orderId', '==', rejectForm.orderId), orderBy('submittedAt', 'desc')));
   if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, { status: 'QC_REJECTED', rejectedAt: serverTimestamp(), rejectedBy: user?.name || 'Staff', rejectionReason: rejectForm.reason, rejectionComments: rejectForm.comments || '' });
   }
   setRejectForm(null);
   await load();
  } catch (e: any) { alert(e.message || 'Failed to reject'); }
  setActionLoading(false);
 };

 if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;

 return (
 <div className="qc-screen">
  <header className="screen-header">
   <h1>QC Review</h1>
   <button className="icon-btn" onClick={load}><ShieldCheck size={18} /></button>
  </header>

  {/* Search */}
  <div className="search-bar">
   <Search size={16} />
   <input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} />
  </div>

  {/* Status Filters */}
  <div className="filter-row">
   {STATUS_FILTERS.map(f => (
    <button key={f.value} className={`filter-chip ${statusFilter === f.value ? 'filter-chip--active' : ''}`} onClick={() => setStatusFilter(f.value)}>
     {f.label}
    </button>
   ))}
  </div>

  {/* QC Queue Stats */}
  <div className="qc-stats-bar">
   <div className="qc-stat"><span className="qc-stat-value">{orders.filter(o => o.qcStatus === 'QC_PENDING').length}</span><span className="qc-stat-label">Pending</span></div>
   <div className="qc-stat-divider" />
   <div className="qc-stat"><span className="qc-stat-value approved">{orders.filter(o => o.qcStatus === 'QC_APPROVED').length}</span><span className="qc-stat-label">Approved</span></div>
   <div className="qc-stat-divider" />
   <div className="qc-stat"><span className="qc-stat-value rejected">{orders.filter(o => o.qcStatus === 'QC_REJECTED').length}</span><span className="qc-stat-label">Rejected</span></div>
  </div>

  {/* Orders List */}
  <div className="qc-list">
   {filtered.length === 0 ? (
    <div className="empty-state"><ShieldCheck size={48} /><p>No orders in QC queue</p></div>
   ) : filtered.map(order => (
    <div key={order.id} className="qc-card">
     <Link to={`/orders/${order.id}`} className="qc-card-main">
      <div className="qc-card-header">
       <span className="qc-order-id">{order.orderId || order.id}</span>
       <span className={`qc-badge ${order.qcStatus === 'QC_PENDING' ? 'qc-pending' : order.qcStatus === 'QC_APPROVED' ? 'qc-approved' : 'qc-rejected'}`}>
        {order.qcStatus === 'QC_PENDING' ? '⏳ Pending' : order.qcStatus === 'QC_APPROVED' ? '✓ Approved' : '✗ Rejected'}
       </span>
      </div>
      <div className="qc-card-body">
       <p className="qc-customer">{order.customer?.name || '—'}</p>
       <p className="qc-meta">{order.customer?.category || '—'} · {order.careCategory || '—'} · {order.garments?.length || 0} garments</p>
       {order.qcRejection && (
        <div className="qc-rejection-info">
         <p><strong>Reason:</strong> {order.qcRejection.reason}</p>
         <p><strong>Comments:</strong> {order.qcRejection.comments}</p>
        </div>
       )}
       {order.qcSubmittedAt && (
        <p className="qc-timestamp">Submitted: {new Date(order.qcSubmittedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
       )}
      </div>
     </Link>

     {/* Action Buttons */}
     {(order.qcStatus === 'QC_PENDING' || order.qcStatus === 'QC_REJECTED') && (
      <div className="qc-actions">
       <button className="btn btn-approve" onClick={() => handleApprove(order.id)} disabled={actionLoading}>
        <CheckCircle2 size={16} /> Approve
       </button>
       <button className="btn btn-reject" onClick={() => setRejectForm({ orderId: order.id, reason: '', comments: '' })} disabled={actionLoading}>
        <XCircle size={16} /> Reject
       </button>
      </div>
     )}
    </div>
   ))}
  </div>

  {/* Reject Modal */}
  {rejectForm && (
   <div className="modal-overlay" onClick={() => setRejectForm(null)}>
    <div className="modal" onClick={e => e.stopPropagation()}>
     <div className="modal-header">
      <h2>Reject Order</h2>
      <button className="btn-icon" onClick={() => setRejectForm(null)}><XCircle size={18} /></button>
     </div>
     <div className="form-grid">
      <div className="form-group full-width">
       <label>Rejection Reason *</label>
       <select className="select" value={rejectForm.reason} onChange={e => setRejectForm({ ...rejectForm, reason: e.target.value })}>
        <option value="">Select reason...</option>
        <option value="Photos unclear">Photos unclear</option>
        <option value="Quality issues">Quality issues</option>
        <option value="Wrong garment">Wrong garment</option>
        <option value="Missing information">Missing information</option>
        <option value="Damage detected">Damage detected</option>
        <option value="Other">Other</option>
       </select>
      </div>
      <div className="form-group full-width">
       <label>Comments</label>
       <textarea className="form-input textarea" value={rejectForm.comments} onChange={e => setRejectForm({ ...rejectForm, comments: e.target.value })} placeholder="Add detailed comments..." rows={3} />
      </div>
     </div>
     <div className="modal-footer">
      <button className="btn btn-secondary" onClick={() => setRejectForm(null)}>Cancel</button>
      <button className="btn btn-reject-full" onClick={handleReject} disabled={!rejectForm.reason.trim() || actionLoading}>
       <XCircle size={16} /> Reject Order
      </button>
     </div>
    </div>
   </div>
  )}
 </div>
 );
}
