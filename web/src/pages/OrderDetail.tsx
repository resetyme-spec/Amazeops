import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Settings, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Image as ImageIcon, Camera, Upload, X, MessageSquare, Eye, Tag, Truck,
  Star, Droplets, Check, Clock, Sparkles, MapPin, Building2, Phone, Navigation
} from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { fetchOrderById, pushSplitOrdersToApi } from '../lib/api';
import { db } from '../lib/firebase';
import { collection, doc, getDocs, setDoc, updateDoc, getDoc, query, where } from 'firebase/firestore';
import type { Order, Partner, SubOrder, Garment, QCRecord } from '../types';
import { assignGarmentsToPartners, getDistanceKm, getPartnerCoordinates, parseCoordinates } from '../lib/assignment';
import { useAuth } from '../contexts/AuthContext';

// Care Categories: Signature (Gold), Pristine (Orange), Premium (Blue)
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

const REJECTION_REASONS = [
  'Stain not removed',
  'Wrinkles / Poor Pressing',
  'Fabric Damage / Tear',
  'Color Bleeding / Mismatch',
  'Odor / Improper Washing',
  'Incorrect Packaging / Missing Label',
  'Other Issue'
];

const QUALITY_LABELS: Record<number, string> = {
  5: '5/5 — Excellent (Like New)',
  4: '4/5 — Good (Minimal Wear)',
  3: '3/5 — Fair (Normal Wear)',
  2: '2/5 — Average (Minor Fading / Pilling)',
  1: '1/5 — Heavy Wear / Aged Fabric'
};

function careBadge(cat?: string): React.ReactNode {
  const raw = (cat || 'PREMIUM').toUpperCase();
  const c = raw.includes('SIGNATURE') || raw === 'GOLD' ? 'SIGNATURE' : raw.includes('PRISTINE') || raw === 'ORANGE' || raw === 'YELLOW' ? 'PRISTINE' : 'PREMIUM';
  const icon = c === 'SIGNATURE' ? '👑' : c === 'PRISTINE' ? '✨' : '💎';
  const label = c === 'SIGNATURE' ? 'Signature' : c === 'PRISTINE' ? 'Pristine' : 'Premium';
  const color = tierColor[c];
  const bg = tierBg[c];
  const border = c === 'SIGNATURE' ? '#fde68a' : c === 'PRISTINE' ? '#fed7aa' : '#bfdbfe';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: bg, color, border: `1px solid ${border}`, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, letterSpacing: '0.02em' }}>
      {icon} {label}
    </span>
  );
}

function customerLabel(name: string, category: string): React.ReactNode {
  const c = (category || '').toLowerCase();
  if (c === "l'amaze prime") return <span style={{ color: '#d97706', fontWeight: 600 }}>* {name}</span>;
  if (c === 'signature') return <span style={{ color: '#d97706', fontWeight: 600 }}>{name}</span>;
  if (c === 'regular') return <span style={{ color: '#9ca3af' }}>{name}</span>;
  return <span>{name}</span>;
}

