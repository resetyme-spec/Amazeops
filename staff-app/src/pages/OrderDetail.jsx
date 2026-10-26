import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, QrCode, User, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchOrderById, approveQC, rejectQC, updateOrderStatus } from '../lib/api';

export default function OrderDetail() {
 const { id } = useParams();
 const navigate = useNavigate();
 const { user } = useAuth();
 const [order, setOrder] = useState(null);
 const [loading, setLoading] = useState(true);
 const [actionLoading, setActionLoading] = useState(false);
 const [error, setError] = useState('');
 const [showReject, setShowReject] = useState(false);
 const [rejectReason, setRejectReason] = useState('');
 const [rejectComments, setRejectComments] = useState('');

 const load = async () => {
 if (!id) return;
 setLoading(true);
 const data = await fetchOrderById(id);
 setOrder(data);
 setLoading(false);
 };

 useEffect(() => { load(); }, [id]);

 if (!user) { navigate('/login'); return null; }

 if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;
 if (!order) return <div className="empty-state"><p>Order not found</p><button className="btn btn-secondary" onClick={() => navigate('/orders')}>Back</button></div>;

 const isQcPending = order.qcStatus === 'QC_PENDING';
 const isQcApproved = order.qcStatus === 'QC_APPROVED';
 const isQcRejected = order.qcStatus === 'QC_REJECTED';
 const canReview = isQcPending || isQcRejected;

 const handleApprove = async () => {
 if (!id) return;
 setActionLoading(true);
 try {
 await approveQC(id, user, 'Approved by staff');
 await load();
 } catch (e) { setError(e.message || 'Failed'); }
 setActionLoading(false);
 };

 const handleReject = async () => {
 if (!id || !rejectReason.trim()) return;
 setActionLoading(true);
 try {
 await rejectQC(id, rejectReason, rejectComments, user);
 setShowReject(false);
 setRejectReason(''); setRejectComments('');
 await load();
 } catch (e) { setError(e.message || 'Failed'); }
 setActionLoading(false);
 };

 const handleInitiateDelivery = async () => {
 if (!id) return;
 setActionLoading(true);
 try {
 await updateOrderStatus(id, 'DELIVERED', { id: user.id, name: user.name, role: user.role, comment: 'Delivery initiated by staff' });
 await load();
 } catch (e) { setError(e.message || 'Failed'); }
 setActionLoading(false);
 };

 return (
 <div className="detail-screen">
 <header className="screen-header">
 <button className="icon-btn" onClick={() => navigate('/orders')}><ArrowLeft size={20} /></button>
 <h1>{order.orderId || order.id}</h1>
 </header>

 {error && <div className="error-banner" onClick={() => setError('')}>{error}</div>}

 <div className="detail-section">
 <div className="status-row">
 <span className="status-label">Order Status:</span>
 <span className={`status-badge-lg ${isQcRejected ? 'status-rejected' : isQcApproved ? 'status-approved' : isQcPending ? 'status-pending' : 'status-active'}`}>
 {isQcRejected ? 'QC REJECTED' : isQcApproved ? 'QC APPROVED' : isQcPending ? 'QC PENDING' : order.status}
 </span>
 </div>
 {isQcRejected && order.qcRejection && (
 <div className="rejection-card">
 <p><strong>Reason:</strong> {order.qcRejection.reason}</p>
 <p><strong>Comments:</strong> {order.qcRejection.comments}</p>
 <p><strong>Rejected by:</strong> {order.qcRejection.rejectedBy} · {order.qcRejection.rejectedAt ? new Date(order.qcRejection.rejectedAt).toLocaleString('en-IN') : ''}</p>
 </div>
 )}
 </div>

 <div className="detail-section">
 <h3 className="section-title"><User size={16} /> Customer</h3>
 <div className="info-grid">
 <div><span className="info-label">Name</span><span className="info-value">{order.customer?.name || '—'}</span></div>
 <div><span className="info-label">Phone</span><span className="info-value">{order.customer?.phone || '—'}</span></div>
 <div><span className="info-label">Category</span><span className="info-value">{order.customer?.category || '—'}</span></div>
 <div><span className="info-label">Care Category</span><span className="info-value">{order.careCategory || '—'}</span></div>
 </div>
 </div>

 {order.qcSubmittedAt && (
 <div className="detail-section">
 <h3 className="section-title"><FileText size={16} /> Partner QC Submission</h3>
 <div className="info-grid">
 <div><span className="info-label">Submitted By</span><span className="info-value">{order.qcSubmittedBy || '—'}</span></div>
 <div><span className="info-label">Submitted At</span><span className="info-value">{order.qcSubmittedAt ? new Date(order.qcSubmittedAt).toLocaleString('en-IN') : '—'}</span></div>
 </div>
 {order.garments?.map(g => (
 <div key={g.garmentId} className="garment-card">
 <div className="garment-header">
 <span className="garment-number">{g.garmentId.slice(-1)}</span>
 <div>
 <p className="garment-id">{g.garmentId}</p>
 <p className="garment-detail">{g.qrCode || '—'} · {g.category} · {g.serviceType}</p>
 </div>
 </div>
 {g.brand && <p className="info-value">Brand: {g.brand}</p>}
 {g.comments && <p className="info-value">Comments: {g.comments}</p>}
 {g.photos && (
 <div className="photo-preview-row">
 {g.photos.front && <span className="photo-tag">Front ✓</span>}
 {g.photos.back && <span className="photo-tag">Back ✓</span>}
 {g.photos.other && <span className="photo-tag">Other ✓</span>}
 </div>
 )}
 </div>
 ))}
 </div>
 )}

 <div className="action-bar">
 {canReview && (
 <>
 <button className="btn btn-approve btn-full" onClick={handleApprove} disabled={actionLoading}>
 <CheckCircle2 size={18} /> Approve QC
 </button>
 <button className="btn btn-reject" onClick={() => setShowReject(true)} disabled={actionLoading} style={{ marginTop: 8 }}>
 <XCircle size={18} /> Reject QC
 </button>
 </>
 )}
 {isQcApproved && order.deliveryStatus !== 'INITIATED' && (
 <button className="btn btn-success btn-full" onClick={handleInitiateDelivery} disabled={actionLoading} style={{ marginTop: 8 }}>
 <CheckCircle2 size={18} /> Initiate Delivery
 </button>
 )}
 {isQcApproved && order.deliveryStatus === 'INITIATED' && (
 <button className="btn btn-secondary btn-full" disabled style={{ marginTop: 8 }}>
 <CheckCircle2 size={18} /> Delivery Initiated
 </button>
 )}
 </div>

 {showReject && (
 <div className="modal-overlay" onClick={() => setShowReject(false)}>
 <div className="modal">
 <div className="modal-header">
 <h2>Reject QC</h2>
 <button className="btn-icon" onClick={() => setShowReject(false)}><XCircle size={18} /></button>
 </div>
 <div className="form-grid">
 <div className="form-group full-width">
 <label>Rejection Reason *</label>
 <select className="select" value={rejectReason} onChange={e => setRejectReason(e.target.value)}>
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
 <label>Detailed Comments</label>
 <textarea className="form-input textarea" value={rejectComments} onChange={e => setRejectComments(e.target.value)} placeholder="Add detailed comments for the partner..." rows={3} />
 </div>
 </div>
 <div className="modal-footer">
 <button className="btn btn-secondary" onClick={() => setShowReject(false)}>Cancel</button>
 <button className="btn btn-reject-full" onClick={handleReject} disabled={!rejectReason.trim() || actionLoading}>
 <XCircle size={16} /> Reject
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
