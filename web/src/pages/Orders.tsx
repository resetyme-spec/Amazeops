import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Settings, ChevronRight, ChevronDown, RotateCcw, Trash2, AlertTriangle, CheckCircle2, Clock, Check, Truck, XCircle, MessageSquare, Search } from 'lucide-react';
import { fetchOrders } from '../lib/api';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, getDocs, getDoc, deleteDoc, query, where, onSnapshot } from 'firebase/firestore';
import type { Order, Partner, SubOrder, Garment } from '../types';
import { assignGarmentsToPartners, getDistanceKm, getPartnerCoordinates, parseCoordinates } from '../lib/assignment';
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
   description: isQcSubmitted ? (qcRecord?.photos?.length ? `${qcRecord.photos.length} photos uploaded` : 'Inspection submitted') : 'Pending inspection',
   timeframe: isQcSubmitted ? fmt(qcSubmittedTime) : undefined,
   status: (isQcApproved || isReady || isDelivered) ? 'COMPLETED' : isQcSubmitted ? 'IN_PROGRESS' : 'PENDING',
   badgeText: (isQcApproved || isReady || isDelivered) ? 'Done' : isQcSubmitted ? 'Under Review' : 'Pending',
  },
  {
   id: 'qc_verified',
   stepNum: 4,
   title: isQcRejected ? 'QC Rejected' : isQcApproved ? 'QC Approved' : 'QC Verified',
   description: isQcRejected ? (qcRecord?.rejectionReason || 'Defects found - re-work') : isQcApproved ? `Verified by ${qcRecord?.approvedBy || 'Admin'}` : 'Admin verification',
   timeframe: (isQcApproved || isQcRejected) ? fmt(qcApprovedTime) : undefined,
   status: isQcRejected ? 'REJECTED' : isQcApproved ? 'COMPLETED' : isQcSubmitted ? 'IN_PROGRESS' : 'PENDING',
   badgeText: isQcRejected ? 'Rejected' : isQcApproved ? 'Approved' : isQcSubmitted ? 'Reviewing' : 'Pending',
  },
  {
   id: 'ready_delivery',
   stepNum: 5,
   title: 'Ready to Deliver',
   description: isReady ? 'Packed & ready for dispatch' : 'Pending QC completion',
   timeframe: isReady ? fmt(readyTime) : undefined,
   status: isDelivered ? 'COMPLETED' : isReady ? 'IN_PROGRESS' : 'PENDING',
   badgeText: isDelivered ? 'Done' : isReady ? 'Ready' : 'Pending',
  },
  {
   id: 'delivered',
   stepNum: 6,
   title: 'Delivered',
   description: isDelivered ? 'Delivered to customer' : 'Customer delivery pending',
   timeframe: isDelivered ? fmt(deliveredTime) : undefined,
   status: isDelivered ? 'COMPLETED' : 'PENDING',
   badgeText: isDelivered ? 'Delivered' : 'Pending',
  },
 ];
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