function getBadgeInfo(status: string) {
  const s = (status || '').toUpperCase();
  if (s === 'READY_FOR_DELIVERY') return { label: 'READY TO DELIVER', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
  if (s === 'QC_APPROVED') return { label: 'QC APPROVED', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
  if (s === 'QC_PENDING' || s === 'QC_SENT') return { label: 'QC PENDING', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
  if (s === 'QC_REJECTED') return { label: 'QC REJECTED', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
  if (s === 'IN_PROCESS') return { label: 'IN PROGRESS', bg: '#fefce8', color: '#ca8a04', border: '#fef08a' };
  if (s === 'ASSIGNED') return { label: 'ASSIGNED', bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' };
  if (s === 'COMPLETED' || s === 'DELIVERED') return { label: s, bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
  if (s === 'REJECTED' || s === 'CANCELLED') return { label: s, bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
  return { label: s || 'RECEIVED', bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' };
}

interface TimelineStep {
  id: string;
  stepNum: number;
  title: string;
  description: string;
  timeframe?: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'REJECTED' | 'PENDING';
  badgeText?: string;
}

function formatTimeFrame(ts?: string | Date | null): string {
  if (!ts) return '';
  try {
    const d = typeof ts === 'string' ? new Date(ts) : ts;
    if (isNaN(d.getTime())) return '';
    const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${day}, ${time}`;
  } catch {
    return '';
  }
}

function buildPartnerTimeline(so: SubOrder, order: Order, qcRecord?: any): TimelineStep[] {
  const soStatus = (so.status || '').toUpperCase();
  const isDelivered = soStatus === 'DELIVERED' || soStatus === 'COMPLETED';
  const isReady = isDelivered || soStatus === 'READY_FOR_DELIVERY' || (so as any).deliveryStatus === 'READY_FOR_DELIVERY';
  const isQcApproved = isReady || soStatus === 'QC_APPROVED' || (so as any).qcStatus === 'QC_APPROVED' || qcRecord?.status === 'QC_APPROVED';
  const isQcRejected = soStatus === 'QC_REJECTED' || (so as any).qcStatus === 'QC_REJECTED' || qcRecord?.status === 'QC_REJECTED';
  const isQcSubmitted = isQcApproved || isQcRejected || soStatus === 'QC_PENDING' || soStatus === 'QC_SENT' || !!(so as any)?.qcSubmittedAt || (qcRecord && (qcRecord.subOrderId === so.id || qcRecord.orderId === so.id));
  const isInProcess = isQcSubmitted || soStatus === 'IN_PROCESS' || !!(so as any)?.acceptedAt;

  const fmt = (ts?: string | Date | null) => formatTimeFrame(ts);
  const assignedTime = so.createdAt || order.createdAt;
  const acceptedTime = (so as any)?.acceptedAt || (isInProcess ? so.updatedAt : null);
  const qcSubmittedTime = qcRecord?.submittedAt || (so as any)?.qcSubmittedAt || (isQcSubmitted ? so.updatedAt : null);
  const qcApprovedTime = qcRecord?.approvedAt || (isQcApproved ? so.updatedAt : (isQcRejected ? qcRecord?.rejectedAt || so.updatedAt : null));
  const readyTime = (so as any)?.deliveryInitiatedAt || (isReady ? so.updatedAt : null);
  const deliveredTime = (so as any)?.deliveredAt || (isDelivered ? so.updatedAt : null);

  return [
    {
      id: 'assigned',
      stepNum: 1,
      title: 'Assigned',
      description: `${so.partnerName || 'Partner'} (${so.partnerCode})`,
      timeframe: fmt(assignedTime),
      status: 'COMPLETED',
      badgeText: 'Done',
    },
    {
      id: 'in_process',
      stepNum: 2,
      title: 'Accepted & Processing',
      description: isInProcess ? 'Garments in processing' : 'Partner to accept order',
      timeframe: isInProcess ? fmt(acceptedTime) : undefined,
      status: (isQcSubmitted || isQcApproved || isReady || isDelivered) ? 'COMPLETED' : isInProcess ? 'IN_PROGRESS' : 'PENDING',
      badgeText: (isQcSubmitted || isQcApproved || isReady || isDelivered) ? 'Done' : isInProcess ? 'In Progress' : 'Pending',
    },
    {
      id: 'qc_submitted',
      stepNum: 3,
      title: 'QC Submitted',
      description: isQcSubmitted ? 'Inspection submitted' : 'Pending inspection',
      timeframe: isQcSubmitted ? fmt(qcSubmittedTime) : undefined,
      status: (isQcApproved || isReady || isDelivered) ? 'COMPLETED' : isQcSubmitted ? 'IN_PROGRESS' : 'PENDING',
      badgeText: (isQcApproved || isReady || isDelivered) ? 'Done' : isQcSubmitted ? 'Under Review' : 'Pending',
    },
    {
      id: 'qc_verified',
      stepNum: 4,
      title: isQcRejected ? 'QC Rejected' : isQcApproved ? 'QC Approved' : 'QC Verified',
      description: isQcRejected ? 'Defects found' : isQcApproved ? 'Approved' : 'Admin verification',
      timeframe: (isQcApproved || isQcRejected) ? fmt(qcApprovedTime) : undefined,
      status: isQcRejected ? 'REJECTED' : isQcApproved ? 'COMPLETED' : isQcSubmitted ? 'IN_PROGRESS' : 'PENDING',
      badgeText: isQcRejected ? 'Rejected' : isQcApproved ? 'Approved' : isQcSubmitted ? 'Reviewing' : 'Pending',
    },
    {
      id: 'ready_delivery',
      stepNum: 5,
      title: 'Ready to Deliver',
      description: isReady ? 'Packed & ready' : 'Pending QC',
      timeframe: isReady ? fmt(readyTime) : undefined,
      status: isDelivered ? 'COMPLETED' : isReady ? 'IN_PROGRESS' : 'PENDING',
      badgeText: isDelivered ? 'Done' : isReady ? 'Ready' : 'Pending',
    },
    {
      id: 'delivered',
      stepNum: 6,
      title: 'Delivered',
      description: isDelivered ? 'Delivered' : 'Pending',
      timeframe: isDelivered ? fmt(deliveredTime) : undefined,
      status: isDelivered ? 'COMPLETED' : 'PENDING',
      badgeText: isDelivered ? 'Delivered' : 'Pending',
    },
  ];
}

export function isGarmentReassigned(g: any): boolean {
  if (!g) return false;
  return g.isReassigned === true || g.criticalStatus === 'REASSIGNED' || !!g.adminCriticalComment;
}

export function isGarmentCritical(g: any): boolean {
  if (!g) return false;
  return g.isCritical === true && !isGarmentReassigned(g);
}

export default function OrderDetail() {
  const { user } = useAuth();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [subOrders, setSubOrders] = useState<SubOrder[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [qcRecords, setQcRecords] = useState<Array<QCRecord & { id: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  // SubOrder View Modal
  const [viewModal, setViewModal] = useState<{ open: boolean; subOrder: SubOrder | null; garments: Garment[] }>({
    open: false,
    subOrder: null,
    garments: []
  });

  // SubOrder Rejection Details Modal (legacy)
  const [rejectModal, setRejectModal] = useState<{ open: boolean; subOrder: SubOrder | null }>({
    open: false,
    subOrder: null
  });

  // Garment-wise QC Rejection Modal
  const [rejectGarmentModal, setRejectGarmentModal] = useState<{
    open: boolean;
    garment: Garment | null;
    qcRecordId?: string;
  }>({
    open: false,
    garment: null
  });

  const [rejectionReason, setRejectionReason] = useState('Stain not removed');
  const [rejectionComments, setRejectionComments] = useState('');
  const [rejectionPhotos, setRejectionPhotos] = useState<string[]>(['', '', '']);
  const [submittingReject, setSubmittingReject] = useState(false);

  // Garment QC Inspection & Verification Modal (Dialog Box)
  const [viewQcModal, setViewQcModal] = useState<{
    open: boolean;
    garment: Garment | null;
    gUpdate: any | null;
    rejection: any | null;
    isRejected: boolean;
    isPassed: boolean;
    isPending: boolean;
  }>({
    open: false,
    garment: null,
    gUpdate: null,
    rejection: null,
    isRejected: false,
    isPassed: false,
    isPending: false,
  });

  function openViewQcModal(
    g: Garment,
    gUpdate: any,
    gRej: any,
    isRejected: boolean,
    isPassed: boolean,
    isPending: boolean
  ) {
    setViewQcModal({
      open: true,
      garment: g,
      gUpdate: gUpdate || null,
      rejection: gRej || null,
      isRejected,
      isPassed,
      isPending,
    });
  }

  // Critical Garment Review & Reassign Modal
  const [criticalModal, setCriticalModal] = useState<{
    open: boolean;
    garment: Garment | null;
    subOrder: SubOrder | null;
  }>({
    open: false,
    garment: null,
    subOrder: null,
  });
  const [criticalComment, setCriticalComment] = useState('');
  const [targetPartnerId, setTargetPartnerId] = useState('');
  const [submittingCritical, setSubmittingCritical] = useState(false);

  function openCriticalModal(garment: Garment, subOrderParam?: SubOrder | null) {
    const parentSub = subOrderParam || subOrders.find(s => (s.garmentIds || []).includes(garment.garmentId)) || null;
    setCriticalComment(garment.adminCriticalComment || '');
    setTargetPartnerId(parentSub?.partnerId || garment.assignedPartnerId || (partners[0]?.id || ''));
    setCriticalModal({ open: true, garment, subOrder: parentSub });
  }

  async function handleSaveCritical() {
    if (!criticalModal.garment || !order) return;
    if (!criticalComment.trim()) {
      alert('Please enter instructions / comments for the partner.');
      return;
    }
    const garmentId = criticalModal.garment.garmentId;
    const parentOrderId = (order.id || order.orderId || orderId) as string;

    setSubmittingCritical(true);
    try {
      const parentRef = doc(db, 'orders', parentOrderId);
      const snap = await getDoc(parentRef);
      if (!snap.exists()) throw new Error('Order not found in database');
      const orderData = snap.data() as Order;

      const curSub = criticalModal.subOrder;
      const targetPartner = partners.find(p => p.id === targetPartnerId);
      const isPartnerChanged = curSub && targetPartner && targetPartner.id !== curSub.partnerId;
      const now = new Date().toISOString();
      const adminName = user?.name || 'Admin';

      // Update garment inside parent order:
      // Once admin instructs & reassigns, it is marked as REASSIGNED and NOT CRITICAL
      const updatedGarments = (orderData.garments || []).map(g => {
        if (g.garmentId === garmentId) {
          return {
            ...g,
            isCritical: false, // Explicitly no longer critical
            wasCritical: true, // Keep historical reference
            criticalResolved: true,
            isReassigned: true,
            criticalStatus: 'REASSIGNED',
            adminCriticalComment: criticalComment.trim(),
            adminCriticalCommentAt: now,
            adminCriticalCommentBy: adminName,
            reassignedAt: now,
            reassignedBy: adminName,
            assignedPartnerId: targetPartner?.id || curSub?.partnerId,
            assignedPartnerName: targetPartner?.companyName || curSub?.partnerName,
          };
        }
        return g;
      });

      await setDoc(parentRef, { ...orderData, garments: updatedGarments }, { merge: true });

      // Resolve matching docs in criticalCases collection
      try {
        const critSnap = await getDocs(query(collection(db, 'criticalCases'), where('garmentId', '==', garmentId)));
        for (const cDoc of critSnap.docs) {
          await setDoc(doc(db, 'criticalCases', cDoc.id), {
            status: 'RESOLVED',
            resolvedAt: now,
            resolvedBy: adminName,
            resolution: `Reassigned with admin instructions to ${targetPartner?.companyName || curSub?.partnerName || 'partner'}`,
          }, { merge: true });
        }
      } catch (e) {
        // non-blocking
      }

      // Handle reassignment in subOrders collection if partner changed
      if (isPartnerChanged && curSub && targetPartner) {
        const remainingGarmentIds = (curSub.garmentIds || []).filter(gid => gid !== garmentId);
        if (remainingGarmentIds.length === 0) {
          await setDoc(doc(db, 'subOrders', curSub.id), {
            ...curSub,
            partnerId: targetPartner.id,
            partnerCode: targetPartner.partnerCode,
            partnerName: targetPartner.companyName,
            garmentIds: [garmentId],
            status: 'ASSIGNED',
            updatedAt: now,
          }, { merge: true });
        } else {
          await setDoc(doc(db, 'subOrders', curSub.id), {
            ...curSub,
            garmentIds: remainingGarmentIds,
            updatedAt: now,
          }, { merge: true });

          const targetSubSnap = await getDocs(query(
            collection(db, 'subOrders'),
            where('orderId', '==', parentOrderId),
            where('partnerId', '==', targetPartner.id)
          ));

          if (!targetSubSnap.empty) {
            const targetDoc = targetSubSnap.docs[0];
            const targetData = targetDoc.data() as SubOrder;
            const mergedGids = Array.from(new Set([...(targetData.garmentIds || []), garmentId]));
            await setDoc(doc(db, 'subOrders', targetDoc.id), {
              ...targetData,
              garmentIds: mergedGids,
              updatedAt: now,
            }, { merge: true });
          } else {
            const newSubRef = doc(collection(db, 'subOrders'));
            await setDoc(newSubRef, {
              id: newSubRef.id,
              orderId: parentOrderId,
              subOrderCode: `${orderData.orderNumber || parentOrderId}-S${Date.now().toString().slice(-4)}`,
              partnerId: targetPartner.id,
              partnerCode: targetPartner.partnerCode,
              partnerName: targetPartner.companyName,
              garmentCategory: criticalModal.garment.garmentCategory || 'GOLD',
              garmentIds: [garmentId],
              status: 'ASSIGNED',
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      } else if (!isPartnerChanged && curSub) {
        try {
          await setDoc(doc(db, 'subOrders', curSub.id), {
            ...curSub,
            updatedAt: now,
          }, { merge: true });
        } catch (e) {}
      }

      setOrder({ ...orderData, garments: updatedGarments });
      setCriticalModal({ open: false, garment: null, subOrder: null });
      alert('Garment instructions saved and reassigned successfully!');
      window.location.reload();
    } catch (err: any) {
      console.error('Failed to save critical comment / reassign:', err);
      alert('Failed to update: ' + (err.message || String(err)));
    } finally {
      setSubmittingCritical(false);
    }
  }

  // Lightbox Photo Preview Modal
  const [photoPreview, setPhotoPreview] = useState<{ url: string; title: string } | null>(null);

  const initRef = useRef(false);

  const loadQCRecords = async (orderIdStr: string, subs: SubOrder[]) => {
    try {
      const matchedRecords: Array<QCRecord & { id: string }> = [];
      const seenIds = new Set<string>();

      // 1. Direct query by orderId
      try {
        const qByOrder = query(collection(db, 'qcRecords'), where('orderId', '==', orderIdStr));
        const snap = await getDocs(qByOrder);
        snap.docs.forEach(d => {
          if (!seenIds.has(d.id)) {
            seenIds.add(d.id);
            matchedRecords.push({ id: d.id, ...(d.data() as any) });
          }
        });
      } catch (e) {
        console.warn('[OrderDetail] Error querying qcRecords by orderId:', e);
      }

      // 2. Query by subOrderIds
      const subIds = (subs || []).map(s => s.id).filter(Boolean);
      for (const sId of subIds) {
        try {
          const qBySub = query(collection(db, 'qcRecords'), where('subOrderId', '==', sId));
          const snapSub = await getDocs(qBySub);
          snapSub.docs.forEach(d => {
            if (!seenIds.has(d.id)) {
              seenIds.add(d.id);
              matchedRecords.push({ id: d.id, ...(d.data() as any) });
            }
          });
        } catch (e) {}
      }

      // 3. Fallback: collection scan if targeted query was empty
      if (matchedRecords.length === 0) {
        try {
          const qcSnap = await getDocs(collection(db, 'qcRecords'));
          qcSnap.docs.forEach(d => {
            const data = d.data() as any;
            if (
              data.orderId === orderIdStr ||
              subs.some(so => so.id === data.orderId || so.id === data.subOrderId) ||
              (data.subOrderId && subs.some(so => so.id === data.subOrderId))
            ) {
              if (!seenIds.has(d.id)) {
                seenIds.add(d.id);
                matchedRecords.push({ id: d.id, ...data });
              }
            }
          });
        } catch (e) {}
      }

      setQcRecords(matchedRecords);
    } catch (err) {
      console.warn('[OrderDetail] Error loading QC records:', err);
    }
  };

  useEffect(() => {
    const configured = true;
    setApiConfigured(true);
    if (configured && orderId) {
      // Load from Firestore first — supports both order IDs and sub-order IDs
      (async () => {
        try {
          let fbSnap = null;
          try {
            fbSnap = await getDoc(doc(db, 'orders', orderId));
          } catch {}

          if (!fbSnap || !fbSnap.exists()) {
            try {
              const subSnap = await getDoc(doc(db, 'subOrders', orderId));
              if (subSnap.exists()) {
                const subData = subSnap.data();
                if (subData.orderId) {
                  fbSnap = await getDoc(doc(db, 'orders', subData.orderId));
                  if (fbSnap && fbSnap.exists()) {
                    const parentId = fbSnap.id;
                    navigate(`/orders/${parentId}`, { replace: true });
                    return;
                  }
                }
              }
            } catch {}
          }

          let fbData: any = null;
          if (fbSnap && fbSnap.exists()) {
            fbData = fbSnap.data();
            setOrder({ id: orderId, ...fbData } as Order);
            loadQCRecords(orderId, []);
          }

          fetchOrderById(orderId).then(apiOrder => {
            if (apiOrder) {
              const mergedGarments = (apiOrder.garments || []).map((ag: any) => {
                const fbG = (fbData?.garments || []).find((g: any) => g.garmentId === ag.garmentId);
                return fbG ? { ...ag, ...fbG } : ag;
              });
              const mergedOrder = {
                id: orderId,
                ...apiOrder,
                ...fbData,
                status: fbData?.status || apiOrder.status,
                qcStatus: fbData?.qcStatus || apiOrder.qcStatus,
                deliveryStatus: fbData?.deliveryStatus || apiOrder.deliveryStatus,
                deliveryInitiatedAt: fbData?.deliveryInitiatedAt || apiOrder.deliveryInitiatedAt,
                deliveryInitiatedBy: fbData?.deliveryInitiatedBy || apiOrder.deliveryInitiatedBy,
                garments: mergedGarments,
                orderId
              };
              setOrder(mergedOrder);
              setDoc(doc(db, 'orders', orderId), mergedOrder, { merge: true }).catch(() => {});
            }
            setLoading(false);
          }).catch(() => setLoading(false));
        } catch {
          setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!order || initRef.current) return;
    initRef.current = true;
    setError(null);

    (async () => {
      try {
        const orderIdStr = (order.id || order.orderId) as string;
        const [partnerSnap, subSnap] = await Promise.all([
          getDocs(collection(db, 'partners')),
          getDocs(collection(db, 'subOrders')),
        ]);

        const allPartners = partnerSnap.docs.map(d => ({ id: d.id, ...d.data() } as Partner));
        const allSubs = subSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubOrder));
        const orderSubs = allSubs.filter(so => so.orderId === orderIdStr);

        setPartners(allPartners);
        setSubOrders(orderSubs);
        loadQCRecords(orderIdStr, orderSubs);

        const activePartners = allPartners.filter(p => p.active);
        if (!activePartners.length) return;

        const allGarments = (order.garments || []) as Garment[];
        const assignedIds = new Set(orderSubs.flatMap(so => so.garmentIds));
        const unassigned = allGarments.filter(g => !assignedIds.has(g.garmentId));

        if (!unassigned.length) return;

        const orderCode = order.orderNumber || order.orderId || orderId || 'ORD';
        const hubGeo = order.hub || { latitude: order.hubLatitude, longitude: order.hubLongitude };
        const assignments = assignGarmentsToPartners(orderCode, unassigned, activePartners, hubGeo);

        // Merge by partnerId — one sub-order per partner, not per category
        const partnerMap = new Map<string, typeof assignments>();
        for (const a of assignments) {
          const list = partnerMap.get(a.partnerId) || [];
          list.push(a);
          partnerMap.set(a.partnerId, list);
        }

        const now = new Date().toISOString();
        const startNum = orderSubs.length + 1;
        let subNum = startNum;

        // Also sync parent order to Firestore so partner app can access garment and hub details
        const orderRef = doc(db, 'orders', orderIdStr);
        const hubPayload = order.hub || {
          name: order.hubName || '',
          code: order.hubCode || '',
          location: order.hubLocation || '',
          latitude: order.hubLatitude ?? null,
          longitude: order.hubLongitude ?? null,
          address: order.hubAddress || '',
          phone: order.hubPhone || '',
        };
        await setDoc(orderRef, {
          id: orderIdStr,
          orderId: order.orderId || orderIdStr,
          customer: order.customer || null,
          careCategory: order.careCategory || 'Normal',
          garments: order.garments || [],
          services: order.services || [],
          createdAt: order.createdAt || now,
          hub: hubPayload,
          hubName: hubPayload.name || order.hubName || '',
          hubCode: hubPayload.code || order.hubCode || '',
          hubLocation: hubPayload.location || order.hubLocation || '',
          hubLatitude: hubPayload.latitude ?? order.hubLatitude ?? null,
          hubLongitude: hubPayload.longitude ?? order.hubLongitude ?? null,
          hubAddress: hubPayload.address || order.hubAddress || '',
          hubPhone: hubPayload.phone || order.hubPhone || '',
        }, { merge: true });

        for (const [, group] of partnerMap) {
          const first = group[0];
          const allGarmentIds = group.flatMap(a => a.garmentIds);
          const code = `${orderCode}-${first.partnerCode}-${subNum}`;
          const ref = doc(collection(db, 'subOrders'));
          await setDoc(ref, {
            id: ref.id,
            orderId: orderIdStr,
            subOrderCode: code,
            partnerId: first.partnerId,
            partnerCode: first.partnerCode,
            partnerName: first.partnerName,
            garmentCategory: group.map(g => g.garmentCategory).join(','),
            garmentIds: allGarmentIds,
            distanceKm: first.distanceKm,
            distanceFromHub: first.distanceKm != null ? `${first.distanceKm} km` : undefined,
            status: 'PENDING',
            createdAt: now,
            updatedAt: now,
          });
          subNum++;
        }

        const freshSnap = await getDocs(collection(db, 'subOrders'));
        const freshSubs = freshSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubOrder)).filter(so => so.orderId === orderIdStr);
        setSubOrders(freshSubs);
        loadQCRecords(orderIdStr, freshSubs);

        // Push split order details to external Customer App / order system
        try {
          const splitOrdersPayload = freshSubs.map(so => {
            const p = partners.find(x => x.id === so.partnerId || x.partnerCode === so.partnerCode);
            const coords = p ? getPartnerCoordinates(p) : null;
            return {
              subOrderCode: so.subOrderCode,
              partnerName: so.partnerName,
              partnerCode: so.partnerCode,
              partnerId: so.partnerId,
              status: so.status || 'ASSIGNED',
              partnerGeoLocation: coords ? { latitude: coords.lat, longitude: coords.lng } : null,
              garmentIds: so.garmentIds || [],
              garmentCount: so.garmentIds?.length || 0,
              careCategory: so.garmentCategory || '',
              distanceKm: so.distanceKm,
            };
          });
          pushSplitOrdersToApi(order.orderNumber || orderIdStr, splitOrdersPayload).catch(() => {});
        } catch (e) {
          console.warn('Failed to push split orders from OrderDetail:', e);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[OrderDetail] Fatal error:', msg);
        setError(msg);
      }
    })();
  }, [order]);

  async function handleReassign(subOrderId: string) {
    if (!order || !partners.length) return;
    try {
      const so = subOrders.find(s => s.id === subOrderId);
      if (!so) return;
      const garments = (order.garments || []).filter(g => so.garmentIds.includes(g.garmentId));
      const orderCode = order.id || order.orderId || orderId || 'ORD';
      const otherPartners = partners.filter(p => p.id !== so.partnerId);
      const hubGeo = order.hub || { latitude: order.hubLatitude, longitude: order.hubLongitude };
      const assignments = assignGarmentsToPartners(orderCode, garments, otherPartners, hubGeo);
      if (!assignments.length) { alert('No other eligible partner found.'); return; }

      const a = assignments[0];
      await updateDoc(doc(db, 'subOrders', subOrderId), {
        partnerId: a.partnerId, partnerCode: a.partnerCode,
        partnerName: a.partnerName, subOrderCode: a.subOrderCode,
        updatedAt: new Date().toISOString(),
      });
      setSubOrders(prev => prev.map(s => s.id === subOrderId ? { ...s, ...a, subOrderCode: a.subOrderCode } : s));
    } catch (e) { console.error(e); alert('Reassign failed.'); }
  }

  async function handleChangeStatus(subOrderId: string, newStatus: string) {
    const actorName = user?.name || 'Admin';
    const nowIso = new Date().toISOString();
    const orderIdStr = (order?.id || order?.orderId || orderId) as string;

    try {
      await updateDoc(doc(db, 'subOrders', subOrderId), {
        status: newStatus,
        qcStatus: newStatus === 'QC_APPROVED' ? 'QC_APPROVED' : newStatus === 'QC_REJECTED' ? 'QC_REJECTED' : undefined,
        updatedAt: nowIso,
      });

      setSubOrders(prev => prev.map(s => s.id === subOrderId ? { ...s, status: newStatus } : s));

      if (newStatus === 'QC_APPROVED') {
        const orderRef = doc(db, 'orders', orderIdStr);
        const so = subOrders.find(s => s.id === subOrderId);
        const soGarmentIds = so?.garmentIds || [];

        const updatedGarments = (order?.garments || []).map((item: any) => {
          if (soGarmentIds.length === 0 || soGarmentIds.includes(item.garmentId)) {
            const clone = { ...item, status: 'QC_PASSED', qcStatus: 'QC_PASSED' };
            delete clone.qcRejection;
            return clone;
          }
          return item;
        });

        await updateDoc(orderRef, {
          garments: updatedGarments,
          status: 'QC_APPROVED',
          qcStatus: 'QC_APPROVED',
          approvedAt: nowIso,
          approvedBy: actorName,
        });

        for (const qr of qcRecords) {
          await updateDoc(doc(db, 'qcRecords', qr.id), {
            status: 'QC_APPROVED',
            rejectedGarments: {},
            rejectionReason: '',
            rejectionComments: '',
            approvedAt: nowIso,
            approvedBy: actorName,
          });
        }

        setOrder(prev => prev ? {
          ...prev,
          garments: updatedGarments,
          status: 'QC_APPROVED',
        } : null);

        await loadQCRecords(orderIdStr, subOrders);
        alert('QC Approved! Sub-order and Order marked as QC APPROVED.');
      }
    } catch (e) { console.error(e); }
  }

  async function handleApproveSubOrderQC(so: SubOrder) {
    await handleChangeStatus(so.id, 'QC_APPROVED');
  }

  function handleRefresh() {
    initRef.current = false;
    setSubOrders([]);
    setPartners([]);
    setQcRecords([]);
    setError(null);
    if (order) {
      const orderIdStr = (order.id || order.orderId || orderId) as string;
      loadQCRecords(orderIdStr, []);
      setOrder({ ...order });
    }
  }

  // Open Garment Rejection Modal
  function openGarmentRejectModal(g: Garment) {
    const orderIdStr = (order?.id || order?.orderId || orderId) as string;
    const targetQc = qcRecords.find(qr =>
      (qr.garmentUpdates || []).some(u => u.garmentId === g.garmentId) ||
      qr.orderId === orderIdStr ||
      subOrders.some(so => so.garmentIds?.includes(g.garmentId) && (so.id === qr.orderId || so.id === qr.subOrderId))
    );

    const existingRej = g.qcRejection || targetQc?.rejectedGarments?.[g.garmentId];
    if (existingRej) {
      setRejectionReason(existingRej.reason || 'Stain not removed');
      setRejectionComments(existingRej.comments || '');
      const exPhotos = existingRej.photos || [];
      setRejectionPhotos([
        exPhotos[0] || '',
        exPhotos[1] || '',
        exPhotos[2] || '',
      ]);
    } else {
      setRejectionReason('Stain not removed');
      setRejectionComments('');
      setRejectionPhotos(['', '', '']);
    }

    setRejectGarmentModal({
      open: true,
      garment: g,
      qcRecordId: targetQc?.id,
    });
  }

  // Handle Photo File Upload
  function handlePhotoFileUpload(index: number, file: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setRejectionPhotos(prev => {
          const next = [...prev];
          next[index] = dataUrl;
          return next;
        });
      }
    };
    reader.readAsDataURL(file);
  }

  // Submit Garment-wise Rejection
  async function handleRejectGarmentSubmit() {
    if (!rejectionComments.trim()) {
      alert('Please enter a comment explaining the rejection issue.');
      return;
    }
    if (!rejectGarmentModal.garment || !order) return;

    setSubmittingReject(true);
    const g = rejectGarmentModal.garment;
    const gId = g.garmentId;
    const photos = rejectionPhotos.filter(p => p.trim());
    const actorName = user?.name || 'Admin';
    const nowIso = new Date().toISOString();
    const orderIdStr = (order.id || order.orderId || orderId) as string;

    try {
      const rejectionData = {
        reason: rejectionReason,
        comments: rejectionComments,
        photos,
        rejectedAt: nowIso,
        rejectedBy: actorName,
      };

      // 1. Update or create QC record
      const targetQcRecord = qcRecords.find(qr =>
        qr.id === rejectGarmentModal.qcRecordId ||
        (qr.garmentUpdates || []).some(u => u.garmentId === gId) ||
        qr.orderId === orderIdStr ||
        subOrders.some(so => so.garmentIds?.includes(gId) && (so.id === qr.orderId || so.id === qr.subOrderId))
      );

      if (targetQcRecord) {
        const newRejectedGarments = {
          ...(targetQcRecord.rejectedGarments || {}),
          [gId]: rejectionData,
        };
        await updateDoc(doc(db, 'qcRecords', targetQcRecord.id), {
          status: 'QC_REJECTED',
          rejectedAt: nowIso,
          rejectedBy: actorName,
          rejectionReason: `${rejectionReason} (Garment ${gId})`,
          rejectionComments: rejectionComments,
          rejectedGarments: newRejectedGarments,
        });
      } else {
        const matchingSub = subOrders.find(so => so.garmentIds?.includes(gId));
        const newQcRef = doc(collection(db, 'qcRecords'));
        await setDoc(newQcRef, {
          id: newQcRef.id,
          orderId: orderIdStr,
          subOrderId: matchingSub?.id,
          partnerId: matchingSub?.partnerId,
          status: 'QC_REJECTED',
          rejectedAt: nowIso,
          rejectedBy: actorName,
          rejectionReason: `${rejectionReason} (Garment ${gId})`,
          rejectionComments: rejectionComments,
          rejectedGarments: {
            [gId]: rejectionData,
          },
          createdAt: nowIso,
        });
      }

      // 2. Update orders/{orderId} garments array and order status
      const orderRef = doc(db, 'orders', orderIdStr);
      const updatedGarments = (order.garments || []).map((item: any) => {
        if (item.garmentId === gId) {
          return {
            ...item,
            status: 'QC_REJECTED',
            qcStatus: 'QC_REJECTED',
            qcRejection: rejectionData,
          };
        }
        return item;
      });

      await updateDoc(orderRef, {
        garments: updatedGarments,
        status: 'QC_REJECTED',
        rejectionReason: `${rejectionReason} (Garment ${gId})`,
        rejectionComments,
        rejectedAt: nowIso,
        rejectedBy: actorName,
      });

      // 3. Update the matching subOrder status to QC_REJECTED
      const matchingSub = subOrders.find(so => so.garmentIds?.includes(gId));
      if (matchingSub) {
        await updateDoc(doc(db, 'subOrders', matchingSub.id), {
          status: 'QC_REJECTED',
          rejectionReason: `${rejectionReason} (Garment ${gId})`,
          rejectionComments,
          rejectedAt: nowIso,
          rejectedBy: actorName,
          updatedAt: nowIso,
        });
      }

      // 4. Update local state
      setOrder(prev => prev ? {
        ...prev,
        garments: updatedGarments,
        status: 'QC_REJECTED',
      } : null);

      setSubOrders(prev => prev.map(s =>
        s.garmentIds?.includes(gId)
          ? {
              ...s,
              status: 'QC_REJECTED',
              rejectionReason: `${rejectionReason} (Garment ${gId})`,
              rejectionComments,
              rejectedAt: nowIso,
              rejectedBy: actorName,
            }
          : s
      ));

      await loadQCRecords(orderIdStr, subOrders);
      setRejectGarmentModal({ open: false, garment: null });
      alert('Garment QC Rejection saved successfully!');
    } catch (err: any) {
      console.error('Failed to reject garment QC:', err);
      alert('Error rejecting QC: ' + (err.message || String(err)));
    } finally {
      setSubmittingReject(false);
    }
  }

  // Quick Pass QC handler for individual garment
  async function handlePassGarmentQC(g: Garment) {
    if (!order) return;
    const gId = g.garmentId;
    const orderIdStr = (order.id || order.orderId || orderId) as string;
    const actorName = user?.name || 'Admin';
    const nowIso = new Date().toISOString();

    try {
      const orderRef = doc(db, 'orders', orderIdStr);
      const updatedGarments = (order.garments || []).map((item: any) => {
        if (item.garmentId === gId) {
          const clone = { ...item, status: 'QC_PASSED', qcStatus: 'QC_PASSED' };
          delete clone.qcRejection;
          return clone;
        }
        return item;
      });

      // Clean up target QC record rejection
      const targetQc = qcRecords.find(qr =>
        (qr.garmentUpdates || []).some(u => u.garmentId === gId) ||
        qr.orderId === orderIdStr
      );
      if (targetQc && targetQc.rejectedGarments?.[gId]) {
        const updatedRejected = { ...targetQc.rejectedGarments };
        delete updatedRejected[gId];
        await updateDoc(doc(db, 'qcRecords', targetQc.id), {
          rejectedGarments: updatedRejected,
        });
      }

      // Check if all garments in order are now passed
      const allPassed = updatedGarments.length > 0 && updatedGarments.every((gm: any) => gm.qcStatus === 'QC_PASSED');
      const hasAnyRejected = updatedGarments.some((gm: any) => gm.qcStatus === 'QC_REJECTED' || !!gm.qcRejection);

      if (allPassed && !hasAnyRejected) {
        // 1. Update parent order
        await updateDoc(orderRef, {
          garments: updatedGarments,
          status: 'QC_APPROVED',
          qcStatus: 'QC_APPROVED',
          approvedAt: nowIso,
          approvedBy: actorName,
        });

        // 2. Update all sub-orders for this order
        for (const so of subOrders) {
          await updateDoc(doc(db, 'subOrders', so.id), {
            status: 'QC_APPROVED',
            qcStatus: 'QC_APPROVED',
            approvedAt: nowIso,
            approvedBy: actorName,
            updatedAt: nowIso,
          });
        }

        // 3. Update all qc records
        for (const qr of qcRecords) {
          await updateDoc(doc(db, 'qcRecords', qr.id), {
            status: 'QC_APPROVED',
            rejectedGarments: {},
            rejectionReason: '',
            rejectionComments: '',
            approvedAt: nowIso,
            approvedBy: actorName,
          });
        }

        setOrder(prev => prev ? {
          ...prev,
          garments: updatedGarments,
          status: 'QC_APPROVED',
        } : null);

        setSubOrders(prev => prev.map(s => ({
          ...s,
          status: 'QC_APPROVED',
          qcStatus: 'QC_APPROVED',
        })));

        await loadQCRecords(orderIdStr, subOrders);
        alert('All garments passed! Order and sub-orders marked as QC APPROVED.');
      } else {
        // Check if the specific sub-order containing this garment has all its garments passed
        const matchingSub = subOrders.find(so => so.garmentIds?.includes(gId));
        if (matchingSub) {
          const subGarments = updatedGarments.filter((gm: any) => matchingSub.garmentIds?.includes(gm.garmentId));
          const subAllPassed = subGarments.length > 0 && subGarments.every((gm: any) => gm.qcStatus === 'QC_PASSED');
          const subHasRejected = subGarments.some((gm: any) => gm.qcStatus === 'QC_REJECTED' || !!gm.qcRejection);
          if (subAllPassed && !subHasRejected) {
            await updateDoc(doc(db, 'subOrders', matchingSub.id), {
              status: 'QC_APPROVED',
              qcStatus: 'QC_APPROVED',
              approvedAt: nowIso,
              approvedBy: actorName,
              updatedAt: nowIso,
            });
            setSubOrders(prev => prev.map(s => s.id === matchingSub.id ? { ...s, status: 'QC_APPROVED', qcStatus: 'QC_APPROVED' } : s));
          }
        }

        await updateDoc(orderRef, { garments: updatedGarments });
        setOrder(prev => prev ? { ...prev, garments: updatedGarments } : null);
        await loadQCRecords(orderIdStr, subOrders);
        alert('Garment marked as QC Passed!');
      }
    } catch (err: any) {
      console.error('Error passing QC:', err);
      alert('Error: ' + (err.message || String(err)));
    }
  }

  if (loading) return <div className="page"><div className="loading-screen"><div className="loading-spinner" /></div></div>;



  if (!order) return <div className="page"><p className="text-muted">Order not found.</p></div>;

  const customer = order.customer || ({} as any);
  const garments: Garment[] = order.garments || [];
  const displayId = order.orderNumber || order.orderId || orderId;

  // QC Stats
  const rejectedCount = garments.filter(g => {
    return g.qcStatus === 'QC_REJECTED' || !!g.qcRejection || qcRecords.some(r => !!r.rejectedGarments?.[g.garmentId]);
  }).length;
  const passedCount = garments.filter(g => g.qcStatus === 'QC_PASSED').length;

  return (
    <div className="page">
      {/* Top Header Card */}
      <div style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        {/* Navigation Breadcrumb & Refresh */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b' }}>
            <Link
              to="/orders"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                color: '#4f46e5',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 13
              }}
            >
              <ArrowLeft size={15} /> Back to Orders
            </Link>
            <span style={{ color: '#cbd5e1' }}>/</span>
            <span style={{ fontFamily: 'monospace', color: '#0f172a', fontWeight: 600 }}>{displayId}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#64748b', fontSize: 12 }}>
              {order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
            </span>
            <button
              onClick={handleRefresh}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 7,
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#334155',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* Order Info & Status Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a', margin: 0, lineHeight: 1.2 }}>
              Order {displayId}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
                Customer: <strong style={{ color: '#0f172a' }}>{customer.name || 'Unknown'}</strong>
              </span>

              {careBadge(order.careCategory)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {(() => {
              const currentStatus = order.status || (subOrders.some(s => s.status === 'READY_FOR_DELIVERY') ? 'READY_FOR_DELIVERY' : 'RECEIVED');
              const b = getBadgeInfo(currentStatus);
              return (
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: b.color,
                  background: b.bg,
                  border: `1px solid ${b.border}`,
                  padding: '5px 14px',
                  borderRadius: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.color }} />
                  {b.label}
                </span>
              );
            })()}

            {(() => {
              const critCount = (order.garments || []).filter((g: any) => isGarmentCritical(g)).length;
              const reassignedCount = (order.garments || []).filter((g: any) => isGarmentReassigned(g)).length;
              return (
                <>
                  {critCount > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#dc2626', padding: '5px 12px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={13} /> {critCount} Critical
                    </span>
                  )}
                  {reassignedCount > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '5px 12px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <RefreshCw size={13} /> {reassignedCount} Reassigned
                    </span>
                  )}
                </>
              );
            })()}

            {rejectedCount > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', padding: '5px 12px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <XCircle size={13} /> {rejectedCount} QC Rejected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Ready for Delivery Banner */}
      {(order.status === 'READY_FOR_DELIVERY' || subOrders.some(s => s.status === 'READY_FOR_DELIVERY')) && (
        <div style={{
          background: '#ecfdf5',
          border: '1.5px solid #6ee7b7',
          borderRadius: 10,
          padding: '14px 18px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Truck size={18} color="#059669" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#059669' }}>Delivery Initiated by Partner — Ready to Deliver</div>
            <div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>
              Partner has completed QC and initiated delivery. This order is now ready for customer delivery / pickup.
              {(order as any).deliveryInitiatedAt && <span style={{ marginLeft: 8, color: '#065f46' }}>· Initiated at {new Date((order as any).deliveryInitiatedAt).toLocaleString('en-IN')}</span>}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 24, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 4 }}>Total Garments</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{garments.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 4 }}>Partner Orders</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{subOrders.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 4 }}>QC Passed</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{passedCount}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 4 }}>QC Defects / Issues</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: rejectedCount > 0 ? '#dc2626' : '#64748b' }}>{rejectedCount}</div>
        </div>
      </div>

      {/* Hub & Facility Information Card */}
      {(() => {
        const hub = order.hub || {
          name: (order as any).hubName || '',
          code: (order as any).hubCode || '',
          location: (order as any).hubLocation || '',
          latitude: (order as any).hubLatitude || (order as any).hubLat || '',
          longitude: (order as any).hubLongitude || (order as any).hubLng || (order as any).hubLog || '',
          address: (order as any).hubAddress || '',
          phone: (order as any).hubPhone || '',
        };
        const hasHub = Boolean(hub.name || hub.code || hub.location || hub.address);
        if (!hasHub) return null;

        const mapsUrl = (hub.latitude && hub.longitude)
          ? `https://www.google.com/maps?q=${hub.latitude},${hub.longitude}`
          : hub.address ? `https://www.google.com/maps?q=${encodeURIComponent(hub.address)}` : null;

        return (
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 24,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 size={18} color="#16a34a" />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Originating Hub & Logistics Facility
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{hub.name || 'Main Operational Hub'}</span>
                    {hub.code && (
                      <span style={{ fontSize: 11, fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace' }}>
                        {hub.code}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#2563eb',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    padding: '5px 12px',
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    textDecoration: 'none'
                  }}
                >
                  <Navigation size={13} /> View on Google Maps
                </a>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              {hub.location && (
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Hub Location</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <MapPin size={13} color="#64748b" /> {hub.location}
                  </div>
                </div>
              )}

              {hub.address && (
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Address</div>
                  <div style={{ fontSize: 12, color: '#334155', marginTop: 2, lineHeight: 1.4 }}>
                    {hub.address}
                  </div>
                </div>
              )}

              {hub.phone && (
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Contact Phone</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Phone size={13} color="#64748b" />
                    <a href={`tel:${hub.phone}`} style={{ color: '#0f172a', textDecoration: 'none' }}>{hub.phone}</a>
                  </div>
                </div>
              )}

              {(hub.latitude || hub.longitude) && (
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Coordinates (Lat, Long)</div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#475569', marginTop: 2 }}>
                    📍 {hub.latitude || '—'}, {hub.longitude || '—'}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Sub-Orders & Lifecycle Progress */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Partner Work Orders & Lifecycles ({subOrders.length})
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
              Track partner assignment, in-progress processing, and step-by-step quality lifecycles.
            </p>
          </div>
        </div>

        {subOrders.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '36px 20px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            No sub-orders assigned yet. Partners will be allocated automatically.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {subOrders.map((so) => {
              const soGarments = garments.filter(g => so.garmentIds.includes(g.garmentId));
              const rawCat = (so.garmentCategory?.split(',')[0] || order.careCategory || 'PREMIUM').toUpperCase();
              const primaryCat = rawCat.includes('SIGNATURE') || rawCat === 'GOLD' ? 'SIGNATURE' : rawCat.includes('PRISTINE') || rawCat === 'ORANGE' || rawCat === 'YELLOW' ? 'PRISTINE' : 'PREMIUM';
              const primaryLabel = primaryCat === 'SIGNATURE' ? 'Signature' : primaryCat === 'PRISTINE' ? 'Pristine' : 'Premium';
              const color = tierColor[primaryCat] || '#2563eb';
              const bg = tierBg[primaryCat] || '#eff6ff';
              const total = soGarments.length || 1;
              const isDone = so.status === 'COMPLETED' || so.status === 'DELIVERED' || so.status === 'READY_FOR_DELIVERY' || so.status === 'QC_APPROVED';
              const done = isDone ? total : so.status === 'IN_PROCESS' || so.status === 'QC_PENDING' || so.status === 'QC_SENT' ? Math.max(1, Math.round(total / 2)) : 0;
              const pct = Math.round((done / total) * 100);

              const soQcRecord = qcRecords.find(qr => qr.subOrderId === so.id || qr.subOrderId === so.subOrderCode || qr.orderId === so.id || qr.orderId === displayId);
              const partnerSteps = buildPartnerTimeline(so, order, soQcRecord);
              const completedSteps = partnerSteps.filter(s => s.status === 'COMPLETED').length;
              const totalSteps = partnerSteps.length;
              const partnerPct = Math.round((completedSteps / totalSteps) * 100);

              return (
                <div
                  key={so.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderLeft: `4px solid ${color}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                  }}
                >
                  {/* Partner Header */}
                  <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{so.subOrderCode}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{so.partnerName || 'Unassigned Partner'}</span>
                          <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '2px 7px', borderRadius: 4, fontFamily: 'monospace', fontWeight: 600 }}>{so.partnerCode}</span>
                          <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, border: `1px solid ${color}35` }}>
                            {primaryLabel}
                          </span>
                          <span style={{ fontSize: 12, color: '#64748b' }}>
                            • {soGarments.length} garment{soGarments.length !== 1 ? 's' : ''}
                          </span>
                          {(() => {
                            let dist = so.distanceKm;
                            if (dist == null) {
                              const pObj = partners.find(p => p.id === so.partnerId || p.partnerCode === so.partnerCode);
                              const pCoords = pObj ? getPartnerCoordinates(pObj) : null;
                              const hCoords = parseCoordinates(order.hub || { latitude: order.hubLatitude, longitude: order.hubLongitude });
                              if (hCoords && pCoords) {
                                dist = getDistanceKm(hCoords.lat, hCoords.lng, pCoords.lat, pCoords.lng);
                              }
                            }
                            if (dist != null) {
                              return (
                                <span style={{ fontSize: 11, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 7px', borderRadius: 4, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  📍 {dist} km from Hub
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>

                      {/* Critical / Reassigned tags */}
                      {(() => {
                        const soCrit = soGarments.filter(g => isGarmentCritical(g)).length;
                        const soReas = soGarments.filter(g => isGarmentReassigned(g)).length;
                        return (
                          <div style={{ display: 'flex', gap: 6 }}>
                            {soCrit > 0 && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#dc2626', padding: '2px 8px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <AlertTriangle size={10} /> {soCrit} Critical
                              </span>
                            )}
                            {soReas > 0 && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '2px 8px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <RefreshCw size={10} /> {soReas} Reassigned
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Right side controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'right', minWidth: 90 }}>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500, marginBottom: 2 }}>
                          <span>{done}/{total}</span> • <strong style={{ color: pct === 100 ? '#16a34a' : '#0f172a' }}>{pct}%</strong>
                        </div>
                        <div style={{ height: 4, width: 90, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : color, borderRadius: 2, transition: 'width 0.3s' }} />
                        </div>
                      </div>

                      {(so.status === 'QC_SENT' || so.status === 'QC_PENDING' || so.status === 'QC_REJECTED') && (
                        <button
                          type="button"
                          onClick={() => handleApproveSubOrderQC(so)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 6,
                            border: '1px solid #86efac',
                            background: '#f0fdf4',
                            color: '#16a34a',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <CheckCircle2 size={13} /> Approve QC
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setViewModal({ open: true, subOrder: so, garments: soGarments })}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          fontSize: 12,
                          color: '#4338ca',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                        }}
                      >
                        View Details
                      </button>

                      {(() => {
                        const b = getBadgeInfo(so.status);
                        return (
                          <span style={{
                            fontSize: 11,
                            padding: '4px 10px',
                            background: b.bg,
                            color: b.color,
                            border: `1px solid ${b.border}`,
                            borderRadius: 6,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: b.color }} />
                            {b.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Rejection notice */}
                  {so.status === 'QC_REJECTED' && (
                    <div style={{ margin: '10px 18px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>
                      <strong>QC Rejected:</strong> {so.rejectionReason || 'Defect found in garment'}
                      {so.rejectedBy && <span style={{ marginLeft: 6, color: '#9ca3af' }}>by {so.rejectedBy}</span>}
                    </div>
                  )}

                  {/* In-Card Lifecycle Stepper (Crisp, 6 steps, label only) */}
                  <div style={{ padding: '10px 18px 12px', background: '#fafbfc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                        Lifecycle Progress
                      </div>
                      <div style={{ fontSize: 10, color: completedSteps === totalSteps ? '#166534' : '#4338ca', fontWeight: 600 }}>
                        {completedSteps} of {totalSteps} complete ({partnerPct}%)
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
                      {partnerSteps.map((st) => {
                        const isDone = st.status === 'COMPLETED';
                        const isInProg = st.status === 'IN_PROGRESS';
                        const isRej = st.status === 'REJECTED';

                        const cardBorder = isDone ? '#bbf7d0' : isInProg ? '#bfdbfe' : isRej ? '#fecaca' : '#e2e8f0';
                        const cardBg = isDone ? '#f0fdf4' : isInProg ? '#eff6ff' : isRej ? '#fef2f2' : '#fff';
                        const badgeBg = isDone ? '#dcfce7' : isInProg ? '#dbeafe' : isRej ? '#fee2e2' : '#f1f5f9';
                        const badgeColor = isDone ? '#166534' : isInProg ? '#1e40af' : isRej ? '#991b1b' : '#64748b';

                        return (
                          <div
                            key={st.id}
                            style={{
                              background: cardBg,
                              border: `1px solid ${cardBorder}`,
                              borderRadius: 6,
                              padding: '6px 8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              minWidth: 0,
                            }}
                          >
                            <div
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                background: isDone ? '#16a34a' : isInProg ? '#2563eb' : isRej ? '#dc2626' : '#cbd5e1',
                                color: '#fff',
                                fontSize: 9,
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              {isDone ? <Check size={11} strokeWidth={3} /> : isRej ? <XCircle size={11} /> : st.stepNum}
                            </div>

                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{
                                fontWeight: 700,
                                fontSize: 11,
                                color: isDone ? '#14532d' : isInProg ? '#1e3a8a' : isRej ? '#7f1d1d' : '#334155',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                lineHeight: 1.2
                              }}>
                                {st.title}
                              </div>
                              {st.timeframe && isDone ? (
                                <div style={{ fontSize: 9, color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                                  {st.timeframe}
                                </div>
                              ) : isInProg ? (
                                <div style={{ fontSize: 9, color: '#2563eb', fontWeight: 600, marginTop: 1 }}>
                                  In Progress
                                </div>
                              ) : null}
                            </div>

                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '1px 5px',
                                borderRadius: 3,
                                background: badgeBg,
                                color: badgeColor,
                                letterSpacing: '0.02em',
                                flexShrink: 0
                              }}
                            >
                              {st.badgeText || (isDone ? 'Done' : isInProg ? 'Active' : 'Pending')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Garments Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0 }}>All Garments — QC Updates & Verification</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>
              Inspect partner QC photo updates and comments. Reject individual garments with defect evidence and feedback.
            </p>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', width: 40 }}>#</th>
                <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', width: 180 }}>Item & QR</th>
                <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', width: 130 }}>Care / Service</th>
                <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Partner QC Submission</th>
                <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>QC Status & Defect Review</th>
                <th style={{ textAlign: 'right', padding: '12px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', width: 170 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {garments.map((g, i) => {
                const gCareRaw = (g.garmentCategory || order.careCategory || 'PREMIUM').toUpperCase();
                const gCare = gCareRaw.includes('SIGNATURE') || gCareRaw === 'GOLD' ? 'SIGNATURE' : gCareRaw.includes('PRISTINE') || gCareRaw === 'ORANGE' || gCareRaw === 'YELLOW' ? 'PRISTINE' : 'PREMIUM';
                const color = tierColor[gCare] || '#2563eb';
                const gCareLabel = gCare === 'SIGNATURE' ? 'Signature' : gCare === 'PRISTINE' ? 'Pristine' : 'Premium';

                // Look up QC update for this garment (from qcRecords or garment updates)
                const gUpdate = qcRecords.flatMap(r => r.garmentUpdates || []).find(u => u.garmentId === g.garmentId)
                  || ((order as any).garmentUpdates || []).find((u: any) => u.garmentId === g.garmentId)
                  || ((order as any).qcGarments || []).find((u: any) => u.garmentId === g.garmentId)
                  || (((g as any).comments || (g as any).photos || (g as any).qcPhotos || (g as any).garmentQuality || (g as any).solvents || g.brand) ? g : null);

                // Look up matching QC record
                const orderIdStr = (order.id || order.orderId || orderId) as string;
                const matchedRec = qcRecords.find(qr =>
                  (qr.garmentUpdates || []).some(u => u.garmentId === g.garmentId) ||
                  qr.orderId === orderIdStr ||
                  subOrders.some(so => so.garmentIds?.includes(g.garmentId) && (so.id === qr.orderId || so.id === qr.subOrderId))
                );

                // Look up rejection details
                const gRej = g.qcRejection || matchedRec?.rejectedGarments?.[g.garmentId] ||
                  qcRecords.map(r => r.rejectedGarments?.[g.garmentId]).find(Boolean);

                const soForGarment = subOrders.find(so => so.garmentIds?.includes(g.garmentId));
                const isRejected = g.qcStatus === 'QC_REJECTED' || !!gRej;
                const isPassed = !isRejected && (g.qcStatus === 'QC_PASSED' || matchedRec?.status === 'QC_APPROVED');

                const partnerPhotos = (gUpdate?.photos || (g as any).photos || (g as any).qcPhotos || {}) as any;
                const hasPartnerPhotos = !!(partnerPhotos.front || partnerPhotos.back || partnerPhotos.other);
                const hasPartnerQCDetails = hasPartnerPhotos || !!gUpdate?.comments || !!(gUpdate as any)?.garmentQuality || (Array.isArray((gUpdate as any)?.solvents) && (gUpdate as any).solvents.length > 0);

                const isPending: boolean = !isRejected && !isPassed && Boolean(
                  hasPartnerQCDetails ||
                  matchedRec?.status === 'QC_PENDING' ||
                  (soForGarment && (soForGarment.status === 'QC_SENT' || soForGarment.status === 'QC_PENDING'))
                );

                const hasSubmittedQC = Boolean(
                  isRejected ||
                  isPassed ||
                  isPending ||
                  hasPartnerQCDetails ||
                  (soForGarment && ['QC_SENT', 'QC_PENDING', 'QC_APPROVED', 'QC_REJECTED'].includes(soForGarment.status))
                );

                const itemName = (g as any).itemName || (g as any).name || (g as any).itemType || (g.category && g.category.toUpperCase() !== gCare.toUpperCase() ? g.category : 'Garment');

                return (
                  <tr
                    key={g.garmentId || i}
                    style={{
                      borderBottom: i < garments.length - 1 ? '1px solid #f3f4f6' : 'none',
                      background: isRejected ? '#fff5f5' : isGarmentCritical(g) ? '#fef2f2' : isGarmentReassigned(g) ? '#eff6ff' : 'transparent',
                    }}
                  >
                    {/* Index */}
                    <td style={{ padding: '14px', color: '#9ca3af', fontSize: 12, verticalAlign: 'top' }}>
                      {i + 1}
                    </td>

                    {/* Item & QR */}
                    <td style={{ padding: '14px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {itemName}
                        {isGarmentReassigned(g) ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '2px 8px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <RefreshCw size={10} /> Reassigned
                          </span>
                        ) : isGarmentCritical(g) ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#dc2626', padding: '2px 6px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <AlertTriangle size={10} /> Critical
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
                        <strong>ID:</strong> <span style={{ fontFamily: 'monospace' }}>{g.garmentId}</span>
                      </div>
                      {g.qrCode && (
                        <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', marginTop: 2 }}>
                          QR: {g.qrCode}
                        </div>
                      )}
                      {(gUpdate?.brand || g.brand) && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{ fontSize: 11, background: '#f3f4f6', color: '#374151', padding: '2px 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Tag size={10} color="#6b7280" /> {gUpdate?.brand || g.brand}
                          </span>
                        </div>
                      )}

                      {/* Partner Defect Report (Shown if critical or was critical/reassigned) */}
                      {(isGarmentCritical(g) || (isGarmentReassigned(g) && (g.criticalComments || g.criticalPhotos?.urls?.length))) && (
                        <div style={{
                          marginTop: 8,
                          background: '#fff',
                          border: isGarmentReassigned(g) ? '1px solid #bfdbfe' : '1px solid #fecaca',
                          borderRadius: 6,
                          padding: '6px 8px',
                          fontSize: 11
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: isGarmentReassigned(g) ? '#1d4ed8' : '#dc2626', fontWeight: 700 }}>
                            <span>{isGarmentReassigned(g) ? 'Partner Defect Report (Reassigned)' : 'Partner Critical Report'}</span>
                            {g.criticalMarkedAt && <span style={{ color: '#9ca3af', fontSize: 10 }}>{new Date(g.criticalMarkedAt).toLocaleDateString()}</span>}
                          </div>
                          {g.criticalMarkedBy && <div style={{ color: '#6b7280', fontSize: 10, marginTop: 1 }}>By: {g.criticalMarkedBy}</div>}
                          {g.criticalComments && <div style={{ color: isGarmentReassigned(g) ? '#1e3a8a' : '#991b1b', marginTop: 3, lineHeight: 1.3 }}><strong>Note:</strong> {g.criticalComments}</div>}
                          {g.criticalPhotos?.urls?.length ? (
                            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {g.criticalPhotos.urls.slice(0, 3).filter(Boolean).map((u, pIdx) => (
                                <a key={pIdx} href={u} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#2563eb', textDecoration: 'underline' }}>
                                  📷 Photo {pIdx + 1}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* Admin Instructions & Reassignment */}
                      {(isGarmentCritical(g) || isGarmentReassigned(g)) && g.adminCriticalComment && (
                        <div style={{ marginTop: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#166534' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontWeight: 700, color: '#15803d' }}>
                              {isGarmentReassigned(g) ? '✓ Admin Reassigned with Instructions:' : 'Admin Instructions:'}
                            </span>
                            {g.assignedPartnerName && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#1e40af', background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>
                                To: {g.assignedPartnerName}
                              </span>
                            )}
                          </div>
                          <div style={{ lineHeight: 1.3 }}>{g.adminCriticalComment}</div>
                          {g.adminCriticalCommentBy && (
                            <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>By: {g.adminCriticalCommentBy}</div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Care / Service */}
                    <td style={{ padding: '14px', verticalAlign: 'top' }}>
                      <div style={{ color, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                        {gCareLabel}
                      </div>
                      <div style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>{g.serviceType || 'Standard Care'}</div>
                    </td>

                    {/* Partner QC Submission */}
                    <td style={{ padding: '14px', verticalAlign: 'top' }}>
                      {gUpdate ? (
                        <div>
                          {/* Photo badges */}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                            {partnerPhotos.front && (
                              <button
                                type="button"
                                onClick={() => setPhotoPreview({ url: partnerPhotos.front!, title: `${g.category || 'Garment'} — Partner Front Photo` })}
                                style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 8px', fontSize: 11, background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1e293b' }}
                              >
                                <ImageIcon size={12} color="#4f46e5" /> Front
                              </button>
                            )}
                            {partnerPhotos.back && (
                              <button
                                type="button"
                                onClick={() => setPhotoPreview({ url: partnerPhotos.back!, title: `${g.category || 'Garment'} — Partner Back Photo` })}
                                style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 8px', fontSize: 11, background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1e293b' }}
                              >
                                <ImageIcon size={12} color="#4f46e5" /> Back
                              </button>
                            )}
                            {partnerPhotos.other && (
                              <button
                                type="button"
                                onClick={() => setPhotoPreview({ url: partnerPhotos.other!, title: `${g.category || 'Garment'} — Partner Other Photo` })}
                                style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 8px', fontSize: 11, background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1e293b' }}
                              >
                                <ImageIcon size={12} color="#4f46e5" /> Other
                              </button>
                            )}
                            {!hasPartnerPhotos && (
                              <span style={{ color: '#9ca3af', fontSize: 11 }}>No photos uploaded</span>
                            )}
                          </div>

                          {/* Comments */}
                          {gUpdate.comments ? (
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#334155', marginBottom: 6 }}>
                              <span style={{ fontWeight: 600, color: '#64748b' }}>Partner Note:</span> {gUpdate.comments}
                            </div>
                          ) : (
                            <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 6 }}>No comments</div>
                          )}

                          {/* Quality Rating & Stain Types */}
                          {((gUpdate as any)?.garmentQuality || (g as any).garmentQuality) && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef3c7', border: '1px solid #fde68a', color: '#b45309', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, marginRight: 6, marginBottom: 4 }}>
                              <span>{'⭐'.repeat(Number((gUpdate as any)?.garmentQuality || (g as any).garmentQuality || 5))}</span>
                              <span>{((gUpdate as any)?.garmentQuality || (g as any).garmentQuality)}/5 Quality</span>
                            </div>
                          )}
                          {(((gUpdate as any)?.stainTypes && (gUpdate as any).stainTypes.length > 0) || ((gUpdate as any)?.solvents && (gUpdate as any).solvents.length > 0) || ((g as any).stainTypes && (g as any).stainTypes.length > 0) || ((g as any).solvents && (g as any).solvents.length > 0)) && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                              <span style={{ fontSize: 10, color: '#b45309', fontWeight: 700, alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                <Sparkles size={11} color="#d97706" /> Stains:
                              </span>
                              {(((gUpdate as any)?.stainTypes || (gUpdate as any)?.solvents || (g as any).stainTypes || (g as any).solvents || [])).map((s: string, sIdx: number) => (
                                <span key={sIdx} style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>
                          Pending partner submission
                        </div>
                      )}
                    </td>

                    {/* QC Status & Defect Review */}
                    <td style={{ padding: '14px', verticalAlign: 'top' }}>
                      {isRejected ? (
                        <div>
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '3px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <XCircle size={12} /> REJECTED
                            </span>
                          </div>

                          {/* Rejection Details Box */}
                          <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}>
                            <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: 3 }}>
                              ⚠️ {gRej?.reason || 'Defect Identified'}
                            </div>
                            {gRej?.comments && (
                              <div style={{ color: '#991b1b', marginBottom: 6, lineHeight: 1.4 }}>
                                <strong>Admin Note:</strong> {gRej.comments}
                              </div>
                            )}

                            {/* Defect photos */}
                            {gRej?.photos && gRej.photos.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                {gRej.photos.map((pUrl: string, pIdx: number) => (
                                  <button
                                    key={pIdx}
                                    type="button"
                                    onClick={() => setPhotoPreview({ url: pUrl, title: `Garment Defect Photo ${pIdx + 1}` })}
                                    style={{ border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                  >
                                    <Camera size={10} /> Defect Photo {pIdx + 1}
                                  </button>
                                ))}
                              </div>
                            )}

                            {gRej?.rejectedBy && (
                              <div style={{ color: '#9ca3af', fontSize: 10, marginTop: 4 }}>
                                By: {gRej.rejectedBy} {gRej.rejectedAt ? `· ${new Date(gRej.rejectedAt).toLocaleDateString()}` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : isPassed ? (
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} /> PASSED
                          </span>
                        </div>
                      ) : isPending ? (
                        <div>
                          <span style={{ fontSize: 11, color: '#d97706', background: '#fef3c7', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                            Pending Review
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>Not Submitted</span>
                        </div>
                      )}
                    </td>

                    {/* Action */}
                    <td style={{ padding: '14px', textAlign: 'right', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {(isGarmentCritical(g) || isGarmentReassigned(g)) && (
                          <button
                            type="button"
                            onClick={() => openCriticalModal(g)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: isGarmentReassigned(g) ? '1px solid #93c5fd' : '1px solid #2563eb',
                              background: isGarmentReassigned(g) ? '#eff6ff' : '#2563eb',
                              color: isGarmentReassigned(g) ? '#1d4ed8' : '#fff',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <MessageSquare size={13} /> {isGarmentReassigned(g) ? 'Edit / Reassign' : 'Instruct & Reassign'}
                          </button>
                        )}
                        {hasSubmittedQC ? (
                          <button
                            type="button"
                            onClick={() => openViewQcModal(g, gUpdate, gRej, isRejected, isPassed, isPending)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 6,
                              border: isRejected ? '1px solid #fca5a5' : isPassed ? '1px solid #86efac' : '1px solid #3b82f6',
                              background: isRejected ? '#fef2f2' : isPassed ? '#f0fdf4' : '#eff6ff',
                              color: isRejected ? '#dc2626' : isPassed ? '#15803d' : '#1d4ed8',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Eye size={14} /> View QC
                          </button>
                        ) : !(isGarmentCritical(g) || isGarmentReassigned(g)) ? (
                          <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', paddingRight: 4 }}>
                            Awaiting QC
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Garment QC Details & Inspection Dialog Box */}
      {viewQcModal.open && viewQcModal.garment && (() => {
        const g = viewQcModal.garment;
        const gUpdate = viewQcModal.gUpdate
          || qcRecords.flatMap(r => r.garmentUpdates || []).find(u => u.garmentId === g.garmentId)
          || ((order as any).garmentUpdates || []).find((u: any) => u.garmentId === g.garmentId)
          || ((order as any).qcGarments || []).find((u: any) => u.garmentId === g.garmentId)
          || (((g as any).comments || (g as any).photos || (g as any).qcPhotos || (g as any).garmentQuality || (g as any).solvents || g.brand) ? g : null);
        const photos = (gUpdate?.photos || (g as any).photos || (g as any).qcPhotos || {}) as any;
        const brand = gUpdate?.brand || g.brand || '';
        const comments = gUpdate?.comments || (g as any).comments || '';
        const quality = Number((gUpdate as any)?.garmentQuality || (g as any).garmentQuality || 5);
        const stains: string[] = (gUpdate as any)?.stainTypes || (gUpdate as any)?.solvents || (g as any).stainTypes || (g as any).solvents || [];
        const isPassed = viewQcModal.isPassed;
        const isRejected = viewQcModal.isRejected;
        const isPending = viewQcModal.isPending;
        const rejection = viewQcModal.rejection;

        const mRaw = (g.garmentCategory || order?.careCategory || 'PREMIUM').toUpperCase();
        const mCare = mRaw.includes('SIGNATURE') || mRaw === 'GOLD' ? 'SIGNATURE' : mRaw.includes('PRISTINE') || mRaw === 'ORANGE' || mRaw === 'YELLOW' ? 'PRISTINE' : 'PREMIUM';
        const mLabel = mCare === 'SIGNATURE' ? 'Signature' : mCare === 'PRISTINE' ? 'Pristine' : 'Premium';
        const mColor = tierColor[mCare];

        const photoSlots = [
          { slot: 'front', label: '1. Front Photo', url: photos.front },
          { slot: 'back', label: '2. Back Photo', url: photos.back },
          { slot: 'other', label: '3. Other Photo', url: photos.other },
        ];

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => setViewQcModal({ open: false, garment: null, gUpdate: null, rejection: null, isRejected: false, isPassed: false, isPending: false })}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                width: '100%',
                maxWidth: 680,
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
                overflow: 'hidden',
              }}
              onClick={e => e.stopPropagation()}
            >
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
                      {isPassed ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <CheckCircle2 size={12} /> PASSED
                        </span>
                      ) : isRejected ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <XCircle size={12} /> REJECTED
                        </span>
                      ) : isPending ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: 6 }}>
                          PENDING REVIEW
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 6 }}>
                          NOT SUBMITTED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, fontFamily: 'monospace' }}>
                      ID: {g.garmentId} {g.qrCode ? `· QR: ${g.qrCode}` : ''}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewQcModal({ open: false, garment: null, gUpdate: null, rejection: null, isRejected: false, isPassed: false, isPending: false })}
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{g.serviceType || 'Dry Clean'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Brand</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{brand || '—'}</div>
                  </div>
                </div>

                {/* Quality & Solvents Section */}
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
                            onClick={() => setPhotoPreview({ url, title: `${g.category || 'Garment'} — ${label}` })}
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
                            onClick={() => setPhotoPreview({ url: pUrl, title: `Garment Defect Photo ${pIdx + 1}` })}
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
                  onClick={() => setViewQcModal({ open: false, garment: null, gUpdate: null, rejection: null, isRejected: false, isPassed: false, isPending: false })}
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
                      setViewQcModal({ open: false, garment: null, gUpdate: null, rejection: null, isRejected: false, isPassed: false, isPending: false });
                      openGarmentRejectModal(g);
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
                    <XCircle size={15} /> {isRejected ? 'Edit Rejection' : 'Reject QC'}
                  </button>

                  {!isPassed ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setViewQcModal({ open: false, garment: null, gUpdate: null, rejection: null, isRejected: false, isPassed: false, isPending: false });
                        await handlePassGarmentQC(g);
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
                        boxShadow: '0 2px 4px rgba(22,163,74,0.2)'
                      }}
                    >
                      <CheckCircle2 size={15} /> Pass QC
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={15} /> QC Approved
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Garment-wise QC Rejection Modal */}
      {rejectGarmentModal.open && rejectGarmentModal.garment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setRejectGarmentModal({ open: false, garment: null })}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 540,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <XCircle size={20} color="#dc2626" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
                    Reject Garment QC — {rejectGarmentModal.garment.category || 'Garment'}
                  </h3>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, fontFamily: 'monospace' }}>
                    ID: {rejectGarmentModal.garment.garmentId} {rejectGarmentModal.garment.qrCode ? `· QR: ${rejectGarmentModal.garment.qrCode}` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectGarmentModal({ open: false, garment: null })}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', padding: 4 }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Reason Selector */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Defect Reason *
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
                    outline: 'none',
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
                  Comments / Correction Instructions for Partner *
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain exactly why this garment failed and what rework is required (e.g. stain on collar still visible, re-press sleeve)..."
                  value={rejectionComments}
                  onChange={e => setRejectionComments(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Defect Photo Evidence */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Defect Photo Evidence (Upload Image or Enter URL)
                </label>
                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>
                  Provide photos clearly highlighting the stain, tear, or defect so the laundry partner can inspect it.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {rejectionPhotos.map((photo, i) => (
                    <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#f9fafb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Camera size={13} color="#6b7280" /> Photo #{i + 1}
                        </span>
                        {photo && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...rejectionPhotos];
                              next[i] = '';
                              setRejectionPhotos(next);
                            }}
                            style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11, cursor: 'pointer', padding: 0 }}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      {photo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <img
                            src={photo}
                            alt={`Defect ${i + 1}`}
                            style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6, border: '1px solid #d1d5db' }}
                          />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Photo Attached</div>
                            <div style={{ fontSize: 10, color: '#6b7280', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {photo.substring(0, 50)}...
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Image URL (https://...)"
                            value={photo}
                            onChange={e => {
                              const next = [...rejectionPhotos];
                              next[i] = e.target.value;
                              setRejectionPhotos(next);
                            }}
                            style={{
                              flex: 1,
                              padding: '7px 10px',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              fontSize: 12,
                              background: '#fff',
                            }}
                          />
                          <label
                            style={{
                              padding: '7px 10px',
                              background: '#fff',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 500,
                              color: '#374151',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Upload size={12} /> Upload
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoFileUpload(i, file);
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRejectGarmentModal({ open: false, garment: null })}
                disabled={submittingReject}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectGarmentSubmit}
                disabled={submittingReject || !rejectionComments.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: submittingReject || !rejectionComments.trim() ? 'not-allowed' : 'pointer',
                  opacity: submittingReject || !rejectionComments.trim() ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {submittingReject ? 'Saving...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SubOrder View Modal */}
      {viewModal.open && viewModal.subOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setViewModal({ open: false, subOrder: null, garments: [] })}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '80vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 2 }}>{viewModal.subOrder.subOrderCode}</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{viewModal.subOrder.partnerName} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({viewModal.subOrder.partnerCode})</span></div>
              </div>
              <button onClick={() => setViewModal({ open: false, subOrder: null, garments: [] })} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', padding: 4 }}>&times;</button>
            </div>
            <div style={{ padding: '14px 20px', overflowY: 'auto', maxHeight: '55vh' }}>
              {viewModal.garments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>No garments in this sub-order.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>#</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Item</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Care Category</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Service</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>QR Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModal.garments.map((g, i) => {
                      const subCareRaw = (g.garmentCategory || order?.careCategory || 'PREMIUM').toUpperCase();
                      const subCare = subCareRaw.includes('SIGNATURE') || subCareRaw === 'GOLD' ? 'SIGNATURE' : subCareRaw.includes('PRISTINE') || subCareRaw === 'ORANGE' || subCareRaw === 'YELLOW' ? 'PRISTINE' : 'PREMIUM';
                      const subCareLabel = subCare === 'SIGNATURE' ? 'Signature' : subCare === 'PRISTINE' ? 'Pristine' : 'Premium';
                      const color = tierColor[subCare] || '#2563eb';
                      return (
                        <tr key={g.garmentId || i} style={{ borderBottom: i < viewModal.garments.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                          <td style={{ padding: '10px 10px', color: '#9ca3af', fontSize: 12 }}>{i + 1}</td>
                          <td style={{ padding: '10px 10px', fontWeight: 500 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {g.category || '—'}
                              {isGarmentReassigned(g) ? (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '1px 5px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  <RefreshCw size={8} /> Reassigned
                                </span>
                              ) : isGarmentCritical(g) ? (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#dc2626', padding: '1px 5px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  <AlertTriangle size={8} /> Critical
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td style={{ padding: '10px 10px', color, fontWeight: 600 }}>{subCareLabel}</td>
                          <td style={{ padding: '10px 10px', color: '#6b7280' }}>{g.serviceType || '—'}</td>
                          <td style={{ padding: '10px 10px', color: '#9ca3af', fontFamily: 'monospace', fontSize: 12 }}>{g.qrCode || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SubOrder Reject Details Modal (legacy) */}
      {rejectModal.open && rejectModal.subOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setRejectModal({ open: false, subOrder: null })}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>&#x274C;</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Rejection Details</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{rejectModal.subOrder.subOrderCode}</div>
                </div>
              </div>
              <button onClick={() => setRejectModal({ open: false, subOrder: null })} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', padding: 4 }}>&times;</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Partner</div>
                  <div style={{ fontSize: 14, color: '#111827' }}>{rejectModal.subOrder.partnerName || '—'} <span style={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: 12 }}>({rejectModal.subOrder.partnerCode})</span></div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Rejection Reason</div>
                  <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', lineHeight: 1.5 }}>{rejectModal.subOrder.rejectionReason || 'No reason provided'}</div>
                </div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Rejected By</div>
                    <div style={{ fontSize: 14, color: '#111827' }}>{rejectModal.subOrder.rejectedBy || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Rejected At</div>
                    <div style={{ fontSize: 14, color: '#111827' }}>{rejectModal.subOrder.rejectedAt ? new Date(rejectModal.subOrder.rejectedAt).toLocaleString('en-IN') : '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox Preview Modal */}
      {photoPreview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setPhotoPreview(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12, color: '#fff' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{photoPreview.title}</span>
              <button
                type="button"
                onClick={() => setPhotoPreview(null)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  color: '#fff',
                  fontSize: 18,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                &times;
              </button>
            </div>
            <img
              src={photoPreview.url}
              alt={photoPreview.title}
              style={{
                maxWidth: '85vw',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                background: '#000',
              }}
            />
          </div>
        </div>
      )}

      {/* Critical Garment Review & Reassign Modal */}
      {criticalModal.open && criticalModal.garment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setCriticalModal({ open: false, garment: null, subOrder: null })}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 540,
              boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fef2f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={18} color="#dc2626" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#991b1b' }}>Critical Garment Review</h3>
                  <div style={{ fontSize: 11, color: '#dc2626' }}>Provide instructions and assign/reassign to partner</div>
                </div>
              </div>
              <button
                onClick={() => setCriticalModal({ open: false, garment: null, subOrder: null })}
                style={{ background: 'none', border: 'none', fontSize: 20, color: '#9ca3af', cursor: 'pointer', padding: 4 }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Garment Details Card */}
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{criticalModal.garment.category || 'Garment'}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      QR: <span style={{ fontFamily: 'monospace' }}>{criticalModal.garment.qrCode || '—'}</span> · ID: <span style={{ fontFamily: 'monospace' }}>{criticalModal.garment.garmentId}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: tierColor[criticalModal.garment.garmentCategory || 'GOLD'] || '#d97706', background: tierBg[criticalModal.garment.garmentCategory || 'GOLD'] || '#fef3c7', padding: '2px 8px', borderRadius: 4 }}>
                    {criticalModal.garment.garmentCategory || 'GOLD'} · {criticalModal.garment.serviceType || 'Service'}
                  </span>
                </div>
              </div>

              {/* Partner Report Box */}
              <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginBottom: 4 }}>
                  Partner Defect Report
                </div>
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
                  <strong>Reported By:</strong> {criticalModal.garment.criticalMarkedBy || criticalModal.subOrder?.partnerName || 'Partner'}
                  {criticalModal.garment.criticalMarkedAt && (
                    <span style={{ color: '#9ca3af', marginLeft: 8 }}>
                      ({new Date(criticalModal.garment.criticalMarkedAt).toLocaleString('en-IN')})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#991b1b', background: '#fff', border: '1px solid #fed7d7', borderRadius: 6, padding: '8px 10px', lineHeight: 1.4 }}>
                  <strong>Comment:</strong> {criticalModal.garment.criticalComments || 'No comments provided'}
                </div>
                {criticalModal.garment.criticalPhotos?.urls?.length ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Uploaded Photos:</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {criticalModal.garment.criticalPhotos.urls.map((u: string, idx: number) => (
                        <a key={idx} href={u} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', background: '#fff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '3px 8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          📷 Photo {idx + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Admin Instructions Input */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
                  Admin Instructions / Feedback for Partner <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  value={criticalComment}
                  onChange={e => setCriticalComment(e.target.value)}
                  placeholder="e.g. Stain treatment acknowledged. Proceed with gentle dry clean. Customer informed of fabric fragility."
                  style={{
                    width: '100%',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    padding: '10px 12px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    boxSizing: 'border-box',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  These instructions will be visible directly on the partner's app for this garment.
                </div>
              </div>

              {/* Partner Assignment / Reassignment */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
                  Assign / Reassign to Partner
                </label>
                <select
                  value={targetPartnerId}
                  onChange={e => setTargetPartnerId(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    padding: '10px 12px',
                    fontSize: 13,
                    background: '#fff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  {criticalModal.subOrder && (
                    <option value={criticalModal.subOrder.partnerId}>
                      {criticalModal.subOrder.partnerName} ({criticalModal.subOrder.partnerCode}) — Current Partner (Reassign to him)
                    </option>
                  )}
                  {partners
                    .filter(p => !criticalModal.subOrder || p.id !== criticalModal.subOrder.partnerId)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.companyName} ({p.partnerCode}) · Tier: {p.category || 'Standard'}
                      </option>
                    ))}
                </select>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  {criticalModal.subOrder && targetPartnerId === criticalModal.subOrder.partnerId
                    ? 'Garment will remain with current partner with your new instructions to resume.'
                    : 'Garment will be reassigned to the selected partner.'}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setCriticalModal({ open: false, garment: null, subOrder: null })}
                disabled={submittingCritical}
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
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCritical}
                disabled={submittingCritical}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: submittingCritical ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: submittingCritical ? 0.7 : 1,
                }}
              >
                {submittingCritical ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={15} />}
                {submittingCritical ? 'Updating...' : 'Update & Reassign to Partner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
