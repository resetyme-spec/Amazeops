import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Settings, ChevronRight, ChevronDown, RotateCcw, Trash2, AlertTriangle, CheckCircle2, Clock, Check, Truck, XCircle, MessageSquare } from 'lucide-react';
import { fetchOrders } from '../lib/api';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, getDocs, getDoc, deleteDoc, query, where } from 'firebase/firestore';
import type { Order, Partner, SubOrder, Garment } from '../types';
import { assignGarmentsToPartners } from '../lib/assignment';
import { useAuth } from '../contexts/AuthContext';

const STATUS_OPTIONS = ['', 'RECEIVED', 'ASSIGNED', 'IN_PROCESS', 'QC_PENDING', 'QC_APPROVED', 'READY_FOR_DELIVERY', 'COMPLETED', 'DELIVERED', 'QC_REJECTED', 'REJECTED', 'CANCELLED'];
const STATUS_COLORS: Record<string, string> = {
 RECEIVED: 'badge-received', ASSIGNED: 'badge-assigned', IN_PROCESS: 'badge-in_process',
 COMPLETED: 'badge-completed', DELIVERED: 'badge-delivered',
 QC_PENDING: 'badge-qc_pending', QC_APPROVED: 'badge-completed', READY_FOR_DELIVERY: 'badge-completed',
 QC_REJECTED: 'badge-rejected', CANCELLED: 'badge-cancelled', REJECTED: 'badge-rejected',
};

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

interface TimelineStep {
 id: string;
 stepNum: number;
 title: string;
 description: string;
 timeframe?: string;
 status: 'COMPLETED' | 'IN_PROGRESS' | 'REJECTED' | 'PENDING';
 actor?: string;
 badgeText?: string;
}

