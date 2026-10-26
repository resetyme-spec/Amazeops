import { useEffect, useState } from 'react';
import {
  ShieldCheck, Search, CheckCircle2, XCircle, AlertTriangle, Eye, Image as ImageIcon,
  MessageSquare, Camera, ChevronRight, Check, X, Tag
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import {
  collection, getDocs, doc, updateDoc, setDoc, getDoc, serverTimestamp, orderBy, query
} from 'firebase/firestore';
import type { Order, QCRecord, Garment } from '../types';

interface QCQueueItem {
  id: string; // qcRecord doc id
  orderId: string;
  orderNumber?: string;
  subOrderId?: string;
  partnerId?: string;
  partnerName?: string;
  status: 'QC_PENDING' | 'QC_APPROVED' | 'QC_REJECTED';
  submittedAt?: string;
  submittedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  rejectionComments?: string;
  garmentUpdates: Array<{
    garmentId: string;
    brand?: string;
    comments?: string;
    photos?: { front?: string; back?: string; other?: string };
  }>;
  rejectedGarments?: Record<string, {
    reason: string;
    comments?: string;
    photos?: string[];
    rejectedAt: string;
    rejectedBy: string;
  }>;
  customer?: { name?: string; phone?: string; category?: string };
  careCategory?: string;
  garments: Garment[];
}

export default function QCPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<QCQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'QC_PENDING' | 'QC_APPROVED' | 'QC_REJECTED'>('QC_PENDING');
  const [selectedItem, setSelectedItem] = useState<QCQueueItem | null>(null);

  // Garment-wise rejection modal state
  const [rejectModal, setRejectModal] = useState<{
    open: boolean;
    item: QCQueueItem | null;
    garmentId: string;
    garmentName: string;
  }>({ open: false, item: null, garmentId: '', garmentName: '' });

  const [rejectionReason, setRejectionReason] = useState('Stain not removed');
  const [rejectionComments, setRejectionComments] = useState('');
  const [rejectionPhotos, setRejectionPhotos] = useState<string[]>(['', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const REJECTION_REASONS = [
    'Stain not removed',
    'Wrinkles / Poor Pressing',
    'Fabric Damage / Tear',
    'Color Bleeding / Mismatch',
    'Odor / Improper Washing',
    'Incorrect Packaging / Missing Label',
    'Other Issue'
  ];

  const loadQCQueue = async () => {
    setLoading(true);
    try {
      // 1. Fetch QC Records
      const qcSnap = await getDocs(collection(db, 'qcRecords'));
      const records: Array<QCRecord & { id: string }> = qcSnap.docs.map(d => ({
        id: d.id,
        ...(d.data() as any),
      }));

      // 2. Fetch Orders & SubOrders for full context
      const [ordersSnap, subOrdersSnap] = await Promise.all([
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'subOrders')),
      ]);

      const ordersMap = new Map<string, any>();
      ordersSnap.docs.forEach(d => ordersMap.set(d.id, { id: d.id, ...d.data() }));

      const subOrdersMap = new Map<string, any>();
      subOrdersSnap.docs.forEach(d => subOrdersMap.set(d.id, { id: d.id, ...d.data() }));

      // Build unified queue
      const queue: QCQueueItem[] = records.map(rec => {
        // Resolve parent order ID (might be orderId or doc ID of sub-order)
        let orderData = ordersMap.get(rec.orderId);
        let subOrderData = subOrdersMap.get(rec.orderId);

        if (!orderData && subOrderData?.orderId) {
          orderData = ordersMap.get(subOrderData.orderId);
        }

        const garments = orderData?.garments || [];
        const partnerName = subOrderData?.partnerName || 'Assigned Partner';

        return {
          id: rec.id,
          orderId: orderData?.id || rec.orderId,
          orderNumber: orderData?.orderNumber || orderData?.orderId || rec.orderId,
          subOrderId: subOrderData?.id,
          partnerId: rec.partnerId || subOrderData?.partnerId,
          partnerName,
          status: rec.status || 'QC_PENDING',
          submittedAt: rec.submittedAt,
          submittedBy: rec.submittedBy,
          approvedAt: rec.approvedAt,
          approvedBy: rec.approvedBy,
          rejectedAt: rec.rejectedAt,
          rejectedBy: rec.rejectedBy,
          rejectionReason: rec.rejectionReason,
          rejectionComments: rec.rejectionComments,
          garmentUpdates: rec.garmentUpdates || [],
          rejectedGarments: rec.rejectedGarments || {},
          customer: orderData?.customer,
          careCategory: orderData?.careCategory,
          garments,
        };
      });

      // Sort newest first
      queue.sort((a, b) => {
        const da = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const dbTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return dbTime - da;
      });

      setItems(queue);
      if (selectedItem) {
        const updatedSelected = queue.find(q => q.id === selectedItem.id);
        if (updatedSelected) setSelectedItem(updatedSelected);
      }
    } catch (e) {
      console.error('Failed to load QC queue:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadQCQueue();
  }, []);

  // Filter list
  const filtered = items.filter(item => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchId = (item.orderNumber || item.orderId).toLowerCase().includes(q);
      const matchCustomer = (item.customer?.name || '').toLowerCase().includes(q);
      const matchPartner = (item.partnerName || '').toLowerCase().includes(q);
      return matchId || matchCustomer || matchPartner;
    }
    return true;
  });

  // Action: Open Garment Reject Modal
  const openGarmentRejectModal = (item: QCQueueItem, garmentId: string, garmentName: string) => {
    setRejectModal({
      open: true,
      item,
      garmentId,
      garmentName,
    });
    setRejectionReason('Stain not removed');
    setRejectionComments('');
    setRejectionPhotos(['', '', '']);
  };

  // Submit Garment-wise Rejection
  const handleConfirmGarmentReject = async () => {
    if (!rejectModal.item || !rejectModal.garmentId) return;
    if (!rejectionComments.trim()) {
      alert('Please enter a comment explaining the rejection issue.');
      return;
    }

    setSubmitting(true);
    const item = rejectModal.item;
    const gId = rejectModal.garmentId;
    const photos = rejectionPhotos.filter(p => p.trim());
    const actorName = user?.name || 'Admin';

    try {
      const nowIso = new Date().toISOString();
      const newRejectedGarments = {
        ...(item.rejectedGarments || {}),
        [gId]: {
          reason: rejectionReason,
          comments: rejectionComments,
          photos,
          rejectedAt: nowIso,
          rejectedBy: actorName,
        },
      };

      // 1. Update QC Record in Firestore
      const qcRef = doc(db, 'qcRecords', item.id);
      await updateDoc(qcRef, {
        status: 'QC_REJECTED',
        rejectedAt: nowIso,
        rejectedBy: actorName,
        rejectionReason: `${rejectionReason} (Garment ${gId})`,
        rejectionComments: rejectionComments,
        rejectedGarments: newRejectedGarments,
      });

      // 2. Update the parent order's garments array
      try {
        const orderRef = doc(db, 'orders', item.orderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          const garments = (orderData.garments || []).map((g: any) => {
            if (g.garmentId === gId) {
              return {
                ...g,
                status: 'QC_REJECTED',
                qcStatus: 'QC_REJECTED',
                qcRejection: {
                  reason: rejectionReason,
                  comments: rejectionComments,
                  photos,
                  rejectedAt: nowIso,
                  rejectedBy: actorName,
                },
              };
            }
            return g;
          });
          await updateDoc(orderRef, {
            garments,
            status: 'QC_REJECTED',
            rejectionReason: `${rejectionReason} (Garment ${gId})`,
            rejectionComments,
            rejectedAt: nowIso,
            rejectedBy: actorName,
          });
        }
      } catch (e) {
        console.warn('Could not update parent order directly:', e);
      }

      // 3. Update the sub-order status so the partner sees QC_REJECTED
      try {
        const subSnap = await getDocs(collection(db, 'subOrders'));
        const subDoc = subSnap.docs.find(d => {
          const data = d.data();
          return (data.orderId === item.orderId || d.id === item.orderId) &&
            (data.garmentIds || []).includes(gId);
        });
        if (subDoc) {
          await updateDoc(subDoc.ref, {
            status: 'QC_REJECTED',
            rejectionReason: `${rejectionReason} (Garment ${gId})`,
            rejectionComments,
            rejectedAt: nowIso,
            rejectedBy: actorName,
          });
        }
      } catch (e) {
        console.warn('Could not update subOrder:', e);
      }

      setRejectModal({ open: false, item: null, garmentId: '', garmentName: '' });
      await loadQCQueue();
      alert(`Garment ${gId} marked as QC Rejected with comments and photo.`);
    } catch (e: any) {
      console.error('Error rejecting garment:', e);
      alert('Failed to reject garment: ' + (e.message || 'Unknown error'));
    }
    setSubmitting(false);
  };

  // Approve Entire Order QC
  const handleApproveQC = async (item: QCQueueItem) => {
    if (!confirm(`Approve Quality Check for order ${item.orderNumber}?`)) return;
    setSubmitting(true);
    const actorName = user?.name || 'Admin';
    const nowIso = new Date().toISOString();

    try {
      // 1. Update qcRecord
      await updateDoc(doc(db, 'qcRecords', item.id), {
        status: 'QC_APPROVED',
        approvedAt: nowIso,
        approvedBy: actorName,
      });

      // 2. Update order garments to QC_PASSED / READY_FOR_DELIVERY
      try {
        const orderRef = doc(db, 'orders', item.orderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          const garments = (orderData.garments || []).map((g: any) => ({
            ...g,
            status: 'QC_PASSED',
            qcStatus: 'QC_PASSED',
          }));
          await updateDoc(orderRef, {
            garments,
            status: 'COMPLETED',
            qcStatus: 'QC_APPROVED',
            approvedAt: nowIso,
            approvedBy: actorName,
          });
        }
      } catch (e) {
        console.warn('Could not update order:', e);
      }

      // 3. Update sub-order to COMPLETED
      try {
        const subSnap = await getDocs(collection(db, 'subOrders'));
        const matchingSubs = subSnap.docs.filter(d => d.data().orderId === item.orderId || d.id === item.orderId);
        for (const s of matchingSubs) {
          await updateDoc(s.ref, { status: 'COMPLETED', qcStatus: 'QC_APPROVED' });
        }
      } catch (e) {
        console.warn('Could not update subOrders:', e);
      }

      await loadQCQueue();
      alert('Order approved for delivery!');
    } catch (e: any) {
      alert('Failed to approve QC: ' + (e.message || 'Unknown error'));
    }
    setSubmitting(false);
  };

  return (
    <div className="page" style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={26} color="#4f46e5" />
            Quality Control (QC)
          </h1>
          <p className="page-subtitle">Review garments submitted by laundry partners and record garment-wise approvals or rejections</p>
        </div>
        <button className="btn btn-secondary" onClick={loadQCQueue}>
          Refresh Queue
        </button>
      </div>

      {/* Filter Chips & Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Pending Review', value: 'QC_PENDING', count: items.filter(i => i.status === 'QC_PENDING').length },
            { label: 'Approved', value: 'QC_APPROVED', count: items.filter(i => i.status === 'QC_APPROVED').length },
            { label: 'Rejected', value: 'QC_REJECTED', count: items.filter(i => i.status === 'QC_REJECTED').length },
            { label: 'All Records', value: 'ALL', count: items.length },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value as any)}
              style={{
                padding: '7px 16px',
                borderRadius: 20,
                border: '1px solid ' + (statusFilter === tab.value ? '#4f46e5' : '#e5e7eb'),
                background: statusFilter === tab.value ? '#4f46e5' : '#fff',
                color: statusFilter === tab.value ? '#fff' : '#4b5563',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>{tab.label}</span>
              <span style={{
                background: statusFilter === tab.value ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
                color: statusFilter === tab.value ? '#fff' : '#6b7280',
                padding: '1px 7px',
                borderRadius: 10,
                fontSize: 11,
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search Order or Customer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 13,
              background: '#fff',
            }}
          />
        </div>
      </div>

      {/* Main Content: Split View / List */}
      {loading ? (
        <div className="loading-screen"><div className="loading-spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
          <ShieldCheck size={48} color="#9ca3af" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>No orders found in QC queue</h3>
          <p style={{ color: '#9ca3af', fontSize: 13 }}>There are no items matching the selected filter status.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map(item => {
            const hasRejections = Object.keys(item.rejectedGarments || {}).length > 0;
            const isApproved = item.status === 'QC_APPROVED';
            const isRejected = item.status === 'QC_REJECTED';

            return (
              <div
                key={item.id}
                style={{
                  background: '#fff',
                  border: '1px solid ' + (isRejected ? '#fecaca' : isApproved ? '#bbf7d0' : '#e5e7eb'),
                  borderLeft: '5px solid ' + (isRejected ? '#ef4444' : isApproved ? '#10b981' : '#f59e0b'),
                  borderRadius: 12,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  padding: 20,
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#1e293b' }}>
                        {item.orderNumber}
                      </span>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 700,
                        background: isRejected ? '#fef2f2' : isApproved ? '#f0fdf4' : '#fffbeb',
                        color: isRejected ? '#dc2626' : isApproved ? '#16a34a' : '#d97706',
                      }}>
                        {item.status.replace('_', ' ')}
                      </span>
                      {hasRejections && (
                        <span style={{ fontSize: 11, fontWeight: 700, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={12} /> {Object.keys(item.rejectedGarments || {}).length} Garment(s) Rejected
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span><strong>Customer:</strong> {item.customer?.name || '—'} ({item.customer?.phone || '—'})</span>
                      <span><strong>Partner:</strong> {item.partnerName}</span>
                      <span><strong>Submitted:</strong> {item.submittedAt ? new Date(item.submittedAt).toLocaleString('en-IN') : '—'}</span>
                    </div>
                  </div>

                  {/* Actions for this QC submission */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {item.status === 'QC_PENDING' && (
                      <button
                        className="btn btn-primary"
                        style={{ background: '#10b981', borderColor: '#10b981', fontSize: 13, padding: '7px 16px' }}
                        onClick={() => handleApproveQC(item)}
                        disabled={submitting}
                      >
                        <Check size={16} style={{ marginRight: 6 }} /> Approve All QC
                      </button>
                    )}
                  </div>
                </div>

                {/* Overall Rejection Banner if entire sub-order has a note */}
                {item.rejectionReason && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
                    <strong>Rejection Notice:</strong> {item.rejectionReason}
                    {item.rejectionComments && <span> — {item.rejectionComments}</span>}
                    {item.rejectedBy && <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 8 }}>(by {item.rejectedBy})</span>}
                  </div>
                )}

                {/* Garments Table with individual rejection and photo input */}
                <div>
                  <h4 style={{ fontSize: 13, textTransform: 'uppercase', color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 10 }}>
                    Garments In This Quality Check ({item.garmentUpdates.length || item.garments.length})
                  </h4>
                  <div style={{ border: '1px solid #f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>Garment ID</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>Item / Brand</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>Partner QC Photos</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>Partner Comments</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>QC Status</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.garmentUpdates.map((update, idx) => {
                          const garment = item.garments.find(g => g.garmentId === update.garmentId);
                          const gRejection = item.rejectedGarments?.[update.garmentId];
                          const isGarmentRejected = !!gRejection;
                          const photos = update.photos || {};

                          return (
                            <tr
                              key={update.garmentId || idx}
                              style={{
                                borderBottom: idx < item.garmentUpdates.length - 1 ? '1px solid #f1f5f9' : 'none',
                                background: isGarmentRejected ? '#fff5f5' : 'transparent',
                              }}
                            >
                              <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>
                                {update.garmentId}
                                {garment?.category && (
                                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{garment.category}</div>
                                )}
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <div><strong>{update.brand || garment?.brand || '—'}</strong></div>
                                {garment?.serviceType && <div style={{ fontSize: 11, color: '#94a3b8' }}>{garment.serviceType}</div>}
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {photos.front && (
                                    <button
                                      onClick={() => setPhotoPreview(photos.front!)}
                                      style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 8px', fontSize: 11, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                    >
                                      <ImageIcon size={12} color="#4f46e5" /> Front
                                    </button>
                                  )}
                                  {photos.back && (
                                    <button
                                      onClick={() => setPhotoPreview(photos.back!)}
                                      style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 8px', fontSize: 11, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                    >
                                      <ImageIcon size={12} color="#4f46e5" /> Back
                                    </button>
                                  )}
                                  {photos.other && (
                                    <button
                                      onClick={() => setPhotoPreview(photos.other!)}
                                      style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 8px', fontSize: 11, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                    >
                                      <ImageIcon size={12} color="#4f46e5" /> Other
                                    </button>
                                  )}
                                  {!photos.front && !photos.back && !photos.other && (
                                    <span style={{ color: '#94a3b8', fontSize: 12 }}>No photos</span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '12px 14px', color: '#475569', maxWidth: 200 }}>
                                {update.comments || '—'}
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                {isGarmentRejected ? (
                                  <div>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '3px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      <XCircle size={12} /> REJECTED
                                    </span>
                                    <div style={{ fontSize: 11, color: '#991b1b', marginTop: 4 }}>
                                      <strong>{gRejection.reason}</strong>: {gRejection.comments}
                                    </div>
                                    {gRejection.photos && gRejection.photos.length > 0 && (
                                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                        {gRejection.photos.map((p, pIdx) => (
                                          <button
                                            key={pIdx}
                                            onClick={() => setPhotoPreview(p)}
                                            style={{ border: '1px solid #fca5a5', background: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: '#dc2626', cursor: 'pointer' }}
                                          >
                                            Defect Photo {pIdx + 1}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : isApproved ? (
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <CheckCircle2 size={12} /> PASSED
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 11, color: '#d97706', background: '#fef3c7', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                                    Pending Review
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                {!isGarmentRejected && !isApproved && (
                                  <button
                                    onClick={() => openGarmentRejectModal(item, update.garmentId, garment?.category || 'Garment')}
                                    style={{
                                      padding: '5px 12px',
                                      borderRadius: 6,
                                      border: '1px solid #fca5a5',
                                      background: '#fef2f2',
                                      color: '#dc2626',
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    <XCircle size={14} /> Reject Garment
                                  </button>
                                )}
                                {isGarmentRejected && (
                                  <button
                                    onClick={() => openGarmentRejectModal(item, update.garmentId, garment?.category || 'Garment')}
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: 6,
                                      border: '1px solid #d1d5db',
                                      background: '#fff',
                                      color: '#4b5563',
                                      fontSize: 11,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Edit Notes / Photos
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Garment-wise Rejection with Comment & Photo */}
      {rejectModal.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setRejectModal({ open: false, item: null, garmentId: '', garmentName: '' })}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              width: '100%',
              maxWidth: 540,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={20} color="#dc2626" />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Reject Garment Quality Check</h3>
                  <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                    {rejectModal.garmentId} ({rejectModal.garmentName})
                  </div>
                </div>
              </div>
              <button
                onClick={() => setRejectModal({ open: false, item: null, garmentId: '', garmentName: '' })}
                style={{ background: 'none', border: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Reason Selector */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Reason for Rejection *
                </label>
                <select
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 13,
                    background: '#fff',
                  }}
                >
                  {REJECTION_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Admin Comments */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Specific Comments / Instructions for Partner *
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why this garment failed and what rework or correction is required..."
                  value={rejectionComments}
                  onChange={e => setRejectionComments(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Defect Photo URL inputs */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Defect Photo Evidence (URLs or Image Links)
                </label>
                <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
                  Attach photo links showing the stain, wrinkle, or defect so the laundry partner can review it.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rejectionPhotos.map((photo, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Camera size={16} color="#9ca3af" />
                      <input
                        type="text"
                        placeholder={`Defect Photo ${i + 1} URL (e.g. https://... or data:...)`}
                        value={photo}
                        onChange={e => {
                          const next = [...rejectionPhotos];
                          next[i] = e.target.value;
                          setRejectionPhotos(next);
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setRejectModal({ open: false, item: null, garmentId: '', garmentName: '' })}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
                onClick={handleConfirmGarmentReject}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Reject Garment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Lightbox */}
      {photoPreview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setPhotoPreview(null)}
        >
          <div style={{ maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPhotoPreview(null)}
              style={{
                position: 'absolute',
                top: -40,
                right: 0,
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: 28,
                cursor: 'pointer',
              }}
            >
              &times;
            </button>
            <img
              src={photoPreview}
              alt="QC Garment"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
              onError={(e) => {
                (e.target as any).src = 'https://via.placeholder.com/400x300?text=Photo+URL+Not+Found';
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
