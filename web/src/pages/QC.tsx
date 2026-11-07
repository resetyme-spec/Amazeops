import { useEffect, useState } from 'react';
import {
  ShieldCheck, Search, CheckCircle2, XCircle, AlertTriangle, Eye, Image as ImageIcon,
  MessageSquare, Camera, ChevronRight, Check, X, Tag, Star, Sparkles
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
  // Detailed QC Inspection Modal (QC Check Popup)
  const [viewQcModal, setViewQcModal] = useState<{
    open: boolean;
    item: QCQueueItem | null;
    garment: Garment | null;
    update: any | null;
    rejection: any | null;
    isRejected: boolean;
    isPassed: boolean;
    isPending: boolean;
  }>({
    open: false,
    item: null,
    garment: null,
    update: null,
    rejection: null,
    isRejected: false,
    isPassed: false,
    isPending: false,
  });

  const openViewQcModal = (
    item: QCQueueItem,
    garment: Garment,
    update: any,
    rejection: any,
    isRejected: boolean,
    isPassed: boolean,
    isPending: boolean
  ) => {
    setViewQcModal({
      open: true,
      item,
      garment,
      update,
      rejection,
      isRejected,
      isPassed,
      isPending,
    });
  };

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

  const tierColor: Record<string, string> = {
  SIGNATURE: '#d97706',
  GOLD: '#d97706',
  PRISTINE: '#ea580c',
  ORANGE: '#ea580c',
  YELLOW: '#ea580c',
  PREMIUM: '#2563eb',
  BLUE: '#2563eb',
};
const tierBg: Record<string, string> = {
  SIGNATURE: '#fef3c7',
  GOLD: '#fef3c7',
  PRISTINE: '#ffedd5',
  ORANGE: '#ffedd5',
  YELLOW: '#ffedd5',
  PREMIUM: '#eff6ff',
  BLUE: '#eff6ff',
};

const QUALITY_LABELS: Record<number, string> = {
  5: '5/5 — Excellent (Like New)',
  4: '4/5 — Good (Minimal Wear)',
  3: '3/5 — Fair (Normal Wear)',
  2: '2/5 — Average (Minor Fading / Pilling)',
  1: '1/5 — Heavy Wear / Aged Fabric'
};

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

  // Pass Individual Garment QC
  const handlePassGarmentQC = async (item: QCQueueItem, garmentId: string) => {
    setSubmitting(true);
    const actorName = user?.name || 'Admin';
    const nowIso = new Date().toISOString();

    try {
      // 1. Update parent order's garments array
      let allOrderPassed = false;
      let orderGarments: any[] = [];
      try {
        const orderRef = doc(db, 'orders', item.orderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const oData = orderSnap.data();
          orderGarments = (oData.garments || []).map((gm: any) => {
            if (gm.garmentId === garmentId) {
              const clone = { ...gm, status: 'QC_PASSED', qcStatus: 'QC_PASSED' };
              delete clone.qcRejection;
              return clone;
            }
            return gm;
          });

          allOrderPassed = orderGarments.length > 0 && orderGarments.every((gm: any) => gm.qcStatus === 'QC_PASSED' || gm.status === 'QC_PASSED');
          const hasAnyRejected = orderGarments.some((gm: any) => gm.qcStatus === 'QC_REJECTED' || !!gm.qcRejection);

          const updatePayload: any = { garments: orderGarments };
          if (allOrderPassed && !hasAnyRejected) {
            updatePayload.status = 'COMPLETED';
            updatePayload.qcStatus = 'QC_APPROVED';
            updatePayload.approvedAt = nowIso;
            updatePayload.approvedBy = actorName;
          }
          await updateDoc(orderRef, updatePayload);
        }
      } catch (e) {
        console.warn('Error updating order garments:', e);
      }

      // 2. Check if all garments for THIS sub-order / QC item are passed
      const itemGarments = item.garments || [];
      const isSubOrderComplete = itemGarments.length > 0 && itemGarments.every(g => {
        if (g.garmentId === garmentId) return true;
        const found = orderGarments.find((og: any) => og.garmentId === g.garmentId);
        return found ? (found.qcStatus === 'QC_PASSED' || found.status === 'QC_PASSED') : (g.status === 'QC_PASSED');
      });

      // 3. Update qcRecords doc
      const qcRef = doc(db, 'qcRecords', item.id);
      const updatedRejected = { ...(item.rejectedGarments || {}) };
      delete updatedRejected[garmentId];

      const qcUpdatePayload: any = {
        rejectedGarments: updatedRejected,
        updatedAt: nowIso,
      };
      if (isSubOrderComplete) {
        qcUpdatePayload.status = 'QC_APPROVED';
        qcUpdatePayload.approvedAt = nowIso;
        qcUpdatePayload.approvedBy = actorName;
      }
      await updateDoc(qcRef, qcUpdatePayload);

      // 4. Update subOrders doc
      try {
        const subSnap = await getDocs(collection(db, 'subOrders'));
        const targetSub = subSnap.docs.find(d => {
          const dData = d.data();
          return (d.id === item.subOrderId || d.id === item.orderId || dData.orderId === item.orderId) &&
            (dData.garmentIds || []).includes(garmentId);
        });
        if (targetSub && isSubOrderComplete) {
          await updateDoc(targetSub.ref, {
            status: 'COMPLETED',
            qcStatus: 'QC_APPROVED',
            approvedAt: nowIso,
            approvedBy: actorName,
            updatedAt: nowIso,
          });
        }
      } catch (e) {
        console.warn('Error updating subOrder:', e);
      }

      // 5. Recalculate parent order status if not all passed
      if (!allOrderPassed) {
        try {
          const subSnap = await getDocs(collection(db, 'subOrders'));
          const orderSubs = subSnap.docs
            .filter(d => d.data().orderId === item.orderId || d.data().mainOrderNumber === item.orderNumber)
            .map(d => ({ id: d.id, ...d.data() }));

          if (orderSubs.length > 0) {
            const statuses = orderSubs.map((s: any) => (s.id === item.subOrderId && isSubOrderComplete) ? 'COMPLETED' : String(s.status || '').toUpperCase());
            const hasQcPending = statuses.some(st => st === 'QC_PENDING' || st === 'QC_SENT');
            const hasQcRejected = statuses.some(st => st === 'QC_REJECTED');
            const allSubsComplete = statuses.every(st => ['COMPLETED', 'QC_APPROVED'].includes(st));

            let newOverallStatus = 'IN_PROCESS';
            if (allSubsComplete) newOverallStatus = 'COMPLETED';
            else if (hasQcRejected) newOverallStatus = 'QC_REJECTED';
            else if (hasQcPending) newOverallStatus = 'QC_PENDING';
            else if (statuses.every(st => st === 'ASSIGNED')) newOverallStatus = 'ASSIGNED';

            const parentUpdate: any = { status: newOverallStatus };
            if (!hasQcPending) parentUpdate.qcStatus = null;
            await updateDoc(doc(db, 'orders', item.orderId), parentUpdate);
          }
        } catch (e) {
          console.warn('Error recalculating parent order status:', e);
        }
      }

      setViewQcModal({ open: false, item: null, garment: null, update: null, rejection: null, isRejected: false, isPassed: false, isPending: false });
      await loadQCQueue();
    } catch (err: any) {
      console.error('Failed to pass garment QC:', err);
      alert('Failed to pass garment QC: ' + (err.message || String(err)));
    } finally {
      setSubmitting(false);
    }
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
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: 8 }}>
                      Individual Inspection Required
                    </span>
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
                                <button
                                  onClick={() => openViewQcModal(
                                    item,
                                    (garment || { garmentId: update.garmentId, category: '', brand: update.brand || '', serviceType: '' }) as any,
                                    update,
                                    gRejection,
                                    isGarmentRejected,
                                    isApproved || (garment as any)?.qcStatus === 'QC_PASSED',
                                    !isGarmentRejected && !isApproved && (garment as any)?.qcStatus !== 'QC_PASSED'
                                  )}
                                  style={{
                                    padding: '6px 14px',
                                    borderRadius: 6,
                                    border: isGarmentRejected ? '1.5px solid #fca5a5' : isApproved ? '1.5px solid #86efac' : '1.5px solid #3b82f6',
                                    background: isGarmentRejected ? '#fef2f2' : isApproved ? '#f0fdf4' : '#eff6ff',
                                    color: isGarmentRejected ? '#dc2626' : isApproved ? '#16a34a' : '#1d4ed8',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    boxShadow: '0 1px 2px rgba(59,130,246,0.1)',
                                  }}
                                >
                                  <Eye size={14} /> QC Check
                                </button>
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

      {/* MODAL: Detailed QC Inspection Details (QC Check Dialog) */}
      {viewQcModal.open && viewQcModal.garment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setViewQcModal({ open: false, item: null, garment: null, update: null, rejection: null, isRejected: false, isPassed: false, isPending: false })}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              width: '100%',
              maxWidth: 720,
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const g = viewQcModal.garment;
              const upd = viewQcModal.update || {};
              const rawCat = (g.category || viewQcModal.item?.careCategory || 'PREMIUM').toUpperCase();
              const c = rawCat.includes('SIGNATURE') || rawCat === 'GOLD' ? 'SIGNATURE' : rawCat.includes('PRISTINE') || rawCat === 'ORANGE' || rawCat === 'YELLOW' ? 'PRISTINE' : 'PREMIUM';
              const mLabel = c === 'SIGNATURE' ? 'Signature' : c === 'PRISTINE' ? 'Pristine' : 'Premium';
              const mColor = tierColor[c] || '#2563eb';
              const brand = upd.brand || g.brand || '—';
              const quality = typeof upd.quality === 'number' ? upd.quality : 5;
              const stains: string[] = Array.isArray(upd.stains) ? upd.stains : (upd.stain ? [upd.stain] : (upd.stainTypes || []));
              const comments = upd.comments || '';
              const photos = upd.photos || {};
              const photoSlots = [
                { slot: 'front', label: '1. Front Photo', url: photos.front },
                { slot: 'back', label: '2. Back Photo', url: photos.back },
                { slot: 'other', label: '3. Other Photo', url: photos.other },
              ];
              const rejection = viewQcModal.rejection;

              return (
                <>
                  {/* Header */}
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Eye size={20} color="#2563eb" />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
                            QC Inspection Details — {mLabel}
                          </h3>
                          {viewQcModal.isPassed ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <CheckCircle2 size={12} /> PASSED
                            </span>
                          ) : viewQcModal.isRejected ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <XCircle size={12} /> REJECTED
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: 6 }}>
                              PENDING REVIEW
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, fontFamily: 'monospace' }}>
                          ID: {g.garmentId} {(g as any).qrCode ? `· QR: ${(g as any).qrCode}` : ''}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewQcModal({ open: false, item: null, garment: null, update: null, rejection: null, isRejected: false, isPassed: false, isPending: false })}
                      style={{ background: 'none', border: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer', padding: 4 }}
                    >
                      &times;
                    </button>
                  </div>

                  {/* Scrollable Body */}
                  <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Meta details bar */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Care Category</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: mColor }}>{mLabel}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Service</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{g.serviceType || 'Dry clean'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Brand</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{brand || '—'}</div>
                      </div>
                    </div>

                    {/* Quality of Garment & Stains Section */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                          <Star size={15} color="#f59e0b" fill="#f59e0b" /> Quality of Garment
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 16, color: '#f59e0b', letterSpacing: 2 }}>
                            {'⭐'.repeat(Math.max(1, Math.min(5, quality)))}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>
                            {QUALITY_LABELS[quality] || `${quality}/5`}
                          </span>
                        </div>
                      </div>

                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                          <Sparkles size={15} color="#d97706" /> Stain Types Identified
                        </div>
                        {stains.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {stains.map((s: string, sIdx: number) => (
                              <span key={sIdx} style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>
                                {s}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>None specified</span>
                        )}
                      </div>
                    </div>

                    {/* Partner QC Comments */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        <MessageSquare size={15} color="#475569" /> Partner QC Notes & Comments
                      </div>
                      {comments ? (
                        <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                          "{comments}"
                        </div>
                      ) : (
                        <div style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>
                          No comments submitted by partner.
                        </div>
                      )}
                    </div>

                    {/* Uploaded Photos Section */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#111827' }}>
                          <Camera size={16} color="#2563eb" /> Uploaded QC Photos ({photoSlots.filter(p => p.url).length} / 3)
                        </div>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>Click any photo to enlarge</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        {photoSlots.map(({ slot, label, url }) => (
                          <div
                            key={slot}
                            style={{
                              background: '#f8fafc',
                              border: url ? '1.5px solid #cbd5e1' : '1px dashed #cbd5e1',
                              borderRadius: 8,
                              padding: 10,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              position: 'relative',
                            }}
                          >
                            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{label}</span>
                              {url && url.includes('amazonaws.com') && (
                                <span style={{ fontSize: 9, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 4px', borderRadius: 4, fontWeight: 700 }}>
                                  ☁️ S3
                                </span>
                              )}
                            </div>

                            {url ? (
                              <div
                                onClick={() => setPhotoPreview(url)}
                                style={{
                                  width: '100%',
                                  height: 140,
                                  borderRadius: 6,
                                  overflow: 'hidden',
                                  cursor: 'pointer',
                                  position: 'relative',
                                  background: '#000',
                                }}
                              >
                                <img
                                  src={url}
                                  alt={label}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                <div style={{
                                  position: 'absolute',
                                  inset: 0,
                                  background: 'rgba(0,0,0,0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#fff',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  gap: 4
                                }}>
                                  <Eye size={14} /> View
                                </div>
                              </div>
                            ) : (
                              <div style={{
                                width: '100%',
                                height: 140,
                                borderRadius: 6,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                color: '#94a3b8',
                                background: '#f1f5f9'
                              }}>
                                <ImageIcon size={28} />
                                <span style={{ fontSize: 11, fontStyle: 'italic' }}>Not uploaded</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Existing Rejection Details Callout */}
                    {rejection && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                          <XCircle size={15} /> Current Rejection Feedback
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>
                          Reason: {rejection.reason || 'Defect Identified'}
                        </div>
                        {rejection.comments && (
                          <div style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 6 }}>
                            <strong>Admin Note:</strong> {rejection.comments}
                          </div>
                        )}
                        {rejection.photos && rejection.photos.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                            {rejection.photos.map((pUrl: string, pIdx: number) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => setPhotoPreview(pUrl)}
                                style={{ border: '1px solid #fca5a5', background: '#fff', borderRadius: 4, padding: '3px 8px', fontSize: 11, color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <Camera size={12} /> Defect Photo {pIdx + 1}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Modal Footer with Actions */}
                  <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setViewQcModal({ open: false, item: null, garment: null, update: null, rejection: null, isRejected: false, isPassed: false, isPending: false })}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        fontSize: 13,
                        fontWeight: 500,
                        color: '#374151',
                        cursor: 'pointer',
                      }}
                    >
                      Close
                    </button>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const targetItem = viewQcModal.item;
                          const targetGarmentId = g.garmentId;
                          const targetCategory = g.category || 'Garment';
                          setViewQcModal({ open: false, item: null, garment: null, update: null, rejection: null, isRejected: false, isPassed: false, isPending: false });
                          if (targetItem) {
                            openGarmentRejectModal(targetItem, targetGarmentId, targetCategory);
                          }
                        }}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 6,
                          border: '1px solid #fca5a5',
                          background: '#fef2f2',
                          color: '#dc2626',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <XCircle size={15} /> {viewQcModal.isRejected ? 'Edit Rejection' : 'Reject QC'}
                      </button>

                      {!viewQcModal.isPassed && (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={async () => {
                            if (viewQcModal.item) {
                              await handlePassGarmentQC(viewQcModal.item, g.garmentId);
                            }
                          }}
                          style={{
                            padding: '8px 18px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#16a34a',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: '0 2px 4px rgba(22,163,74,0.2)',
                            opacity: submitting ? 0.7 : 1,
                          }}
                        >
                          <CheckCircle2 size={15} /> {submitting ? 'Passing...' : 'Pass QC'}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
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
