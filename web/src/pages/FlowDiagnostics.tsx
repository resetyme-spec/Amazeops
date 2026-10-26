import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Workflow, ArrowRight, CheckCircle2, AlertTriangle, XCircle, Clock,
  RefreshCw, FileCode, Database, ExternalLink, Activity, Search,
  ZoomIn, ZoomOut, RotateCcw, ShieldAlert, Truck, ChevronRight,
  User, Check, X, Info, Sparkles, HelpCircle
} from 'lucide-react';
import type { Order, Partner, SubOrder } from '../types';

export interface ApiFieldMapping {
  field: string;
  key: string;
  example: string;
  description: string;
  highlight?: boolean;
}

interface MindMapNode {
  id: string;
  parentId?: string;
  badge: string;
  badgeColor: string;
  title: string;
  subtitle: string;
  simpleExplanation: string;
  whoDoesThis: string;
  whatHappensNext: string;
  appStatus: string;
  codeFile: string;
  icon?: string;
  highlight?: boolean;
  apiPayload?: ApiFieldMapping[];
  rawJsonSample?: any;
}

export default function FlowDiagnostics() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [subOrders, setSubOrders] = useState<SubOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState<'multi_partner' | 'partner_reject' | 'happy_path'>('multi_partner');
  const [selectedNode, setSelectedNode] = useState<MindMapNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [searchFilter, setSearchFilter] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const ordersSnap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100)));
      const ordersList = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(ordersList);

      const partnersSnap = await getDocs(collection(db, 'partners'));
      setPartners(partnersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Partner)));

      const subsSnap = await getDocs(collection(db, 'subOrders'));
      setSubOrders(subsSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubOrder)));
    } catch (e) {
      console.error('Failed to load flow data:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Live order counts
  const liveCounts = {
    total: orders.length,
    assigned: subOrders.filter(s => s.status === 'ASSIGNED').length,
    inProcess: subOrders.filter(s => s.status === 'IN_PROCESS' || s.status === 'IN_PROGRESS').length,
    criticalWaiting: orders.filter(o => (o.garments || []).some(g => g.isCritical === true && !g.adminCriticalComment && g.criticalStatus !== 'REASSIGNED')).length,
    qcSent: orders.filter(o => o.status === 'QC_SENT' || o.status === 'QC_PENDING' || o.qcStatus === 'QC_PENDING').length,
    qcRejected: orders.filter(o => o.status === 'QC_REJECTED' || o.qcStatus === 'QC_REJECTED' || (o.garments || []).some(g => g.qcStatus === 'QC_REJECTED')).length,
    readyDelivery: orders.filter(o => o.status === 'READY_FOR_DELIVERY' || o.deliveryStatus === 'READY_FOR_DELIVERY').length,
    delivered: orders.filter(o => o.status === 'DELIVERED').length,
  };

  // Node details dictionary for easy plain-English modal
  const NODE_DETAILS: Record<string, MindMapNode> = {
    order_api: {
      id: 'order_api',
      badge: 'API INGEST',
      badgeColor: '#8b5cf6',
      title: '1. Order Arrives from API / App',
      subtitle: 'ORD-1791437397061-2232 · rambna (Signature Care)',
      simpleExplanation: 'Customer creates an order on the mobile app or front-desk store. The external API pushes the order payload containing customer profile (rambna, Signature Care tier) and individual garment entries with unique tracking barcodes (e.g. GAR-1791364294617-908, SHIRT, category GOLD).',
      whoDoesThis: 'API Integration / Front-desk Counter / Customer App',
      whatHappensNext: 'System reads garment category (GOLD) and splits order to appropriate partner tier.',
      appStatus: 'NEW / RECEIVED',
      codeFile: 'web/src/lib/api.ts:normalizeOrder ➔ web/src/pages/Orders.tsx',
      rawJsonSample: {
        id: 12,
        order_no: 'ORD-1791437397061-2232',
        customer_name: 'rambna',
        customer_phone: '+91 98765 43210',
        customer_category: 'Signature Care',
        care_category: 'Normal',
        status: 'RECEIVED',
        garment_id_code: 'GAR-1791364294617-908',
        qr_code: 'QR-1791364294617',
        garment_type: 'SHIRT',
        category: 'GOLD',
        service_type: 'Wash & Iron',
        created_at: '2026-10-16T13:58:50'
      },
      apiPayload: [
        { field: 'Order ID', key: 'id', example: '12', description: 'Internal primary key sequence in the database' },
        { field: 'Order Number', key: 'order_no', example: 'ORD-1791437397061-2232', description: 'Unique customer tracking order reference printed on receipts & tags', highlight: true },
        { field: 'Customer Name', key: 'customer_name', example: 'rambna', description: 'Name of the client used for packaging & doorstep handover' },
        { field: 'Customer Phone', key: 'customer_phone', example: '+91 98765 43210', description: 'Phone number used for SMS status alerts and damage waiver confirmation calls' },
        { field: 'Customer Category', key: 'customer_category', example: 'Signature Care', description: 'VIP customer tier (Signature Care / Prime / Regular)', highlight: true },
        { field: 'Care Category', key: 'care_category', example: 'Normal', description: 'Overall order handling priority policy' },
        { field: 'Order Status', key: 'status', example: 'RECEIVED', description: 'Initial state when order is created in database', highlight: true },
        { field: 'Garment ID', key: 'garment_id_code', example: 'GAR-1791364294617-908', description: 'Unique serial code for this specific shirt (used for Re-QC & critical tracking)', highlight: true },
        { field: 'Garment QR Code', key: 'qr_code', example: 'QR-1791364294617', description: 'Physical scannable barcode printed on garment tag for partner scan-in', highlight: true },
        { field: 'Garment Type', key: 'garment_type', example: 'SHIRT', description: 'Garment classification (Shirt, Saree, Suit, Kurta)' },
        { field: 'Garment Category', key: 'category', example: 'GOLD', description: 'Fabric care tier: GOLD routes to Partner 1; BLUE routes to Partner 2', highlight: true },
        { field: 'Service Type', key: 'service_type', example: 'Wash & Iron', description: 'Requested cleaning process (Wash & Iron / Dry Clean / Premium Press)' },
        { field: 'Created Date', key: 'created_at', example: 'Order creation timestamp', description: 'Intake time for SLA countdown & turnaround tracking' }
      ]
    },
    splitting_engine: {
      id: 'splitting_engine',
      badge: 'CONDITIONS & RULES',
      badgeColor: '#3b82f6',
      title: '2. Split Order by Rules & Conditions',
      subtitle: 'Auto-groups garments by category (GOLD ➔ Partner 1, BLUE ➔ Partner 2)',
      simpleExplanation: 'System reads garment category:\n• Category GOLD (e.g. Silk Sarees, Gold SHIRT GAR-1791364294617-908) ➔ Routed to Partner 1 (Gold certified facility).\n• Category BLUE (e.g. Daily Cotton Shirts) ➔ Routed to Partner 2 (Blue certified facility).\nAll barcode tags (qr_code) and garment codes (garment_id_code) are retained to ensure individual item traceability.',
      whoDoesThis: 'Amaze Ops Automatic Engine (assignment.ts)',
      whatHappensNext: 'Creates distinct Sub-Orders (e.g. ORD-1791437397061-2232-P1-1 and ORD-1791437397061-2232-P2-2).',
      appStatus: 'ASSIGNED',
      codeFile: 'web/src/lib/assignment.ts:assignGarmentsToPartners',
      apiPayload: [
        { field: 'Rule: Category = GOLD', key: 'category', example: 'GOLD', description: 'Auto-routed to Partner 1 (Gold tier specialist facility)', highlight: true },
        { field: 'Rule: Category = BLUE', key: 'category', example: 'BLUE', description: 'Auto-routed to Partner 2 (Standard wash & iron facility)' },
        { field: 'Barcode Preservation', key: 'qr_code', example: 'QR-1791364294617', description: 'Preserved on Sub-Order so partner scans and verifies upon arrival', highlight: true },
        { field: 'Garment Identity', key: 'garment_id_code', example: 'GAR-1791364294617-908', description: 'Retained for individual garment defect tracking, re-QC modal, and packing' }
      ]
    },
    p1_assigned: {
      id: 'p1_assigned',
      badge: 'SUB-ORDER 1',
      badgeColor: '#d97706',
      title: '3A. Sub-Order 1 ➔ Partner 1 (Gold / Silk)',
      subtitle: 'Assigned to high-end specialist facility',
      simpleExplanation: 'Contains delicate garments like Silk Sarees & Designer suits. Sent to Partner 1 who has Gold certification.',
      whoDoesThis: 'System allocates to Partner 1',
      whatHappensNext: 'Appears in Partner 1 mobile app under the "Assigned" tab.',
      appStatus: 'ASSIGNED',
      codeFile: 'subOrders collection (Firestore)',
    },
    p2_assigned: {
      id: 'p2_assigned',
      badge: 'SUB-ORDER 2',
      badgeColor: '#2563eb',
      title: '3B. Sub-Order 2 ➔ Partner 2 (Blue / Daily)',
      subtitle: 'Assigned to standard laundry facility',
      simpleExplanation: 'Contains daily wear cotton shirts and trousers. Sent to Partner 2 who handles Blue tier wash & iron.',
      whoDoesThis: 'System allocates to Partner 2',
      whatHappensNext: 'Appears in Partner 2 mobile app under the "Assigned" tab.',
      appStatus: 'ASSIGNED',
      codeFile: 'subOrders collection (Firestore)',
    },
    p1_accepts: {
      id: 'p1_accepts',
      badge: 'ACCEPTED',
      badgeColor: '#16a34a',
      title: '4A. Partner 1 Taps "Accept"',
      subtitle: 'Partner 1 confirms receiving garments',
      simpleExplanation: 'Partner 1 checks the clothes parcel and clicks Accept Order in the Partner App.',
      whoDoesThis: 'Partner 1 Laundry Manager',
      whatHappensNext: 'Status moves to IN_PROCESS. Work begins in Partner 1 workshop.',
      appStatus: 'IN_PROCESS',
      codeFile: 'partner-app/src/pages/OrderDetail.jsx:handleAccept',
    },
    p1_rejects: {
      id: 'p1_rejects',
      badge: 'REJECT EXIT',
      badgeColor: '#dc2626',
      title: '4-ALT. What if Partner 1 Rejects?',
      subtitle: 'Partner unable to take order (boiler down, at capacity)',
      simpleExplanation: 'If Partner 1 machine is broken or workload is full, they tap "Reject Order" and enter the reason.',
      whoDoesThis: 'Partner 1',
      whatHappensNext: 'Sub-order marked REJECTED. It immediately returns to Admin Orders screen so Admin can reassign to Partner 3.',
      appStatus: 'REJECTED (Re-assigned by Admin)',
      codeFile: 'partner-app/src/lib/api.js:rejectOrder',
    },
    p2_accepts: {
      id: 'p2_accepts',
      badge: 'ACCEPTED ALL',
      badgeColor: '#16a34a',
      title: '4B. Partner 2 Accepts All Clothes',
      subtitle: 'Normal processing for daily wear shirts',
      simpleExplanation: 'Partner 2 accepts all cotton shirts and trousers without issue. Washes and steam presses them normally.',
      whoDoesThis: 'Partner 2 Laundry Manager',
      whatHappensNext: 'Moves to In-Process ➔ Uploads QC photos when done.',
      appStatus: 'IN_PROCESS',
      codeFile: 'partner-app/src/pages/OrderDetail.jsx:handleAccept',
    },
    p1_mark_critical: {
      id: 'p1_mark_critical',
      badge: 'EXCEPTION',
      badgeColor: '#ea580c',
      title: '5A. Partner 1 Marks 1 Garment as Critical',
      subtitle: 'Spotted pre-existing saree tear / stain during intake',
      simpleExplanation: 'While inspecting clothes, Partner 1 notices an old tear or burn that was already on the saree. To avoid customer blame, partner taps "Mark Critical" and uploads 3 photos.',
      whoDoesThis: 'Partner 1 Inspector',
      whatHappensNext: 'Work pauses on this saree. An alert pops up on the Admin Critical Cases dashboard.',
      appStatus: '⚠️ CRITICAL (Garment paused)',
      codeFile: 'partner-app/src/pages/OrderDetail.jsx:handleMarkCritical',
    },
    admin_critical_clears: {
      id: 'admin_critical_clears',
      badge: 'ADMIN RESOLUTION',
      badgeColor: '#9333ea',
      title: '6A. Admin Calls Customer & Clears Defect',
      subtitle: 'Admin acquires waiver & instructs partner',
      simpleExplanation: 'Admin sees the defect photos in /critical-cases, calls the customer to explain, and gets a written/verbal waiver. Admin types instructions: "Customer signed waiver. Proceed with gentle dry-clean."',
      whoDoesThis: 'Admin Operations Team',
      whatHappensNext: 'Status changes to REASSIGNED with green banner "PROCEED WITH WORK". Partner 1 safely washes the saree.',
      appStatus: '🔄 REASSIGNED (Proceed with Work)',
      codeFile: 'web/src/pages/CriticalCases.tsx',
    },
    p1_sends_qc: {
      id: 'p1_sends_qc',
      badge: 'QC SUBMIT',
      badgeColor: '#2563eb',
      title: '7A. Partner 1 Submits for QC',
      subtitle: 'Finishes cleaning & uploads 3 photos',
      simpleExplanation: 'Washing and pressing done. Partner 1 takes 3 clear photos (Front, Back, Other), types the brand name, and taps "Submit for QC".',
      whoDoesThis: 'Partner 1 QC Lead',
      whatHappensNext: 'Order moves to QC_SENT. Admin QC Team reviews photos in /qc.',
      appStatus: 'QC_SENT / QC_PENDING',
      codeFile: 'partner-app/src/pages/OrderDetail.jsx:handleSubmitQC',
    },
    p2_sends_qc: {
      id: 'p2_sends_qc',
      badge: 'QC SUBMIT',
      badgeColor: '#2563eb',
      title: '5B. Partner 2 Submits for QC',
      subtitle: 'All cotton shirts washed and pressed',
      simpleExplanation: 'Partner 2 finishes daily laundry and submits QC photos for review.',
      whoDoesThis: 'Partner 2',
      whatHappensNext: 'Admin QC approves all items.',
      appStatus: 'QC_SENT / QC_PENDING',
      codeFile: 'partner-app/src/pages/OrderDetail.jsx:handleSubmitQC',
    },
    admin_qc_rejects: {
      id: 'admin_qc_rejects',
      badge: 'QC REJECTED',
      badgeColor: '#dc2626',
      title: '8A. Admin QC Rejects 1 Garment (Defect Found)',
      subtitle: 'Inspector spots collar oil stain or heavy wrinkles',
      simpleExplanation: 'Admin QC inspector examines the photos in /qc and notices an oil stain remains on 1 suit. Admin rejects ONLY that garment and attaches photo evidence.',
      whoDoesThis: 'Admin QC Inspector (/qc)',
      whatHappensNext: 'Order status becomes QC_REJECTED. Partner App is alerted to rework the defective item.',
      appStatus: 'QC_REJECTED (Garment-level defect)',
      codeFile: 'web/src/pages/QC.tsx:handleRejectQC',
    },
    p1_reqc_modal: {
      id: 'p1_reqc_modal',
      badge: 'REWORK WORKFLOW',
      badgeColor: '#ea580c',
      title: '9A. Garment-Wise Re-QC & Modal Rework',
      subtitle: 'Partner sees "2 Rejected · 2 Passed" & taps [View & Re-QC]',
      simpleExplanation: 'Partner App shows clean minimal summary tag "2 Rejected · 2 Passed". Passed garments stay untouched. Partner taps orange [View & Re-QC] on rejected suit, sees admin photo, re-washes it, attaches 3 rework photos, and submits Re-QC for that suit.',
      whoDoesThis: 'Partner 1 Dry Cleaner',
      whatHappensNext: 'Rework is submitted strictly for that garment via submitGarmentReQC(). Loops back to Admin QC review.',
      appStatus: 'QC_SENT (Re-QC Review)',
      codeFile: 'partner-app/src/lib/api.js:submitGarmentReQC',
    },
    p1_qc_approved: {
      id: 'p1_qc_approved',
      badge: 'QC PASSED',
      badgeColor: '#16a34a',
      title: '10A. Partner 1 Rework Approved ✓',
      subtitle: 'Admin certifies all Gold garments meet standard',
      simpleExplanation: 'Admin checks the new photos: stain removed and pressing perfect! Admin taps Approve.',
      whoDoesThis: 'Admin QC Inspector',
      whatHappensNext: 'Sub-Order 1 marked QC_APPROVED.',
      appStatus: 'QC_APPROVED',
      codeFile: 'web/src/pages/QC.tsx:handleApproveQC',
    },
    p2_qc_approved: {
      id: 'p2_qc_approved',
      badge: 'QC PASSED',
      badgeColor: '#16a34a',
      title: '6B. Partner 2 Approved on First Try ✓',
      subtitle: 'All daily cottons verified clean',
      simpleExplanation: 'Admin inspects Partner 2 shirts: all clean, no wrinkles. Approved immediately.',
      whoDoesThis: 'Admin QC Inspector',
      whatHappensNext: 'Sub-Order 2 marked QC_APPROVED.',
      appStatus: 'QC_APPROVED',
      codeFile: 'web/src/pages/QC.tsx:handleApproveQC',
    },
    reconvergence_delivery: {
      id: 'reconvergence_delivery',
      badge: 'FINAL DISPATCH',
      badgeColor: '#10b981',
      title: '11. Both Approved ➔ Initiate Delivery ➔ Delivered',
      subtitle: 'Ready to Deliver unlocked ➔ Rider collects & delivers to customer',
      simpleExplanation: 'Now that BOTH Partner 1 and Partner 2 passed QC, the green "Initiate Delivery" button unlocks. Partner taps it ➔ status becomes READY_FOR_DELIVERY ➔ Logistics rider collects bagged clothes and delivers to customer doorstep (DELIVERED).',
      whoDoesThis: 'Partners tap Initiate Delivery ➔ Rider delivers to Client',
      whatHappensNext: 'Order marked DELIVERED and completed!',
      appStatus: 'READY_FOR_DELIVERY ➔ DELIVERED',
      codeFile: 'partner-app/src/lib/api.js:initiateDelivery',
    }
  };

  const handleCardClick = (id: string) => {
    if (NODE_DETAILS[id]) {
      setSelectedNode(NODE_DETAILS[id]);
    }
  };

  const isMatched = (text: string) => {
    if (!searchFilter) return false;
    return text.toLowerCase().includes(searchFilter.toLowerCase());
  };

  return (
    <div style={{ padding: '20px 28px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.05em' }}>
              INTERACTIVE VISUAL MIND MAP
            </span>
            <span style={{ fontSize: 12, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
              Click any node to see plain-English explanation
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '4px 0 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Workflow size={24} color="#2563eb" />
            <span>End-to-End Operational Mind Map (Branching Graph)</span>
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            Visualizes multi-partner splitting, accept vs reject, critical defect waiver loop, and QC rejection rework.
          </p>
        </div>

        {/* Controls: Search, Zoom & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Search filter */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search (e.g. critical, reject)..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              style={{ padding: '6px 10px 6px 28px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6, width: 210 }}
            />
          </div>

          {/* Zoom controls */}
          <div style={{ display: 'flex', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden' }}>
            <button
              onClick={() => setZoomLevel(prev => Math.min(1.2, prev + 0.1))}
              style={{ padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer', borderRight: '1px solid #e2e8f0' }}
              title="Zoom In"
            >
              <ZoomIn size={14} color="#475569" />
            </button>
            <button
              onClick={() => setZoomLevel(prev => Math.max(0.7, prev - 0.1))}
              style={{ padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer', borderRight: '1px solid #e2e8f0' }}
              title="Zoom Out"
            >
              <ZoomOut size={14} color="#475569" />
            </button>
            <button
              onClick={() => { setZoomLevel(1); setSearchFilter(''); }}
              style={{ padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer' }}
              title="Reset Zoom"
            >
              <RotateCcw size={14} color="#475569" />
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}
          >
            <RefreshCw size={13} className={loading ? 'spinning' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Scenario Selector Strip */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 16px',
        marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Select Mind Map Scenario:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setSelectedScenario('multi_partner')}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: selectedScenario === 'multi_partner' ? '#2563eb' : '#f1f5f9',
                color: selectedScenario === 'multi_partner' ? '#ffffff' : '#475569'
              }}
            >
              ⭐ Full Multi-Partner Flow (Critical + QC Re-QC Rework)
            </button>
            <button
              onClick={() => setSelectedScenario('partner_reject')}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: selectedScenario === 'partner_reject' ? '#dc2626' : '#f1f5f9',
                color: selectedScenario === 'partner_reject' ? '#ffffff' : '#475569'
              }}
            >
              ❌ Partner Rejection Scenario (Escape & Reassignment)
            </button>
            <button
              onClick={() => setSelectedScenario('happy_path')}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: selectedScenario === 'happy_path' ? '#16a34a' : '#f1f5f9',
                color: selectedScenario === 'happy_path' ? '#ffffff' : '#475569'
              }}
            >
              ✓ Happy Path (All pass on 1st attempt)
            </button>
          </div>
        </div>

        {/* Live status badge */}
        <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 10 }}>
          <span>Live in DB: <strong>{liveCounts.total} orders</strong></span>
          <span>In Process: <strong style={{ color: '#d97706' }}>{liveCounts.inProcess}</strong></span>
          <span>QC Rejected: <strong style={{ color: '#dc2626' }}>{liveCounts.qcRejected}</strong></span>
        </div>
      </div>

      {/* MIND MAP HORIZONTAL TREE CANVAS */}
      <div style={{
        background: '#ffffff',
        border: '1.5px solid #cbd5e1',
        borderRadius: 16,
        padding: 24,
        overflowX: 'auto',
        overflowY: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        transform: `scale(${zoomLevel})`,
        transformOrigin: 'top left',
        transition: 'transform 0.15s ease'
      }}>
        
        {/* Mind Map Tree Container */}
        <div style={{ minWidth: 1350, display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* LEVEL 1: ROOT NODE (ORDER FROM API) */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              onClick={() => handleCardClick('order_api')}
              style={{
                width: 260,
                background: isMatched('order') ? '#f3e8ff' : '#faf5ff',
                border: '2px solid #8b5cf6',
                borderRadius: 12,
                padding: 14,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(139, 92, 246, 0.15)',
                transition: 'transform 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 800, background: '#8b5cf6', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
                  STEP 1 · ROOT
                </span>
                <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>Tap for info ➔</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#5b21b6' }}>
                📦 Order Arrives from API
              </div>
              <div style={{ fontSize: 11, color: '#6d28d9', marginTop: 4, background: '#ede9fe', padding: '6px 8px', borderRadius: 6, lineHeight: 1.4 }}>
                <strong>ORD-1791437397061-2232</strong><br />
                <span style={{ color: '#4c1d95' }}>rambna · Signature Care</span><br />
                <span style={{ fontSize: 10, color: '#6b21a8' }}>GAR-1791364294617-908 (SHIRT · GOLD)</span>
              </div>
            </div>

            {/* Tree Branch Connector Line */}
            <div style={{ width: 40, height: 2, background: '#8b5cf6' }}></div>
            <ArrowRight size={16} color="#8b5cf6" style={{ marginLeft: -6, marginRight: 8 }} />

            {/* LEVEL 2: SPLITTING ENGINE */}
            <div
              onClick={() => handleCardClick('splitting_engine')}
              style={{
                width: 280,
                background: isMatched('split') ? '#dbeafe' : '#eff6ff',
                border: '2px solid #3b82f6',
                borderRadius: 12,
                padding: 14,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(59, 130, 246, 0.12)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 800, background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
                  STEP 2 · SPLIT ENGINE
                </span>
                <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>Rules ➔</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#1e40af' }}>
                ⚙️ Order Split with Partner Conditions
              </div>
              <div style={{ fontSize: 11, color: '#1d4ed8', marginTop: 2 }}>
                Checks partner tiers, priority (1&gt;2) & daily limits. Splits into 2 Sub-Orders!
              </div>
            </div>
          </div>

          {/* LEVEL 3 & ONWARDS: TWO PARALLEL BRANCHES (PARTNER 1 & PARTNER 2) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingLeft: 60, position: 'relative' }}>
            
            {/* Vertical branching bracket line */}
            <div style={{
              position: 'absolute', left: 40, top: 40, bottom: 60, width: 2, background: '#94a3b8'
            }}></div>

            {/* BRANCH 1: PARTNER 1 (GOLD / SILKS) */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 12 }}>
              {/* Horizontal line from bracket */}
              <div style={{ position: 'absolute', left: -20, width: 20, height: 2, background: '#94a3b8' }}></div>

              {/* Node 1.1: Partner 1 Sub-order */}
              <div
                onClick={() => handleCardClick('p1_assigned')}
                style={{
                  minWidth: 220, background: '#fffbeb', border: '2px solid #d97706', borderRadius: 10, padding: 12, cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, background: '#d97706', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                  SUB-ORDER 1
                </span>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#92400e', marginTop: 4 }}>
                  🏢 Partner 1 (Gold/Silks)
                </div>
                <div style={{ fontSize: 11, color: '#b45309' }}>Status: ASSIGNED</div>
              </div>

              <span>➔</span>

              {/* Node 1.2: Partner Decision (Accept or Reject) */}
              {selectedScenario === 'partner_reject' ? (
                /* REJECT SCENARIO */
                <div
                  onClick={() => handleCardClick('p1_rejects')}
                  style={{
                    minWidth: 230, background: '#fef2f2', border: '2px dashed #dc2626', borderRadius: 10, padding: 12, cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 800, background: '#dc2626', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                    REJECT EXIT
                  </span>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#b91c1c', marginTop: 4 }}>
                    ❌ Partner 1 Rejects
                  </div>
                  <div style={{ fontSize: 11, color: '#dc2626' }}>
                    Reason: "Boiler down" ➔ Returns to Admin for Reassignment!
                  </div>
                </div>
              ) : (
                /* ACCEPT SCENARIO */
                <>
                  <div
                    onClick={() => handleCardClick('p1_accepts')}
                    style={{
                      minWidth: 190, background: '#f0fdf4', border: '1.5px solid #16a34a', borderRadius: 10, padding: 12, cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 800, background: '#16a34a', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                      ACCEPTS
                    </span>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#166534', marginTop: 4 }}>
                      ✅ Accepts Order
                    </div>
                    <div style={{ fontSize: 11, color: '#15803d' }}>Status: IN_PROCESS</div>
                  </div>

                  <span>➔</span>

                  {/* Node 1.3: Critical Flagging Loop */}
                  <div
                    onClick={() => handleCardClick('p1_mark_critical')}
                    style={{
                      minWidth: 220, background: '#fff7ed', border: '2px solid #ea580c', borderRadius: 10, padding: 12, cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 800, background: '#ea580c', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                      CRITICAL CASE
                    </span>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#c2410c', marginTop: 4 }}>
                      ⚠️ Marks 1 Saree Critical
                    </div>
                    <div style={{ fontSize: 11, color: '#9a3412' }}>
                      Old tear found ➔ 3 photos taken. Work pauses.
                    </div>
                  </div>

                  <span>➔</span>

                  {/* Node 1.4: Admin Resolution */}
                  <div
                    onClick={() => handleCardClick('admin_critical_clears')}
                    style={{
                      minWidth: 220, background: '#faf5ff', border: '1.5px solid #9333ea', borderRadius: 10, padding: 12, cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 800, background: '#9333ea', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                      ADMIN CLEARS
                    </span>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#6b21a8', marginTop: 4 }}>
                      🛡️ Admin Gets Waiver
                    </div>
                    <div style={{ fontSize: 11, color: '#7e22ce' }}>
                      Status: 🔄 REASSIGNED ("Proceed with work")
                    </div>
                  </div>

                  <span>➔</span>

                  {/* Node 1.5: Sends QC */}
                  <div
                    onClick={() => handleCardClick('p1_sends_qc')}
                    style={{
                      minWidth: 180, background: '#eff6ff', border: '1.5px solid #2563eb', borderRadius: 10, padding: 12, cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 800, background: '#2563eb', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                      QC SUBMIT
                    </span>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#1e40af', marginTop: 4 }}>
                      📤 Submits for QC
                    </div>
                    <div style={{ fontSize: 11, color: '#1d4ed8' }}>Front, Back, Other photos</div>
                  </div>

                  <span>➔</span>

                  {/* Node 1.6: QC Decision (Approved vs Rejected) */}
                  {selectedScenario === 'happy_path' ? (
                    <div
                      onClick={() => handleCardClick('p1_qc_approved')}
                      style={{
                        minWidth: 190, background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 10, padding: 12, cursor: 'pointer'
                      }}
                    >
                      <span style={{ fontSize: 9, fontWeight: 800, background: '#16a34a', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                        QC PASSED
                      </span>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#166534', marginTop: 4 }}>
                        ✅ QC Approved
                      </div>
                      <div style={{ fontSize: 11, color: '#15803d' }}>Clean on first try!</div>
                    </div>
                  ) : (
                    <>
                      {/* QC REJECTED */}
                      <div
                        onClick={() => handleCardClick('admin_qc_rejects')}
                        style={{
                          minWidth: 220, background: '#fef2f2', border: '2px solid #dc2626', borderRadius: 10, padding: 12, cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 800, background: '#dc2626', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                          QC REJECTED
                        </span>
                        <div style={{ fontWeight: 800, fontSize: 13, color: '#991b1b', marginTop: 4 }}>
                          ❌ Admin Rejects Suit
                        </div>
                        <div style={{ fontSize: 11, color: '#dc2626' }}>
                          Reason: Collar stain remains
                        </div>
                      </div>

                      <span>➔</span>

                      {/* RE-QC MODAL REWORK */}
                      <div
                        onClick={() => handleCardClick('p1_reqc_modal')}
                        style={{
                          minWidth: 230, background: '#fff7ed', border: '2px solid #ea580c', borderRadius: 10, padding: 12, cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 800, background: '#ea580c', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                          GARMENT RE-QC
                        </span>
                        <div style={{ fontWeight: 800, fontSize: 13, color: '#9a3412', marginTop: 4 }}>
                          🔄 View & Re-QC Modal
                        </div>
                        <div style={{ fontSize: 11, color: '#c2410c' }}>
                          ⚠️ "2 Rejected · 2 Passed" ➔ 3 Photos re-uploaded ➔ Passed!
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* BRANCH 2: PARTNER 2 (BLUE / DAILY COTTONS) */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 12 }}>
              {/* Horizontal line from bracket */}
              <div style={{ position: 'absolute', left: -20, width: 20, height: 2, background: '#94a3b8' }}></div>

              {/* Node 2.1: Partner 2 Sub-order */}
              <div
                onClick={() => handleCardClick('p2_assigned')}
                style={{
                  minWidth: 220, background: '#eff6ff', border: '2px solid #2563eb', borderRadius: 10, padding: 12, cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, background: '#2563eb', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                  SUB-ORDER 2
                </span>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#1e40af', marginTop: 4 }}>
                  🏢 Partner 2 (Blue/Daily)
                </div>
                <div style={{ fontSize: 11, color: '#1d4ed8' }}>Status: ASSIGNED</div>
              </div>

              <span>➔</span>

              {/* Node 2.2: Accepts All */}
              <div
                onClick={() => handleCardClick('p2_accepts')}
                style={{
                  minWidth: 190, background: '#f0fdf4', border: '1.5px solid #16a34a', borderRadius: 10, padding: 12, cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, background: '#16a34a', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                  ACCEPTED ALL
                </span>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#166534', marginTop: 4 }}>
                  ✅ Accepts All Shirts
                </div>
                <div style={{ fontSize: 11, color: '#15803d' }}>Status: IN_PROCESS (Normal)</div>
              </div>

              <span>➔</span>

              {/* Node 2.3: Submits QC */}
              <div
                onClick={() => handleCardClick('p2_sends_qc')}
                style={{
                  minWidth: 180, background: '#eff6ff', border: '1.5px solid #2563eb', borderRadius: 10, padding: 12, cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, background: '#2563eb', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                  QC SUBMIT
                </span>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#1e40af', marginTop: 4 }}>
                  📤 Submits for QC
                </div>
                <div style={{ fontSize: 11, color: '#1d4ed8' }}>Washed & Pressed photos</div>
              </div>

              <span>➔</span>

              {/* Node 2.4: QC Approved */}
              <div
                onClick={() => handleCardClick('p2_qc_approved')}
                style={{
                  minWidth: 190, background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 10, padding: 12, cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, background: '#16a34a', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                  QC PASSED
                </span>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#166534', marginTop: 4 }}>
                  ✅ QC Approved
                </div>
                <div style={{ fontSize: 11, color: '#15803d' }}>Approved on first try ✓</div>
              </div>
            </div>

          </div>

          {/* LEVEL 4: RECONVERGENCE & FINAL DELIVERY */}
          <div style={{
            marginTop: 16, paddingTop: 16, borderTop: '2px dashed #94a3b8',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div
              onClick={() => handleCardClick('reconvergence_delivery')}
              style={{
                maxWidth: 600, width: '100%',
                background: '#f0fdf4',
                border: '2px solid #16a34a',
                borderRadius: 12,
                padding: 16,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16
              }}
            >
              <div>
                <span style={{ fontSize: 10, fontWeight: 800, background: '#16a34a', color: '#fff', padding: '2px 8px', borderRadius: 4 }}>
                  STEP 5 · FINAL DELIVERY
                </span>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#14532d', marginTop: 4 }}>
                  🚚 Both Sub-Orders Approved ➔ Ready to Deliver ➔ Handover to Rider ➔ Delivered
                </div>
                <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>
                  Green "Initiate Delivery" button unlocks ➔ Rider collects from facilities ➔ Customer receives clean clothes!
                </div>
              </div>
              <ChevronRight size={24} color="#16a34a" />
            </div>
          </div>

        </div>
      </div>

      {/* PLAIN-ENGLISH DETAIL DRAWER (OPENS ON NODE CLICK) */}
      {selectedNode && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }}
          onClick={() => setSelectedNode(null)}
        >
          <div
            style={{
              background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 16, maxWidth: 660, width: '100%', maxHeight: '92vh', overflowY: 'auto',
              padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.25)', position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedNode(null)}
              style={{
                position: 'absolute', right: 16, top: 16, background: '#f1f5f9', border: 'none', borderRadius: '50%',
                width: 32, height: 32, cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#475569'
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, background: selectedNode.badgeColor, color: '#fff', padding: '2px 8px', borderRadius: 4 }}>
                {selectedNode.badge}
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>App Status: <strong>{selectedNode.appStatus}</strong></span>
            </div>

            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 14px' }}>
              {selectedNode.title}
            </h2>

            {/* API Ingest Fields Table (When available) */}
            {selectedNode.apiPayload && selectedNode.apiPayload.length > 0 && (
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: 12,
                padding: 14,
                marginBottom: 16
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    📥 Incoming API Fields (Payload Schema)
                  </span>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Exact match with external API</span>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '6px 8px', fontWeight: 700, color: '#334155' }}>Field Name</th>
                        <th style={{ padding: '6px 8px', fontWeight: 700, color: '#334155' }}>API Key</th>
                        <th style={{ padding: '6px 8px', fontWeight: 700, color: '#334155' }}>Sample Value</th>
                        <th style={{ padding: '6px 8px', fontWeight: 700, color: '#334155' }}>System Usage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedNode.apiPayload.map((item, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: item.highlight ? '#fefce8' : (idx % 2 === 0 ? '#ffffff' : '#fafafa')
                          }}
                        >
                          <td style={{ padding: '6px 8px', fontWeight: item.highlight ? 800 : 600, color: item.highlight ? '#854d0e' : '#1e293b' }}>
                            {item.field}
                          </td>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                            {item.key}
                          </td>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#0f172a', fontWeight: 700 }}>
                            {item.example}
                          </td>
                          <td style={{ padding: '6px 8px', color: '#475569' }}>
                            {item.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Plain English explanation boxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <span style={{ fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 2 }}>
                  📖 What Happens Here? (In Plain English)
                </span>
                <p style={{ margin: 0, color: '#334155', lineHeight: 1.5 }}>
                  {selectedNode.simpleExplanation}
                </p>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <span style={{ fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 2 }}>
                  👤 Who Does This?
                </span>
                <p style={{ margin: 0, color: '#0369a1', fontWeight: 600 }}>
                  {selectedNode.whoDoesThis}
                </p>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <span style={{ fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 2 }}>
                  ⏭️ What Happens Next?
                </span>
                <p style={{ margin: 0, color: '#15803d', fontWeight: 600 }}>
                  {selectedNode.whatHappensNext}
                </p>
              </div>

              <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, fontSize: 11, color: '#475569' }}>
                📁 <strong>Code / Anchor:</strong> <code style={{ color: '#2563eb' }}>{selectedNode.codeFile}</code>
              </div>

            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedNode(null)}
                style={{ padding: '8px 18px', background: '#0f172a', color: '#ffffff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