function getOrderTimestamp(o: any): number {
 if (!o) return 0;
 const raw = o.createdAt || (o as any).created_at || (o as any).created;
 if (typeof raw === 'number') return raw;
 if (typeof raw === 'object' && raw) {
  if (typeof raw.toMillis === 'function') return raw.toMillis();
  if (typeof raw.toDate === 'function') return raw.toDate().getTime();
  if (raw.seconds) return raw.seconds * 1000;
  if (raw._seconds) return raw._seconds * 1000;
 }
 if (raw) {
  const parsed = new Date(raw).getTime();
  if (!isNaN(parsed) && parsed > 0) return parsed;
 }
 const match = String(o.id || o.orderNumber || o.orderId || '').match(/ORD-(\d{13})/);
 if (match) return Number(match[1]);
 return 0;
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

   const hubGeo = order.hub || { latitude: order.hubLatitude, longitude: order.hubLongitude };
   const assignments = assignGarmentsToPartners(orderId, unassignedGarments, allPartners, hubGeo);

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
     distanceKm: first.distanceKm,
     distanceFromHub: first.distanceKm != null ? `${first.distanceKm} km` : undefined,
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

   // Sync main order to Firestore 'orders' collection with its hub details (NOT in sub-orders)
   try {
    const hubData = order.hub || {
     name: order.hubName || '',
     code: order.hubCode || '',
     location: order.hubLocation || '',
     latitude: order.hubLatitude ?? null,
     longitude: order.hubLongitude ?? null,
     address: order.hubAddress || '',
     phone: order.hubPhone || '',
    };
    await setDoc(doc(db, 'orders', orderId), {
     id: orderId,
     orderId,
     orderNumber: order.orderNumber || orderId,
     customer: order.customer || null,
     careCategory: order.careCategory || 'Normal',
     garments: order.garments || [],
     services: order.services || [],
     status: order.status || 'ASSIGNED',
     createdAt: order.createdAt || now,
     hub: hubData,
     hubName: hubData.name || order.hubName || '',
     hubCode: hubData.code || order.hubCode || '',
     hubLocation: hubData.location || order.hubLocation || '',
     hubLatitude: hubData.latitude ?? order.hubLatitude ?? null,
     hubLongitude: hubData.longitude ?? order.hubLongitude ?? null,
     hubAddress: hubData.address || order.hubAddress || '',
     hubPhone: hubData.phone || order.hubPhone || '',
    }, { merge: true });
   } catch (e) {
    console.error('Failed to sync main order to Firestore:', e);
   }
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

   // Read-only: orders are already synced to Firestore by backend engine

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
      const hubData = existing.hub || o.hub;
      orderMap.set(docId, {
       ...o,
       ...existing,
       hub: hubData,
       hubName: hubData?.name || existing.hubName || o.hubName || '',
       hubCode: hubData?.code || existing.hubCode || o.hubCode || '',
       hubLocation: hubData?.location || existing.hubLocation || o.hubLocation || '',
       hubLatitude: hubData?.latitude ?? existing.hubLatitude ?? o.hubLatitude ?? null,
       hubLongitude: hubData?.longitude ?? existing.hubLongitude ?? o.hubLongitude ?? null,
       hubAddress: hubData?.address || existing.hubAddress || o.hubAddress || '',
       hubPhone: hubData?.phone || existing.hubPhone || o.hubPhone || '',
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

    finalUnique = Array.from(orderMap.values()).sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a));
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

 const filtered = orders.filter(o => {
   const displayId = o.orderNumber || o.orderId || o.id || '';
   const customer = o.customer || {};
   const cName = customer.name || '';
   const cPhone = customer.phone || '';
   const subs = subOrdersByOrder.get(displayId) || [];
   const status = deriveStatus(o, subs);
   const q = search.toLowerCase();
   const cCity = customer.city || o.city || '';
   const cPin = customer.pincode || o.pincode || '';
   const matchSearch = !q || displayId.toLowerCase().includes(q) || cName.toLowerCase().includes(q) || cPhone.includes(q) || cCity.toLowerCase().includes(q) || cPin.includes(q);
   const matchStatus = !statusFilter || (statusFilter === 'READY_FOR_DELIVERY' ? (status === 'READY_FOR_DELIVERY' || o.deliveryStatus === 'READY_FOR_DELIVERY') : statusFilter === 'QC_APPROVED' ? (status === 'QC_APPROVED' || o.qcStatus === 'QC_APPROVED') : status === statusFilter);
   return matchSearch && matchStatus;
  }).sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a));

 function careBadge(cat?: string) {
  const raw = (cat || 'PREMIUM').toUpperCase();
  const c = raw.includes('SIGNATURE') || raw === 'GOLD' ? 'SIGNATURE' : raw.includes('PRISTINE') || raw === 'ORANGE' || raw === 'YELLOW' ? 'PRISTINE' : 'PREMIUM';
  const icon = c === 'SIGNATURE' ? '👑' : c === 'PRISTINE' ? '✨' : '💎';
  const label = c === 'SIGNATURE' ? 'Signature' : c === 'PRISTINE' ? 'Pristine' : 'Premium';
  const color = tierColor[c];
  const bg = tierBg[c];
  const border = c === 'SIGNATURE' ? '#fde68a' : c === 'PRISTINE' ? '#fed7aa' : '#bfdbfe';
  return (
   <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, color, border: `1px solid ${border}`, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
    {icon} {label}
   </span>
  );
 }

 function customerLabel(name: string, category?: string) {
  const c = (category || '').toLowerCase();
  const isPrime = c.includes('prime') || c.includes('privé');
  const isSignature = c.includes('signature');
  return (
   <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
    <span style={{ color: '#0f172a', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
     {name || 'Customer'}
    </span>
    {isPrime && (
     <span style={{ fontSize: 9, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 5px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>
      PRIME
     </span>
    )}
    {isSignature && (
     <span style={{ fontSize: 9, background: '#f3e8ff', color: '#7e22ce', border: '1px solid #e9d5ff', padding: '1px 5px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>
      SIGNATURE
     </span>
    )}
   </div>
  );
 }

 const statusCounts = React.useMemo(() => {
  const counts: Record<string, number> = { '': orders.length };
  orders.forEach(o => {
   const displayId = o.orderNumber || o.orderId || o.id || '';
   const subs = subOrdersByOrder.get(displayId) || [];
   const st = deriveStatus(o, subs);
   counts[st] = (counts[st] || 0) + 1;
   if (st === 'READY_FOR_DELIVERY' || o.deliveryStatus === 'READY_FOR_DELIVERY') {
    counts['READY_FOR_DELIVERY'] = (counts['READY_FOR_DELIVERY'] || 0) + 1;
   }
  });
  return counts;
 }, [orders, subOrdersByOrder]);

 return (
  <div className="page" style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 28px' }}>
   {/* Header */}
   <div className="page-header" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
    <div>
     <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a', margin: 0 }}>Orders</h1>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', background: '#e0e7ff', padding: '3px 10px', borderRadius: 12 }}>
       {filtered.length} {filtered.length === 1 ? 'order' : 'orders'}
      </span>
     </div>
     <p className="page-subtitle" style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
      Manage, monitor, and inspect operations across customer orders and partner allocations.
     </p>
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
     <button className="btn btn-primary" onClick={handleRefresh} disabled={refreshing} style={{ padding: '8px 16px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
      <RefreshCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> Refresh
     </button>
     <button className="btn btn-secondary" onClick={handleResetAll} disabled={resetting} style={{ padding: '8px 16px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }} title="Delete all sub-orders and re-create based on current partner categories">
      <RotateCcw size={15} /> {resetting ? 'Resetting...' : 'Reset & Reassign'}
     </button>
     <button className="btn btn-outline" onClick={handleCleanupDuplicates} disabled={cleaningUp} style={{ padding: '8px 16px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }} title="Remove duplicate sub-orders from Firestore">
      <Trash2 size={15} /> {cleaningUp ? 'Cleaning...' : 'Cleanup Duplicates'}
     </button>
    </div>
   </div>

   {/* Filter Tabs with Live Counts */}
   <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
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
    ].map(chip => {
     const count = statusCounts[chip.value] ?? (chip.value === '' ? orders.length : 0);
     const isActive = statusFilter === chip.value;
     return (
      <button
       key={chip.value}
       onClick={() => setStatusFilter(chip.value)}
       style={{
        padding: '6px 13px',
        borderRadius: 20,
        border: isActive ? '1px solid #4f46e5' : '1px solid #e2e8f0',
        background: isActive ? '#4f46e5' : '#fff',
        color: isActive ? '#fff' : '#475569',
        fontSize: 12,
        fontWeight: isActive ? 700 : 500,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        boxShadow: isActive ? '0 2px 4px rgba(79,70,229,0.2)' : '0 1px 2px rgba(0,0,0,0.02)',
        transition: 'all 0.15s ease',
       }}
      >
       <span>{chip.label}</span>
       <span
        style={{
         fontSize: 10,
         padding: '1px 6px',
         borderRadius: 10,
         background: isActive ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
         color: isActive ? '#fff' : '#64748b',
         fontWeight: 700,
        }}
       >
        {count}
       </span>
      </button>
     );
    })}
   </div>

   {/* Search & Status Filter Controls */}
   <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center' }}>
    <div style={{ position: 'relative', flex: 1 }}>
     <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
     <input
      type="text"
      placeholder="Search by order ID, customer name, partner, or garments..."
      value={search}
      onChange={e => setSearch(e.target.value)}
      style={{
       width: '100%',
       padding: '9px 36px 9px 38px',
       border: '1px solid #e2e8f0',
       borderRadius: 8,
       fontSize: 13,
       background: '#fff',
       outline: 'none',
       boxSizing: 'border-box',
       boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}
     />
     {search && (
      <button
       type="button"
       onClick={() => setSearch('')}
       style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}
      >
       &times;
      </button>
     )}
    </div>
    <select
     value={statusFilter}
     onChange={e => setStatusFilter(e.target.value)}
     style={{
      padding: '9px 14px',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      fontSize: 13,
      background: '#fff',
      color: '#334155',
      fontWeight: 500,
      cursor: 'pointer',
      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
      minWidth: 150
     }}
    >
     {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === 'READY_FOR_DELIVERY' ? 'Ready to Deliver' : s === 'QC_APPROVED' ? 'QC Approved' : s === 'QC_PENDING' ? 'QC Pending' : s === 'IN_PROCESS' ? 'In Progress' : s || 'All Statuses'}</option>)}
    </select>
   </div>

   {/* Clean Aligned Orders Table */}
   {loading ? (
    <div className="loading-screen"><div className="loading-spinner" /></div>
   ) : filtered.length === 0 ? (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
     <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>No orders found</div>
     <div style={{ fontSize: 13 }}>Try clearing your search query or status filter.</div>
    </div>
   ) : (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
     <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth: 980 }}>
       {/* Table Header */}
       <div style={{
        display: 'grid',
        gridTemplateColumns: '36px minmax(210px, 1.4fr) minmax(180px, 1.2fr) 140px 85px 135px 95px 75px',
        alignItems: 'center',
        padding: '12px 18px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        fontSize: 11,
        fontWeight: 700,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.04em'
       }}>
        <div></div>
        <div>Order & Customer</div>
        <div>Partner Assigned</div>
        <div>Care Category</div>
        <div>Items</div>
        <div>Status</div>
        <div>Date</div>
        <div style={{ textAlign: 'right' }}>Action</div>
       </div>

       {/* Order Rows */}
       {filtered.map(order => {
        const displayId = order.orderNumber || order.orderId || order.id || '—';
        const customer = order.customer || {};
        const garments: Garment[] = order.garments || [];
        const cats = garments.map(g => String(g.garmentCategory || g.category || 'GOLD')).filter((v, i, a) => a.indexOf(v) === i);
        const isOpen = expanded.has(displayId);
        const subs = subOrdersByOrder.get(displayId) || [];
        const criticalCount = countCritical(garments);
        const reassignedCount = countReassigned(garments);

        return (
         <div
          key={displayId}
          style={{
           borderBottom: isOpen ? '2px solid #cbd5e1' : '1px solid #f1f5f9',
           background: isOpen ? '#f5f7ff' : '#fff',
           transition: 'all 0.15s ease'
          }}
         >
          {/* Main Row */}
          <div
           style={{
            display: 'grid',
            gridTemplateColumns: '36px minmax(210px, 1.4fr) minmax(180px, 1.2fr) 140px 85px 135px 95px 75px',
            alignItems: 'center',
            padding: '13px 18px',
            cursor: 'pointer',
            background: isOpen ? '#eef2ff' : '#fff',
            borderLeft: isOpen ? '4px solid #4f46e5' : '4px solid transparent',
            boxShadow: isOpen ? '0 1px 3px rgba(79,70,229,0.06)' : 'none',
            transition: 'background 0.15s ease, border-color 0.15s ease'
           }}
           onClick={() => toggleExpand(displayId)}
           onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = '#f8fafc'; }}
           onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = '#fff'; }}
          >
           {/* 1. Chevron toggle */}
           <div
            style={{
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center',
             width: 24,
             height: 24,
             borderRadius: 6,
             background: isOpen ? '#4f46e5' : '#f1f5f9',
             color: isOpen ? '#ffffff' : '#64748b',
             boxShadow: isOpen ? '0 2px 4px rgba(79,70,229,0.25)' : 'none',
             transition: 'all 0.15s ease'
            }}
           >
            {isOpen ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} />}
           </div>

           {/* 2. Order Code + Customer Subscript */}
           <div style={{ minWidth: 0, paddingRight: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
             <Link
              to={`/orders/${displayId}`}
              onClick={e => e.stopPropagation()}
              style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: '#4338ca', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
             >
              {displayId}
             </Link>
             {(criticalCount > 0 || reassignedCount > 0) && (
              <div style={{ display: 'inline-flex', gap: 4 }}>
               {criticalCount > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', padding: '1px 5px', borderRadius: 4 }}>
                 !{criticalCount} Critical
                </span>
               )}
               {reassignedCount > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #bfdbfe', padding: '1px 5px', borderRadius: 4 }}>
                 ⟳{reassignedCount} Reassigned
                </span>
               )}
              </div>
             )}
            </div>

            {/* Customer Subscript & Hub */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
             <span style={{ fontSize: 12, color: '#475569', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customer.name || '—'}
             </span>
             {(order.hub?.name || (order as any).hubName || order.hub?.code || (order as any).hubCode) && (
              <span style={{ fontSize: 10, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '1px 5px', borderRadius: 4, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
               📍 {order.hub?.code || (order as any).hubCode || order.hub?.name || (order as any).hubName}
              </span>
             )}
            </div>
           </div>

           {/* 3. Partner Assigned */}
           <div style={{ minWidth: 0, paddingRight: 8 }}>
            {subs.length === 0 ? (
             <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Awaiting partner assignment</span>
            ) : (
             <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {subs.map(so => {
               const primaryCat = so.garmentCategory?.split(',')[0] || '';
               const catColor = tierColor[primaryCat] || '#6b7280';
               return (
                <div
                 key={so.id}
                 style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#334155'
                 }}
                >
                 <span style={{ width: 6, height: 6, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
                 <span style={{ fontWeight: 600 }}>{so.partnerName || 'Partner'}</span>
                 <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>({so.partnerCode})</span>
                </div>
               );
              })}
             </div>
            )}
           </div>

           {/* 4. Care Category */}
           <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', paddingRight: 8 }}>
            {careBadge(order.careCategory)}
           </div>

           {/* 5. Items */}
           <div>
            <span style={{ fontSize: 11, color: '#475569', fontWeight: 600, background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, display: 'inline-block' }}>
             {garments.length} {garments.length === 1 ? 'item' : 'items'}
            </span>
           </div>

           {/* 6. Status */}
           <div>
            {(() => {
             const badge = getBadgeInfo(deriveStatus(order, subs));
             return (
              <span style={{
               fontSize: 11,
               padding: '3px 9px',
               background: badge.bg,
               color: badge.color,
               border: `1px solid ${badge.border}`,
               borderRadius: 6,
               fontWeight: 700,
               display: 'inline-flex',
               alignItems: 'center',
               gap: 5,
               letterSpacing: '0.02em',
               whiteSpace: 'nowrap'
              }}>
               <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color }} />
               {badge.label}
              </span>
             );
            })()}
           </div>

           {/* 7. Date */}
           <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
            {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
           </div>

           {/* 8. Action */}
           <div style={{ textAlign: 'right' }}>
            <Link
             to={`/orders/${displayId}`}
             onClick={e => e.stopPropagation()}
             style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#4f46e5',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
             }}
            >
             View
            </Link>
           </div>
          </div>

        {isOpen && (
         <div
          style={{
           background: '#f8faff',
           borderTop: '1px solid #e0e7ff',
           borderLeft: '4px solid #4f46e5',
           padding: '16px 20px',
           boxShadow: 'inset 0 2px 4px rgba(79,70,229,0.02)'
          }}
         >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
           <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Partner Work Orders ({subs.length})</span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, textTransform: 'none' }}>• Individual partner progress & quality journey</span>
           </div>
          </div>

          {subs.length === 0 ? (
           <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            No partners assigned yet for this order.
           </div>
          ) : (
           <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {subs.map((so) => {
             const soGarments = garments.filter(g => so.garmentIds.includes(g.garmentId));
             const primaryCat = so.garmentCategory?.split(',')[0] || '';
             const color = tierColor[primaryCat] || '#4f46e5';
             const bg = tierBg[primaryCat] || '#f3f4f6';
             const total = soGarments.length || 1;
             const isDone = so.status === 'COMPLETED' || so.status === 'DELIVERED' || so.status === 'READY_FOR_DELIVERY' || so.status === 'QC_APPROVED';
             const done = isDone ? total : so.status === 'IN_PROCESS' || so.status === 'QC_PENDING' || so.status === 'QC_SENT' ? Math.max(1, Math.round(total / 2)) : 0;
             const pct = Math.round((done / total) * 100);

             // Find QC record for this sub-order or order
             const soQcRecord = qcRecordsByOrder.get(so.id) || qcRecordsByOrder.get(so.subOrderCode) || qcRecordsByOrder.get(order.id) || qcRecordsByOrder.get(displayId);
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
               {/* Partner Card Top Header */}
               <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                 <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', marginBottom: 1 }}>{so.subOrderCode}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                   <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{so.partnerName || 'Unassigned'}</span>
                   <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontWeight: 600 }}>{so.partnerCode}</span>
                   {primaryCat && (
                    <span style={{ background: bg, color, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: `1px solid ${color}35` }}>
                     {primaryCat}
                    </span>
                   )}
                   {(so.distanceKm != null || so.distanceFromHub) && (
                    <span style={{ fontSize: 10, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: 4, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                     📍 {so.distanceFromHub || `${so.distanceKm} km`}
                    </span>
                   )}
                   <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                    • {so.garmentIds.length} garment{so.garmentIds.length !== 1 ? 's' : ''}
                   </span>
                  </div>
                 </div>

                 {/* Critical / Reassigned indicators */}
                 {(() => {
                  const soCritical = soGarments.filter(g => isGarmentCritical(g)).length;
                  const soReas = soGarments.filter(g => isGarmentReassigned(g)).length;
                  return (
                   <div style={{ display: 'flex', gap: 5 }}>
                    {soCritical > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#dc2626', padding: '1px 6px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={9} /> {soCritical} Critical</span>}
                    {soReas > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '1px 6px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 2 }}><RefreshCw size={9} /> {soReas} Reassigned</span>}
                   </div>
                  );
                 })()}
                </div>

                {/* Right Side Actions & Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                 {/* Garment progress */}
                 <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500, marginBottom: 2 }}>
                   <span>{done}/{total}</span> • <strong style={{ color: pct === 100 ? '#16a34a' : '#0f172a' }}>{pct}%</strong>
                  </div>
                  <div style={{ height: 4, width: 90, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
                   <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : color, borderRadius: 2, transition: 'width 0.3s' }}></div>
                  </div>
                 </div>

                 {/* Status Pill */}
                 {(() => {
                  const b = getBadgeInfo(so.status);
                  return (
                   <span style={{ fontSize: 10, padding: '3px 8px', background: b.bg, color: b.color, border: `1px solid ${b.border}`, borderRadius: 5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: b.color }} />
                    {b.label}
                   </span>
                  );
                 })()}

                 {/* View Modal Trigger */}
                 <button
                  onClick={() => setViewModal({ open: true, subOrder: so, garments: soGarments, order: order })}
                  style={{
                   padding: '4px 10px',
                   borderRadius: 5,
                   border: '1px solid #cbd5e1',
                   background: '#fff',
                   fontSize: 11,
                   fontWeight: 600,
                   color: '#4338ca',
                   cursor: 'pointer',
                   display: 'inline-flex',
                   alignItems: 'center',
                   gap: 3,
                   boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}
                 >
                  View Details
                 </button>
                </div>
               </div>

               {/* Partner In-Card Lifecycle Stepper (Crisp, Compact, Label Only) */}
               <div style={{ padding: '8px 14px 10px', background: '#fafbfc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                 <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                  Lifecycle
                 </div>
                 <div style={{ fontSize: 10, color: completedSteps === totalSteps ? '#166534' : '#4338ca', fontWeight: 600 }}>
                  {completedSteps} of {totalSteps} complete ({partnerPct}%)
                 </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
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
                      width: 17,
                      height: 17,
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
                     {isDone ? <Check size={10} strokeWidth={3} /> : isRej ? <XCircle size={10} /> : st.stepNum}
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
                      padding: '1px 4px',
                      borderRadius: 3,
                      background: badgeBg,
                      color: badgeColor,
                      letterSpacing: '0.02em',
                      flexShrink: 0
                     }}
                    >
                     {st.badgeText}
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
        )}
       </div>
      );
     })}
     </div>
    </div>
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