function buildOrderTimeline(order: Order, subs: SubOrder[], qcRecord?: any, effectiveStatus?: string): TimelineStep[] {
 const currentStatus = (effectiveStatus || deriveStatus(order, subs)).toUpperCase();
 const sub = subs[0];
 const fmt = (ts?: string | Date | null) => formatTimeFrame(ts);

 const hasSubs = subs.length > 0;
 const isDelivered = currentStatus === 'DELIVERED' || currentStatus === 'COMPLETED' || (hasSubs && subs.every(s => s.status === 'COMPLETED' || s.status === 'DELIVERED'));
 const isDeliveryInitiated = isDelivered || currentStatus === 'READY_FOR_DELIVERY' || (order as any).deliveryStatus === 'READY_FOR_DELIVERY' || subs.some(s => s.status === 'READY_FOR_DELIVERY' || (s as any).deliveryStatus === 'READY_FOR_DELIVERY') || (order as any).status === 'READY_FOR_DELIVERY';
 const isQcApproved = isDeliveryInitiated || currentStatus === 'QC_APPROVED' || (order as any).qcStatus === 'QC_APPROVED' || (order as any).status === 'QC_APPROVED' || qcRecord?.status === 'QC_APPROVED' || subs.some(s => s.status === 'QC_APPROVED' || (s as any).qcStatus === 'QC_APPROVED');
 const isQcRejected = currentStatus === 'QC_REJECTED' || qcRecord?.status === 'QC_REJECTED' || subs.some(s => s.status === 'QC_REJECTED') || (order as any).status === 'QC_REJECTED';
 const isQcSubmitted = isQcApproved || isQcRejected || currentStatus === 'QC_PENDING' || currentStatus === 'QC_SENT' || !!qcRecord || subs.some(s => s.status === 'QC_PENDING' || s.status === 'QC_SENT' || !!(s as any)?.qcSubmittedAt);
 const isInProcess = isQcSubmitted || currentStatus === 'IN_PROCESS' || subs.some(s => s.status !== 'ASSIGNED' && s.status !== 'RECEIVED' && s.status !== 'REJECTED') || subs.some(s => !!(s as any)?.acceptedAt);
 const isAssigned = isInProcess || hasSubs;

 // 1. Order Received
 const step1Time = order.createdAt || (order as any).receivedDate;
 const step1: TimelineStep = {
  id: 'received',
  stepNum: 1,
  title: 'Order Received',
  description: order.customer?.name ? `Customer: ${order.customer.name}` : 'Order registered in system',
  timeframe: fmt(step1Time),
  status: 'COMPLETED',
  badgeText: 'Done',
 };

 // 2. Partner Assigned
 const step2Time = subs[0]?.createdAt || order.createdAt;
 const partnerNames = subs.map(s => `${s.partnerName || 'Partner'} (${s.partnerCode})`).filter(Boolean).join(', ');
 const step2: TimelineStep = {
  id: 'assigned',
  stepNum: 2,
  title: 'Partner Assigned',
  description: subs.length > 0 ? (partnerNames || 'Partner allocated') : 'Awaiting assignment',
  timeframe: isAssigned ? fmt(step2Time) : undefined,
  status: isAssigned ? 'COMPLETED' : 'PENDING',
  badgeText: isAssigned ? 'Done' : 'Pending',
 };

 // 3. Accepted & Processing
 const acceptedSubs = subs.filter(s => s.status !== 'ASSIGNED' && s.status !== 'RECEIVED');
 const step3Time = subs.find(s => (s as any)?.acceptedAt)?.acceptedAt || (isInProcess ? (subs.find(s => s.updatedAt)?.updatedAt || order.updatedAt || step2Time) : null);
 const allSubsAccepted = hasSubs && subs.every(s => s.status !== 'ASSIGNED' && s.status !== 'RECEIVED');
 const step3Status: TimelineStep['status'] = (allSubsAccepted && (isQcSubmitted || isQcApproved || isDeliveryInitiated || isDelivered))
  ? 'COMPLETED'
  : (isInProcess || currentStatus === 'IN_PROCESS')
  ? 'IN_PROGRESS'
  : 'PENDING';
 const step3Desc = hasSubs
  ? (acceptedSubs.length === subs.length
      ? `All ${subs.length} partners accepted & processing`
      : acceptedSubs.length > 0
      ? `${acceptedSubs.length} of ${subs.length} partners accepted (${acceptedSubs.map(s => s.partnerName).join(', ')})`
      : 'Partners to accept work orders')
  : 'Partner to accept work order';
 const step3: TimelineStep = {
  id: 'in_process',
  stepNum: 3,
  title: 'Accepted & In Process',
  description: step3Desc,
  timeframe: isInProcess ? fmt(step3Time) : undefined,
  status: step3Status,
  badgeText: step3Status === 'COMPLETED' ? 'Done' : step3Status === 'IN_PROGRESS' ? 'In Progress' : 'Pending',
 };

 // 4. QC Inspection Submitted
 const qcSubmittedSubs = subs.filter(s => ['QC_PENDING', 'QC_SENT', 'QC_APPROVED', 'READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(s.status) || !!(s as any)?.qcSubmittedAt);
 const step4Time = qcRecord?.submittedAt || subs.find(s => (s as any)?.qcSubmittedAt)?.qcSubmittedAt || (isQcSubmitted ? (subs.find(s => s.updatedAt)?.updatedAt || order.updatedAt) : null);
 const allSubsQcSubmitted = hasSubs && subs.every(s => ['QC_PENDING', 'QC_SENT', 'QC_APPROVED', 'READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(s.status) || !!(s as any)?.qcSubmittedAt);
 let step4Status: TimelineStep['status'] = 'PENDING';
 if (allSubsQcSubmitted && (isQcApproved || isDeliveryInitiated || isDelivered || isQcRejected)) {
  step4Status = 'COMPLETED';
 } else if (isQcSubmitted || qcSubmittedSubs.length > 0) {
  step4Status = 'IN_PROGRESS';
 }
 const step4Desc = isQcSubmitted
  ? (qcSubmittedSubs.length === subs.length
      ? `QC submitted by all ${subs.length} partners`
      : qcSubmittedSubs.length > 0
      ? `QC submitted by ${qcSubmittedSubs.length}/${subs.length} partners (${qcSubmittedSubs.map(s => s.partnerName).join(', ')})`
      : `Inspection photos by ${qcRecord?.submittedBy || subs[0]?.partnerName || 'Partner'}`)
  : 'Partner to upload QC photos & comments';
 const step4: TimelineStep = {
  id: 'qc_submitted',
  stepNum: 4,
  title: 'QC Submitted',
  description: step4Desc,
  timeframe: isQcSubmitted ? fmt(step4Time) : undefined,
  status: step4Status,
  badgeText: step4Status === 'COMPLETED' ? 'Done' : step4Status === 'IN_PROGRESS' ? 'Under Review' : 'Pending',
 };

 // 5. QC Approved / Rejected
 const qcApprovedSubs = subs.filter(s => ['QC_APPROVED', 'READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(s.status) || (s as any).qcStatus === 'QC_APPROVED');
 const step5Time = qcRecord?.approvedAt || (order as any).approvedAt || (isQcApproved ? (order.updatedAt || qcRecord?.updatedAt) : (isQcRejected ? (qcRecord?.rejectedAt || order.updatedAt) : null));
 let step5Status: TimelineStep['status'] = 'PENDING';
 let step5Title = 'QC Verified';
 let step5Desc = 'Admin quality verification';
 if (isQcRejected) {
  step5Status = 'REJECTED';
  step5Title = 'QC Rejected';
  step5Desc = qcRecord?.rejectionReason ? `${qcRecord.rejectionReason}` : 'Defects found - re-work required';
 } else if (hasSubs && qcApprovedSubs.length === subs.length) {
  step5Status = 'COMPLETED';
  step5Title = 'QC Approved';
  step5Desc = `Approved by ${qcRecord?.approvedBy || (order as any).approvedBy || 'Admin'}`;
 } else if (qcApprovedSubs.length > 0) {
  step5Status = 'IN_PROGRESS';
  step5Title = 'QC In Progress';
  step5Desc = `${qcApprovedSubs.length} of ${subs.length} partners QC approved`;
 } else if (isQcSubmitted) {
  step5Status = 'IN_PROGRESS';
  step5Title = 'QC Under Review';
  step5Desc = 'Pending Admin inspection';
 }
 const step5: TimelineStep = {
  id: 'qc_verified',
  stepNum: 5,
  title: step5Title,
  description: step5Desc,
  timeframe: (isQcApproved || isQcRejected) ? fmt(step5Time) : undefined,
  status: step5Status,
  badgeText: step5Status === 'COMPLETED' ? 'Approved' : step5Status === 'REJECTED' ? 'Rejected' : step5Status === 'IN_PROGRESS' ? 'Reviewing' : 'Pending',
 };

 // 6. Ready to Deliver / Delivery Initiated
 const readySubs = subs.filter(s => ['READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(s.status) || (s as any).deliveryStatus === 'READY_FOR_DELIVERY');
 const step6Time = (order as any).deliveryInitiatedAt || subs.find(s => (s as any)?.deliveryInitiatedAt)?.deliveryInitiatedAt || (isDeliveryInitiated ? (order.updatedAt || subs[0]?.updatedAt) : null);
 let step6Status: TimelineStep['status'] = 'PENDING';
 if (isDelivered) {
  step6Status = 'COMPLETED';
 } else if (hasSubs && readySubs.length === subs.length) {
  step6Status = 'COMPLETED';
 } else if (readySubs.length > 0) {
  step6Status = 'IN_PROGRESS';
 } else if (isQcApproved) {
  step6Status = 'IN_PROGRESS';
 }
 const step6Desc = (hasSubs && readySubs.length === subs.length)
  ? `Delivery initiated for all partners`
  : readySubs.length > 0
  ? `Delivery initiated for ${readySubs.length}/${subs.length} partners (${readySubs.map(s => s.partnerName).join(', ')})`
  : isDeliveryInitiated
  ? `Delivery initiated by ${(order as any).deliveryInitiatedBy || (subs[0] as any)?.deliveryInitiatedBy || 'Partner'}`
  : isQcApproved ? 'Partner ready to dispatch' : 'Pending QC completion';
 const step6: TimelineStep = {
  id: 'ready_delivery',
  stepNum: 6,
  title: 'Ready to Deliver',
  description: step6Desc,
  timeframe: isDeliveryInitiated ? fmt(step6Time) : undefined,
  status: step6Status,
  badgeText: isDeliveryInitiated ? 'Initiated' : step6Status === 'IN_PROGRESS' ? 'Ready' : 'Pending',
 };

 // 7. Delivered to Customer
 const step7Time = (order as any).deliveredAt || (isDelivered ? order.updatedAt : null);
 const step7: TimelineStep = {
  id: 'delivered',
  stepNum: 7,
  title: 'Delivered',
  description: isDelivered ? `Delivered to ${order.customer?.name || 'Customer'}` : 'Customer delivery pending',
  timeframe: isDelivered ? fmt(step7Time) : undefined,
  status: isDelivered ? 'COMPLETED' : 'PENDING',
  badgeText: isDelivered ? 'Delivered' : 'Pending',
 };

 return [step1, step2, step3, step4, step5, step6, step7];
}

function deriveStatus(order: Order, subs: SubOrder[]): string {
 const oStatus = (order.status || '').toUpperCase();
 const oDeliv = ((order as any).deliveryStatus || (order as any).delivery_status || '').toUpperCase();
 if (oStatus === 'READY_FOR_DELIVERY' || oDeliv === 'READY_FOR_DELIVERY') return 'READY_FOR_DELIVERY';
 if (subs.some(s => (s.status || '').toUpperCase() === 'READY_FOR_DELIVERY' || ((s as any).deliveryStatus || '').toUpperCase() === 'READY_FOR_DELIVERY')) return 'READY_FOR_DELIVERY';

 // If any sub is QC rejected -> show QC_REJECTED
 if (oStatus === 'QC_REJECTED' || subs.some(s => (s.status || '').toUpperCase() === 'QC_REJECTED')) return 'QC_REJECTED';
 // If any sub is QC pending / QC sent -> show QC_PENDING
 if (oStatus === 'QC_PENDING' || subs.some(s => {
  const st = (s.status || '').toUpperCase();
  return st === 'QC_PENDING' || st === 'QC_SENT';
 })) return 'QC_PENDING';
 // If all subs QC approved or order is QC_APPROVED -> QC_APPROVED
 if (oStatus === 'QC_APPROVED' || (subs.length > 0 && subs.every(s => (s.status || '').toUpperCase() === 'QC_APPROVED'))) return 'QC_APPROVED';
 // If all subs completed -> show COMPLETED
 if (oStatus === 'COMPLETED' || oStatus === 'DELIVERED' || (subs.length > 0 && subs.every(s => (s.status || '').toUpperCase() === 'COMPLETED' || (s.status || '').toUpperCase() === 'DELIVERED'))) return 'COMPLETED';
 // If any sub is in progress or completed while others pending -> show IN_PROCESS
 if (oStatus === 'IN_PROCESS' || subs.some(s => {
  const st = (s.status || '').toUpperCase();
  return st === 'IN_PROCESS' || st === 'COMPLETED' || st === 'DELIVERED' || st === 'READY_FOR_DELIVERY' || st === 'QC_APPROVED';
 })) return 'IN_PROCESS';
 // If subs assigned -> show ASSIGNED
 if (subs.some(s => (s.status || '').toUpperCase() === 'ASSIGNED')) return 'ASSIGNED';
 // Otherwise use order status (or RECEIVED as default)
 return order.status || 'RECEIVED';
}


export default function OrdersPage() {
 const { user } = useAuth();
 const [orders, setOrders] = useState<Order[]>([]);
 const [loading, setLoading] = useState(true);
 const [statusFilter, setStatusFilter] = useState('');
 const [search, setSearch] = useState('');
 const [refreshing, setRefreshing] = useState(false);
 const [expanded, setExpanded] = useState<Set<string>>(new Set());
 const [subOrdersByOrder, setSubOrdersByOrder] = useState<Map<string, SubOrder[]>>(new Map());
 const [qcRecordsByOrder, setQcRecordsByOrder] = useState<Map<string, any>>(new Map());
 const [resetting, setResetting] = useState(false);
 const [cleaningUp, setCleaningUp] = useState(false);
 const [partnersList, setPartnersList] = useState<Partner[]>([]);
 const [viewModal, setViewModal] = useState<{ open: boolean; subOrder: SubOrder | null; garments: Garment[]; order?: Order | null }>({ open: false, subOrder: null, garments: [], order: null });
 const [criticalModal, setCriticalModal] = useState<{ open: boolean; garment: Garment | null; subOrder: SubOrder | null; order: Order | null }>({ open: false, garment: null, subOrder: null, order: null });
 const [criticalComment, setCriticalComment] = useState('');
 const [targetPartnerId, setTargetPartnerId] = useState('');
 const [savingCritical, setSavingCritical] = useState(false);

 function openCriticalModal(garment: Garment, subOrder: SubOrder | null, order: Order | null) {
  setCriticalComment(garment.adminCriticalComment || '');
  setTargetPartnerId(subOrder?.partnerId || garment.assignedPartnerId || (partnersList[0]?.id || ''));
  setCriticalModal({ open: true, garment, subOrder, order });
 }

 async function handleSaveCritical() {
  if (!criticalModal.garment) return;
  if (!criticalComment.trim()) {
   alert('Please enter instructions / comments for the partner.');
   return;
  }
  const garmentId = criticalModal.garment.garmentId;
  const parentOrderId = criticalModal.order?.id || criticalModal.subOrder?.orderId;
  if (!parentOrderId) {
   alert('Parent order ID could not be identified.');
   return;
  }

  setSavingCritical(true);
  try {
   const parentRef = doc(db, 'orders', parentOrderId);
   const snap = await getDoc(parentRef);
   if (!snap.exists()) throw new Error('Order not found in database');
   const orderData = snap.data() as Order;

   const curSub = criticalModal.subOrder;
   const targetPartner = partnersList.find(p => p.id === targetPartnerId);
   const isReassigned = curSub && targetPartner && targetPartner.id !== curSub.partnerId;
   const now = new Date().toISOString();
   const adminName = user?.name || 'Admin';

   // Update garment inside parent order:
   // Once admin instructs & reassigns, it is marked as REASSIGNED and NOT CRITICAL
   const updatedGarments = (orderData.garments || []).map(g => {
    if (g.garmentId === garmentId) {
     return {
      ...g,
      isCritical: false,
      wasCritical: true,
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

   // Handle reassignment in subOrders collection if partner changed
   if (isReassigned && curSub && targetPartner) {
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
   }

   // Update viewModal live data immediately
   if (viewModal.open) {
    const updatedList = updatedGarments.filter(g =>
     isReassigned
      ? g.garmentId !== garmentId
      : (curSub?.garmentIds || []).includes(g.garmentId)
    );
    setViewModal(vm => ({ ...vm, garments: updatedList }));
   }

   await loadOrders();
   setCriticalModal({ open: false, garment: null, subOrder: null, order: null });
  } catch (err: any) {
   console.error('Failed to save critical comment / reassign:', err);
   alert('Failed to update: ' + (err.message || String(err)));
  } finally {
   setSavingCritical(false);
  }
 }

 async function loadPartners(): Promise<Partner[]> {
  try {
   const snap = await getDocs(collection(db, 'partners'));
   return snap.docs.map(d => ({ id: d.id, ...d.data() } as Partner));
  } catch (e) { console.error('Failed to load partners:', e); return []; }
 }

 async function loadSubOrders(): Promise<Map<string, SubOrder[]>> {
  try {
   const snap = await getDocs(collection(db, 'subOrders'));
   const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as SubOrder));
   // Dedupe sub-orders: keep the newest one per unique garment set
   const seen = new Set<string>();
   const unique = all.filter(so => {
    const key = (so.garmentIds || []).slice().sort().join(',') || so.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
   });
   const map = new Map<string, SubOrder[]>();
   unique.forEach(so => {
    if (!map.has(so.orderId)) map.set(so.orderId, []);
    map.get(so.orderId)!.push(so);
   });
   return map;
  } catch (e) { console.error('Failed to load sub-orders:', e); return new Map(); }
 }

 async function autoAssignOrders(ordersList: Order[], allPartners: Partner[], existingByOrder: Map<string, SubOrder[]>) {
  if (!ordersList.length || !allPartners.length) return existingByOrder;
  const now = new Date().toISOString();
  let made = false;

  for (const order of ordersList) {
   const orderId = order.id || order.orderId;
   if (!orderId) continue;
   const existing = existingByOrder.get(orderId) || [];
   // Also check for sub-orders with matching garment IDs (in case orderId differs from Firestore)
   const allKnownSubs = Array.from(existingByOrder.values()).flat();
   const matchingSubs = allKnownSubs.filter((so: any) => {
    if (so.orderId === orderId) return true;
    if (!so.garmentIds?.length || !order.garments?.length) return false;
    const soGarmentSet = new Set(so.garmentIds);
    return order.garments.some((g: any) => soGarmentSet.has(g.garmentId));
   });
   const allExisting = existing.length > 0 ? existing : matchingSubs;
   const assignedGarmentIds = new Set(allExisting.flatMap(so => so.garmentIds));
   const unassignedGarments = (order.garments || []).filter(g => !assignedGarmentIds.has(g.garmentId));
   if (allExisting.length > 0 && unassignedGarments.length === 0) {
    existingByOrder.set(orderId, allExisting);
    continue;
   }

   const assignments = assignGarmentsToPartners(orderId, unassignedGarments, allPartners);

   // Merge by partnerId — one sub-order per partner, not per category
   const partnerMap = new Map<string, typeof assignments>();
   for (const a of assignments) {
    const list = partnerMap.get(a.partnerId) || [];
    list.push(a);
    partnerMap.set(a.partnerId, list);
   }

   const startingSubNum = existing.length + 1;
   let subNum = startingSubNum;
   for (const [, group] of partnerMap) {
    const first = group[0];
    const allGarmentIds = group.flatMap(a => a.garmentIds);
    const subOrderCode = `${orderId}-${first.partnerCode}-${subNum}`;
    // Skip if a sub-order with this code already exists in Firestore
    const existingForCode = allKnownSubs.filter((s: any) => s.subOrderCode === subOrderCode);
    if (existingForCode.length > 0) {
     existingByOrder.set(orderId, [...allExisting, ...existingForCode]);
     continue;
    }
    const ref = doc(collection(db, 'subOrders'));
    const so: SubOrder = {
     id: ref.id, orderId, subOrderCode,
     partnerId: first.partnerId, partnerCode: first.partnerCode, partnerName: first.partnerName,
     garmentCategory: group.map(g => g.garmentCategory).join(','),
     garmentIds: allGarmentIds,
     status: 'ASSIGNED', createdAt: now, updatedAt: now,
    };
    try {
     await setDoc(ref, so);
     existing.push(so);
     made = true;
    } catch (e) { console.error('Failed to save sub-order:', e); }
    subNum++;
   }
   existingByOrder.set(orderId, existing);
  }
  return made ? new Map(existingByOrder) : existingByOrder;
 }

 async function loadOrders() {
  setLoading(true);
  try {
   const data = await fetchOrders(undefined);
   const unique = (data || []).reduce<Order[]>((acc, o) => {
    const docId = String(o.orderNumber || o.orderId || o.id);
    if (acc.find(x => x.id === docId)) return acc;
    return [...acc, { ...o, id: docId, orderId: docId } as Order];
   }, []);

   // Only sync to Firestore if API returned data (don't overwrite with empty)
   if (unique.length > 0) {
    try {
     const existingSnap = await getDocs(collection(db, 'orders'));
     const existingMap = new Map<string, any>();
     existingSnap.docs.forEach(d => { existingMap.set(d.id, d.data()); });
     const writes = unique.map(o => {
      const existing = existingMap.get(o.id);
      if (existing && existing.garments && o.garments) {
       const mergedGarments = o.garments.map((g: any) => {
        const match = existing.garments.find((eg: any) => (eg.garmentId === g.garmentId || eg.qrCode === g.qrCode));
        if (match && match.isCritical) {
         return { ...g, isCritical: true, criticalComments: match.criticalComments, criticalPhotos: match.criticalPhotos, criticalMarkedAt: match.criticalMarkedAt, criticalMarkedBy: match.criticalMarkedBy };
        }
        return g;
       });
       return setDoc(doc(db, 'orders', o.id), { ...o, garments: mergedGarments, updatedAt: new Date().toISOString() }, { merge: true });
      }
      return setDoc(doc(db, 'orders', o.id), { ...o, updatedAt: new Date().toISOString() }, { merge: true });
     });
     await Promise.all(writes);
    } catch (e) { console.warn('Firestore sync failed:', e); }
   }

   // Read orders from Firestore (source of truth for critical data)
   let finalUnique: Order[] = [];
   try {
    const fsSnap = await getDocs(collection(db, 'orders'));
    const fsOrders = fsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
    const orderMap = new Map<string, Order>();

    // 1. Add all Firestore orders
    fsOrders.forEach(f => {
     const docId = String(f.orderNumber || f.orderId || f.id);
     orderMap.set(docId, { ...f, id: docId, orderId: docId });
    });

    // 2. Add / merge API orders
    (unique || []).forEach(o => {
     const docId = String(o.orderNumber || o.orderId || o.id);
     const existing = orderMap.get(docId);
     if (existing) {
      orderMap.set(docId, {
       ...o,
       ...existing,
       status: existing.status || o.status,
       qcStatus: existing.qcStatus || o.qcStatus,
       deliveryStatus: existing.deliveryStatus || (existing as any).deliveryStatus || o.deliveryStatus,
       deliveryInitiatedAt: existing.deliveryInitiatedAt || (existing as any).deliveryInitiatedAt,
       deliveryInitiatedBy: existing.deliveryInitiatedBy || (existing as any).deliveryInitiatedBy,
       garments: existing.garments || o.garments,
      });
     } else {
      orderMap.set(docId, { ...o, id: docId, orderId: docId });
     }
    });

    finalUnique = Array.from(orderMap.values());
    setOrders(finalUnique);
   } catch (e) {
    finalUnique = unique;
    setOrders(unique);
   }
   const [allPartners, subMap] = await Promise.all([loadPartners(), loadSubOrders()]);
   setPartnersList(allPartners);
   try {
    const updatedMap = await autoAssignOrders(finalUnique, allPartners, subMap);
    setSubOrdersByOrder(updatedMap);
   } catch (e) { console.error('autoAssignOrders failed:', e); setSubOrdersByOrder(subMap); }
   try {
    const qcSnap = await getDocs(collection(db, 'qcRecords'));
    const qcMap = new Map<string, any>();
    qcSnap.docs.forEach(d => {
     const data: any = { id: d.id, ...(d.data() as any) };
     if (data.orderId) qcMap.set(data.orderId, data);
     if (data.subOrderId) qcMap.set(data.subOrderId, data);
    });
    setQcRecordsByOrder(qcMap);
   } catch (e) { console.warn('Failed to load qcRecords in Orders:', e); }
  } catch (e) { console.error('load orders failed:', e); }
  setLoading(false);
 }

 useEffect(() => {
  loadOrders();
 }, []);

 async function handleRefresh() {
  setRefreshing(true);
  await loadOrders();
  setRefreshing(false);
 }

 async function handleResetAll() {
  if (!confirm('Delete ALL existing sub-orders and re-create them based on current partner categories? This cannot be undone.')) return;
  setResetting(true);
  try {
   const snap = await getDocs(collection(db, 'subOrders'));
   const deletes = snap.docs.map(d => deleteDoc(doc(db, 'subOrders', d.id)));
   await Promise.all(deletes);
   setSubOrdersByOrder(new Map());
   const data = await fetchOrders(statusFilter || undefined);
   setOrders(data);
   const allPartners = await loadPartners();
   const updatedMap = await autoAssignOrders(data, allPartners, new Map());
   setSubOrdersByOrder(updatedMap);
  } catch (e) { console.error('Reset failed:', e); alert('Failed to reset: ' + (e as Error).message); }
  setResetting(false);
 }

 async function handleCleanupDuplicates() {
  if (!confirm('Find and delete duplicate sub-orders for the same garments? Keeps the newest one.')) return;
  setCleaningUp(true);
  try {
   const snap = await getDocs(collection(db, 'subOrders'));
   const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as SubOrder));
   const seen = new Map<string, SubOrder>();
   const toDelete: string[] = [];
   all.forEach(so => {
    const key = (so.garmentIds || []).slice().sort().join(',') || so.id;
    if (seen.has(key)) {
     toDelete.push(so.id);
    } else {
     seen.set(key, so);
    }
   });
   if (toDelete.length === 0) {
    alert('No duplicates found!');
   } else {
    await Promise.all(toDelete.map(id => deleteDoc(doc(db, 'subOrders', id))));
    alert(`Deleted ${toDelete.length} duplicate sub-order(s). Refreshing...`);
    await loadOrders();
   }
  } catch (e) { console.error('Cleanup failed:', e); alert('Cleanup failed: ' + (e as Error).message); }
  setCleaningUp(false);
 }

 function toggleExpand(orderId: string) {
  setExpanded(prev => {
   const next = new Set(prev);
   if (next.has(orderId)) next.delete(orderId);
   else next.add(orderId);
   return next;
  });
 }

 function isGarmentReassigned(g: any): boolean {
  if (!g) return false;
  return g.isReassigned === true || g.criticalStatus === 'REASSIGNED' || !!g.adminCriticalComment;
 }

 function isGarmentCritical(g: any): boolean {
  if (!g) return false;
  return g.isCritical === true && !isGarmentReassigned(g);
 }

 function countCritical(garments: Garment[]): number {
  return garments.filter(g => isGarmentCritical(g)).length;
 }

 function countReassigned(garments: Garment[]): number {
  return garments.filter(g => isGarmentReassigned(g)).length;
 }

 const tierColor: Record<string, string> = { GOLD: '#d97706', ORANGE: '#ea580c', BLUE: '#3b82f6' };
 const tierBg: Record<string, string> = { GOLD: '#fef3c7', ORANGE: '#ffedd5', BLUE: '#dbeafe' };

 const filtered = orders.filter(o => {
  const displayId = o.orderNumber || o.orderId || o.id || '';
  const customer = o.customer || {};
  const cName = customer.name || '';
  const cPhone = customer.phone || '';
  const subs = subOrdersByOrder.get(displayId) || [];
  const status = deriveStatus(o, subs);
  const q = search.toLowerCase();
  const matchSearch = !q || displayId.toLowerCase().includes(q) || cName.toLowerCase().includes(q) || cPhone.includes(q);
  const matchStatus = !statusFilter || (statusFilter === 'READY_FOR_DELIVERY' ? (status === 'READY_FOR_DELIVERY' || o.deliveryStatus === 'READY_FOR_DELIVERY') : statusFilter === 'QC_APPROVED' ? (status === 'QC_APPROVED' || o.qcStatus === 'QC_APPROVED') : status === statusFilter);
  return matchSearch && matchStatus;
 });

 function careBadge(cat?: string) {
  const c = (cat || 'Normal').toLowerCase();
  const crown = c === 'premium' ? '👑' : c === 'pristine' ? '🥈' : '🖤';
  const color = c === 'premium' ? '#d97706' : '#9ca3af';
  const bg = c === 'premium' ? '#fef3c7' : '#f3f4f6';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, color, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>{crown} {cat || 'Normal'}</span>;
 }

 function customerLabel(name: string, category?: string) {
  const c = (category || '').toLowerCase();
  if (c === "l'amaze prime") return <span style={{ color: '#d97706', fontWeight: 600 }}>⭐ {name}</span>;
  if (c === 'signature') return <span style={{ color: '#d97706', fontWeight: 600 }}>{name}</span>;
  if (c === 'regular') return <span style={{ color: '#9ca3af' }}>{name}</span>;
  return <span>{name}</span>;
 }

 return (
  <div className="page">
   <div className="page-header" style={{ marginBottom: 24, gap: 12 }}>
    <div><h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Orders</h1><p className="page-subtitle">{filtered.length} orders found</p></div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
     <button className="btn btn-primary" onClick={handleRefresh} disabled={refreshing} style={{ padding: '8px 16px' }}>
      <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none', marginRight: 6, verticalAlign: 'middle' }} /> Refresh
     </button>
     <button className="btn btn-secondary" onClick={handleResetAll} disabled={resetting} style={{ padding: '8px 16px' }} title="Delete all sub-orders and re-create based on current partner categories">
      <RotateCcw size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} /> {resetting ? 'Resetting...' : 'Reset & Reassign'}
     </button>
     <button className="btn btn-outline" onClick={handleCleanupDuplicates} disabled={cleaningUp} style={{ padding: '8px 16px' }} title="Remove duplicate sub-orders from Firestore">
      <Trash2 size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} /> {cleaningUp ? 'Cleaning...' : 'Cleanup Duplicates'}
     </button>
    </div>
   </div>

   <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
    {[
     { label: 'All', value: '' },
     { label: 'Assigned', value: 'ASSIGNED' },
     { label: 'In Progress', value: 'IN_PROCESS' },
     { label: 'QC Pending', value: 'QC_PENDING' },
     { label: 'QC Approved', value: 'QC_APPROVED' },
     { label: 'Ready to Deliver', value: 'READY_FOR_DELIVERY' },
     { label: 'QC Rejected', value: 'QC_REJECTED' },
     { label: 'Rejected', value: 'REJECTED' },
     { label: 'Completed', value: 'COMPLETED' },
     { label: 'Delivered', value: 'DELIVERED' },
    ].map(chip => (
     <button key={chip.value} onClick={() => setStatusFilter(chip.value)} style={{
      padding: '6px 14px', borderRadius: 20, border: '1px solid ' + (statusFilter === chip.value ? '#4f46e5' : '#d1d5db'),
      background: statusFilter === chip.value ? '#4f46e5' : '#fff',
      color: statusFilter === chip.value ? '#fff' : '#374151',
      fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
     }}>{chip.label}</button>
    ))}
   </div>

   <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
    <input type="text" placeholder="Search by customer name, phone, or order ID..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#fff' }} />
    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select" style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#fff', minWidth: 160 }}>
     {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === 'READY_FOR_DELIVERY' ? 'Ready to Deliver' : s === 'QC_APPROVED' ? 'QC Approved' : s === 'QC_PENDING' ? 'QC Pending' : s === 'IN_PROCESS' ? 'In Progress' : s || 'All Statuses'}</option>)}
    </select>
   </div>

   {loading ? <div className="loading-screen"><div className="loading-spinner" /></div> : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
     {filtered.map(order => {
      const displayId = order.orderNumber || order.orderId || order.id || '—';
      const customer = order.customer || {};
      const garments: Garment[] = order.garments || [];
      const cats = garments.map(g => String(g.garmentCategory || g.category || 'GOLD')).filter((v, i, a) => a.indexOf(v) === i);
      const isOpen = expanded.has(displayId);
      const subs = subOrdersByOrder.get(displayId) || [];
      return (
       <div key={displayId} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', gap: 14, cursor: 'pointer' }} onClick={() => toggleExpand(displayId)}>
         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: '#f3f4f6', color: '#6b7280', flexShrink: 0 }}>
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
         </div>
         <Link to={`/orders/${displayId}`} className="link" style={{ fontWeight: 600, fontSize: 14, fontFamily: 'monospace', color: '#4f46e5', minWidth: 100 }} onClick={e => e.stopPropagation()}>{displayId}</Link>
         <div style={{ minWidth: 130, maxWidth: 160, flexShrink: 0 }}>
          {customerLabel(customer.name || '—', customer.category)}
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{customer.phone || '—'}</div>
         </div>

         {/* Middle Section: Sub-Orders / Partner Status Breakdown */}
         <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', padding: '0 8px' }}>
          {subs.length === 0 ? (
           <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>Awaiting partner assignment</span>
          ) : (
           subs.map((so) => {
            const soGarments = garments.filter(g => so.garmentIds?.includes(g.garmentId));
            const count = soGarments.length || so.garmentIds?.length || 1;
            const primaryCat = so.garmentCategory?.split(',')[0] || '';
            const catColor = tierColor[primaryCat] || '#6b7280';
            const sBadge = getBadgeInfo(so.status);
            const isDone = so.status === 'COMPLETED' || so.status === 'DELIVERED' || so.status === 'READY_FOR_DELIVERY' || so.status === 'QC_APPROVED';
            const done = isDone ? count : so.status === 'IN_PROCESS' || so.status === 'QC_PENDING' || so.status === 'QC_SENT' ? Math.max(1, Math.round(count / 2)) : 0;
            const pct = Math.round((done / count) * 100);
            const soCritical = soGarments.filter(g => isGarmentCritical(g)).length;
            const soReassigned = soGarments.filter(g => isGarmentReassigned(g)).length;

            return (
             <div
              key={so.id}
              style={{
               display: 'inline-flex',
               alignItems: 'center',
               gap: 6,
               padding: '4px 9px',
               background: '#fff',
               border: `1px solid ${sBadge.border || '#e5e7eb'}`,
               borderRadius: 6,
               fontSize: 12,
               boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
               flexShrink: 0,
              }}
              title={`${so.partnerName || 'Partner'} (${so.partnerCode}) · ${count} garment${count !== 1 ? 's' : ''} · Status: ${sBadge.label}`}
             >
              {primaryCat && (
               <span
                style={{
                 width: 8,
                 height: 8,
                 borderRadius: '50%',
                 background: catColor,
                 flexShrink: 0,
                }}
               />
              )}
              <span style={{ fontWeight: 600, color: '#111827', fontSize: 12, whiteSpace: 'nowrap' }}>
               {so.partnerName || so.partnerCode || 'Partner'}
              </span>
              <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>
               · {count} {count === 1 ? 'garment' : 'garments'}
              </span>
              <span
               style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 4,
                background: sBadge.bg,
                color: sBadge.color,
                border: `1px solid ${sBadge.border}`,
                whiteSpace: 'nowrap',
                letterSpacing: '0.02em',
               }}
              >
               {sBadge.label}
              </span>
              {soCritical > 0 && (
               <span
                style={{
                 fontSize: 10,
                 fontWeight: 700,
                 color: '#fff',
                 background: '#dc2626',
                 padding: '1px 5px',
                 borderRadius: 8,
                }}
                title={`${soCritical} critical garment${soCritical !== 1 ? 's' : ''}`}
               >
                !{soCritical}
               </span>
              )}
              {soReassigned > 0 && (
               <span
                style={{
                 fontSize: 10,
                 fontWeight: 700,
                 color: '#1e40af',
                 background: '#dbeafe',
                 border: '1px solid #93c5fd',
                 padding: '1px 5px',
                 borderRadius: 8,
                }}
                title={`${soReassigned} reassigned garment${soReassigned !== 1 ? 's' : ''}`}
               >
                ⟳{soReassigned}
               </span>
              )}
             </div>
            );
           })
          )}
         </div>

         {careBadge(order.careCategory)}
         <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {cats.map(cat => (
           <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700, background: tierColor[cat] || '#9ca3af', color: '#fff' }} title={cat}>{cat[0]}</span>
          ))}
         </div>
         <span style={{ fontSize: 12, color: '#6b7280', minWidth: 60, textAlign: 'right' }}>{garments.length} item{garments.length !== 1 ? 's' : ''}</span>
         {(() => {
          const badge = getBadgeInfo(deriveStatus(order, subs));
          return (
           <span className="badge" style={{ fontSize: 12, padding: '4px 10px', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontWeight: 600 }}>
            {badge.label}
           </span>
          );
         })()}
         {(() => {
          const criticalCount = countCritical(garments);
          const reassignedCount = countReassigned(garments);
          return (
           <>
            {criticalCount > 0 && (
             <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: '#dc2626', padding: '3px 10px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={12} /> {criticalCount} Critical
             </span>
            )}
            {reassignedCount > 0 && (
             <span style={{ fontSize: 11, fontWeight: 600, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '3px 10px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} /> {reassignedCount} Reassigned
             </span>
            )}
           </>
          );
         })()}
         <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 80, textAlign: 'right' }}>{order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</span>
         <Link to={`/orders/${displayId}`} className="btn btn-sm" style={{ fontSize: 12, padding: '5px 12px' }} onClick={e => e.stopPropagation()}>View</Link>
        </div>

        {isOpen && (
         <div style={{ background: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '18px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
           <div>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: 12 }}>Sub-Orders ({subs.length})</div>
            {subs.length === 0 ? (
             <div style={{ color: '#9ca3af', fontSize: 13 }}>No sub-orders yet.</div>
            ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {subs.map((so) => {
               const soGarments = garments.filter(g => so.garmentIds.includes(g.garmentId));
               const primaryCat = so.garmentCategory?.split(',')[0] || '';
               const color = tierColor[primaryCat] || '#6b7280';
               const bg = tierBg[primaryCat] || '#f3f4f6';
               const total = soGarments.length || 1;
               const isDone = so.status === 'COMPLETED' || so.status === 'DELIVERED' || so.status === 'READY_FOR_DELIVERY' || so.status === 'QC_APPROVED';
               const done = isDone ? total : so.status === 'IN_PROCESS' || so.status === 'QC_PENDING' || so.status === 'QC_SENT' ? Math.max(1, Math.round(total / 2)) : 0;
               const pct = Math.round((done / total) * 100);
               return (
                <div key={so.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                 <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>{so.subOrderCode}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                   <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{so.partnerName || 'Unassigned'}</div>
                   {(() => {
                    const soCritical = soGarments.filter(g => isGarmentCritical(g)).length;
                    const soReas = soGarments.filter(g => isGarmentReassigned(g)).length;
                    return (
                     <>
                      {soCritical > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#dc2626', padding: '2px 8px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={10} /> {soCritical} Critical</span>}
                      {soReas > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '2px 8px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}><RefreshCw size={10} /> {soReas} Reassigned</span>}
                     </>
                    );
                   })()}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                   <span>{so.partnerCode}</span>
                   {primaryCat && <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{primaryCat}</span>}
                   <span style={{ color: '#9ca3af' }}>· {so.garmentIds.length} garment{so.garmentIds.length !== 1 ? 's' : ''}</span>
                  </div>
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setViewModal({ open: true, subOrder: so, garments: soGarments, order: order })} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, color: '#4b5563', cursor: 'pointer' }}>View</button>
                  <div style={{ width: 130, flexShrink: 0 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                    <span style={{ fontWeight: 500 }}>{done}/{total} done</span>
                    <span style={{ fontWeight: 600, color: pct === 100 ? '#16a34a' : '#4b5563' }}>{pct}%</span>
                   </div>
                   <div style={{ height: 7, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : color, borderRadius: 4, transition: 'width 0.3s' }}></div>
                   </div>
                   <div style={{ marginTop: 7, textAlign: 'right' }}>
                    {(() => {
                     const b = getBadgeInfo(so.status);
                     return <span className="badge" style={{ fontSize: 10, padding: '2px 8px', background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontWeight: 600 }}>{b.label}</span>;
                    })()}
                   </div>
                  </div>
                 </div>
                </div>
               );
              })}
             </div>
            )}
           </div>

           {/* Order Lifecycle Progress Timeline */}
           {(() => {
            const qcRecord = qcRecordsByOrder.get(order.id) || qcRecordsByOrder.get(displayId) || (subs[0] ? qcRecordsByOrder.get(subs[0].id) : null);
            const currentDerivedStatus = deriveStatus(order, subs);
            const steps = buildOrderTimeline(order, subs, qcRecord, currentDerivedStatus);
            const completedCount = steps.filter(s => s.status === 'COMPLETED').length;
            const totalSteps = steps.length;
            const overallStepPct = Math.round((completedCount / totalSteps) * 100);

            const totalG = garments.length;
            const isFinishedStatus = currentDerivedStatus === 'COMPLETED' || currentDerivedStatus === 'DELIVERED' || currentDerivedStatus === 'READY_FOR_DELIVERY' || currentDerivedStatus === 'QC_APPROVED';
            const doneG = isFinishedStatus
             ? totalG
             : subs.filter(s => s.status === 'COMPLETED' || s.status === 'DELIVERED' || s.status === 'READY_FOR_DELIVERY' || s.status === 'QC_APPROVED').reduce((sum, so) => sum + so.garmentIds.length, 0);
            const garmentPct = totalG > 0 ? Math.round((doneG / totalG) * 100) : 0;

            return (
             <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
               <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                 <span style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Order Lifecycle Progress</span>
                 <span style={{ background: overallStepPct === 100 ? '#dcfce7' : '#e0e7ff', color: overallStepPct === 100 ? '#166534' : '#4338ca', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                  {completedCount} of {totalSteps} Steps Complete ({overallStepPct}%)
                 </span>
                </div>
                <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>
                 Garments: <strong style={{ color: garmentPct === 100 ? '#16a34a' : '#111827' }}>{doneG} of {totalG} garments processed ({garmentPct}%)</strong>
                </div>
               </div>
               <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {currentDerivedStatus === 'READY_FOR_DELIVERY' && (
                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                  <Truck size={14} /> Ready for Customer Delivery
                 </span>
                )}
                {currentDerivedStatus === 'QC_APPROVED' && (
                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                  <CheckCircle2 size={14} /> QC Verification Passed
                 </span>
                )}
               </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden', marginBottom: 18 }}>
               <div style={{
                height: '100%',
                width: `${overallStepPct}%`,
                background: overallStepPct === 100 ? '#16a34a' : 'linear-gradient(90deg, #4f46e5 0%, #10b981 100%)',
                borderRadius: 4,
                transition: 'width 0.4s ease-in-out'
               }}></div>
              </div>

              {/* Step cards with timestamps */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
               {steps.map((st) => {
                const isDone = st.status === 'COMPLETED';
                const isInProg = st.status === 'IN_PROGRESS';
                const isRej = st.status === 'REJECTED';

                const cardBorder = isDone ? '#bbf7d0' : isInProg ? '#93c5fd' : isRej ? '#fecaca' : '#e5e7eb';
                const cardBg = isDone ? '#f0fdf4' : isInProg ? '#eff6ff' : isRej ? '#fef2f2' : '#f9fafb';
                const iconColor = isDone ? '#16a34a' : isInProg ? '#2563eb' : isRej ? '#dc2626' : '#9ca3af';
                const badgeBg = isDone ? '#dcfce7' : isInProg ? '#dbeafe' : isRej ? '#fee2e2' : '#e5e7eb';
                const badgeColor = isDone ? '#166534' : isInProg ? '#1e40af' : isRej ? '#991b1b' : '#6b7280';

                return (
                 <div key={st.id} style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 8,
                  padding: '12px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 120,
                  transition: 'all 0.2s ease',
                 }}>
                  <div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{
                     width: 22,
                     height: 22,
                     borderRadius: '50%',
                     background: isDone ? '#16a34a' : isInProg ? '#2563eb' : isRej ? '#dc2626' : '#d1d5db',
                     color: '#fff',
                     fontSize: 11,
                     fontWeight: 700,
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                    }}>
                     {isDone ? <Check size={12} strokeWidth={3} /> : isRej ? <XCircle size={12} /> : st.stepNum}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 5px', borderRadius: 4, background: badgeBg, color: badgeColor, letterSpacing: '0.03em' }}>
                     {st.badgeText}
                    </span>
                   </div>

                   <div style={{ fontWeight: 700, fontSize: 12, color: isDone ? '#14532d' : isInProg ? '#1e3a8a' : isRej ? '#7f1d1d' : '#374151', marginBottom: 3, lineHeight: 1.3 }}>
                    {st.title}
                   </div>

                   <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 8, lineHeight: 1.3 }}>
                    {st.description}
                   </div>
                  </div>

                  <div style={{
                   borderTop: `1px solid ${isDone ? '#dcfce7' : isInProg ? '#bfdbfe' : isRej ? '#fecaca' : '#e5e7eb'}`,
                   paddingTop: 6,
                   marginTop: 'auto',
                   display: 'flex',
                   alignItems: 'center',
                   gap: 4,
                  }}>
                   <Clock size={11} color={st.timeframe ? iconColor : '#9ca3af'} />
                   <span style={{
                    fontSize: 10,
                    fontWeight: st.timeframe ? 600 : 400,
                    color: st.timeframe ? (isDone ? '#15803d' : '#1e40af') : '#9ca3af',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                   }}>
                    {st.timeframe || 'Pending'}
                   </span>
                  </div>
                 </div>
                );
               })}
              </div>
             </div>
            );
           })()}
          </div>
         </div>
        )}
       </div>
      );
     })}
     {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af', fontSize: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10 }}>No orders match your filter.</div>}
    </div>
   )}
   {viewModal.open && viewModal.subOrder && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setViewModal({ open: false, subOrder: null, garments: [], order: null })}>
     <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 740, maxHeight: '85vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
       <div>
        <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 2 }}>{viewModal.subOrder.subOrderCode}</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{viewModal.subOrder.partnerName} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({viewModal.subOrder.partnerCode})</span></div>
       </div>
       <button onClick={() => setViewModal({ open: false, subOrder: null, garments: [], order: null })} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', padding: 4 }}>&times;</button>
      </div>
      <div style={{ padding: '14px 20px', overflowY: 'auto', maxHeight: '60vh' }}>
       {viewModal.garments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>No garments in this sub-order.</div>
       ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
         <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
           <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>#</th>
           <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Item</th>
           <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Tier</th>
           <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Service</th>
           <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>QR Code</th>
           <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Status / Instructions</th>
          </tr>
         </thead>
         <tbody>
          {viewModal.garments.map((g, i) => {
           const tier = g.garmentCategory || 'GOLD';
           const color = tierColor[tier] || '#6b7280';
           const critical = isGarmentCritical(g);
           const reassigned = isGarmentReassigned(g);
           const hasAdminComment = !!g.adminCriticalComment;
           return (
            <tr key={g.garmentId || i} style={{ borderBottom: i < viewModal.garments.length - 1 ? '1px solid #f3f4f6' : 'none', background: critical ? '#fef2f2' : reassigned ? '#eff6ff' : 'transparent' }}>
             <td style={{ padding: '10px 10px', color: '#9ca3af', fontSize: 12 }}>{i + 1}</td>
             <td style={{ padding: '10px 10px', fontWeight: 500 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
               {g.category || '—'}
               {reassigned ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '2px 7px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}><RefreshCw size={10} /> Reassigned</span>
               ) : critical ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#dc2626', padding: '2px 7px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}><AlertTriangle size={10} /> Critical</span>
               ) : null}
              </div>
              {(critical || reassigned) && (
               <div style={{ marginTop: 4 }}>
                {reassigned ? (
                 <span style={{ fontSize: 10, fontWeight: 600, color: '#1e40af', background: '#dbeafe', padding: '1px 6px', borderRadius: 6, display: 'inline-block' }}>
                  ✓ Reassigned
                 </span>
                ) : hasAdminComment ? (
                 <span style={{ fontSize: 10, fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: 6, display: 'inline-block' }}>
                  ✓ Instructed
                 </span>
                ) : (
                 <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 6, display: 'inline-block' }}>
                  ⏳ Needs Admin Action
                 </span>
                )}
               </div>
              )}
             </td>
             <td style={{ padding: '10px 10px', color, fontWeight: 600 }}>{tier}</td>
             <td style={{ padding: '10px 10px', color: '#6b7280' }}>{g.serviceType || '—'}</td>
             <td style={{ padding: '10px 10px', color: '#9ca3af', fontFamily: 'monospace', fontSize: 12 }}>{g.qrCode || '—'}</td>
             <td style={{ padding: '10px 10px', minWidth: 220 }}>
              {(critical || reassigned) ? (
               <div style={{ fontSize: 11 }}>
                {/* Partner Defect Note */}
                <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>Partner Report</span>
                  {g.criticalMarkedAt && <span style={{ color: '#9ca3af', fontSize: 10 }}>{new Date(g.criticalMarkedAt).toLocaleString('en-IN')}</span>}
                 </div>
                 {g.criticalMarkedBy && <div style={{ color: '#6b7280', fontSize: 10 }}>By: {g.criticalMarkedBy}</div>}
                 {g.criticalComments && <div style={{ marginTop: 3, color: '#991b1b', lineHeight: 1.3 }}><strong>Note:</strong> {g.criticalComments}</div>}
                 {g.criticalPhotos?.urls?.length ? (
                  <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                   {g.criticalPhotos.urls.slice(0, 3).filter((u: string) => u).map((u: string, idx: number) => (
                    <a key={idx} href={u} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#2563eb', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                     📷 Photo {idx + 1}
                    </a>
                   ))}
                  </div>
                 ) : null}
                </div>

                {/* Admin Instructions Section */}
                {hasAdminComment && (
                 <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                   <span style={{ color: '#16a34a', fontWeight: 700 }}>Admin Instructions</span>
                   {g.adminCriticalCommentAt && <span style={{ color: '#6b7280', fontSize: 10 }}>{new Date(g.adminCriticalCommentAt).toLocaleString('en-IN')}</span>}
                  </div>
                  <div style={{ color: '#166534', lineHeight: 1.3 }}>{g.adminCriticalComment}</div>
                  {g.adminCriticalCommentBy && <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>By: {g.adminCriticalCommentBy}</div>}
                 </div>
                )}

                {/* Action Button: Give Comments & Reassign */}
                <button
                 type="button"
                 onClick={() => openCriticalModal(g, viewModal.subOrder, viewModal.order || null)}
                 style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: hasAdminComment ? '1px solid #d1d5db' : '1px solid #2563eb',
                  background: hasAdminComment ? '#fff' : '#2563eb',
                  color: hasAdminComment ? '#374151' : '#fff',
                  fontWeight: 600,
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                 }}
                >
                 <MessageSquare size={12} />
                 {hasAdminComment ? 'Edit Instructions / Reassign' : 'Instruct Partner & Reassign'}
                </button>
               </div>
              ) : (
               <span style={{ fontSize: 11, color: '#9ca3af' }}>Normal</span>
              )}
             </td>
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
     onClick={() => setCriticalModal({ open: false, garment: null, subOrder: null, order: null })}
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
        onClick={() => setCriticalModal({ open: false, garment: null, subOrder: null, order: null })}
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
         {partnersList
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
        onClick={() => setCriticalModal({ open: false, garment: null, subOrder: null, order: null })}
        disabled={savingCritical}
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
        disabled={savingCritical}
        style={{
         padding: '8px 18px',
         borderRadius: 6,
         border: 'none',
         background: '#2563eb',
         color: '#fff',
         fontSize: 13,
         fontWeight: 600,
         cursor: savingCritical ? 'not-allowed' : 'pointer',
         display: 'inline-flex',
         alignItems: 'center',
         gap: 6,
         opacity: savingCritical ? 0.7 : 1,
        }}
       >
        {savingCritical ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={15} />}
        {savingCritical ? 'Updating...' : 'Update & Reassign to Partner'}
       </button>
      </div>
     </div>
    </div>
   )}
  </div>
 );
}
