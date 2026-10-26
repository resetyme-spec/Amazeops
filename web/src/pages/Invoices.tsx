import React, { useEffect, useState } from 'react';
import {
  FileText, Plus, Eye, CheckCircle2, Clock, DollarSign,
  Printer, X, Search, Filter, AlertCircle, Building2,
  CreditCard, Calendar, RefreshCw, Trash2, ArrowUpRight
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  collection, doc, getDocs, setDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from 'firebase/firestore';
import type { Invoice, InvoiceItem, Partner, Service, Order, SubOrder, InvoiceStatus } from '../types';

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GOLD: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  ORANGE: { bg: '#ffedd5', text: '#c2410c', border: '#fdba74' },
  YELLOW: { bg: '#ffedd5', text: '#c2410c', border: '#fdba74' },
  BLUE: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
};

function getStatusBadge(status: string) {
  const s = (status || '').toUpperCase();
  if (s === 'PAID') {
    return { label: 'PAID', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
  }
  if (s === 'APPROVED') {
    return { label: 'APPROVED', bg: '#e0e7ff', color: '#4338ca', border: '#a5b4fc' };
  }
  if (s === 'REJECTED' || s === 'CANCELLED') {
    return { label: s, bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
  }
  return { label: 'PENDING APPROVAL', bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [subOrders, setSubOrders] = useState<SubOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [partnerFilter, setPartnerFilter] = useState<string>('ALL');

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    method: 'BANK_TRANSFER',
    reference: '',
    paidAt: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Generate Invoice Form State
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [scannedItems, setScannedItems] = useState<InvoiceItem[]>([]);
  const [gstRate, setGstRate] = useState<number>(18);
  const [applyGst, setApplyGst] = useState<boolean>(true);
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Load Invoices live
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
      setInvoices(list);
      setLoading(false);
    }, (err) => {
      console.warn('Invoices onSnapshot error:', err);
      // Fallback query without orderBy in case index is missing
      getDocs(collection(db, 'invoices')).then(s => {
        const list = s.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
        setInvoices(list);
      }).catch(console.error).finally(() => setLoading(false));
    });

    return () => unsub();
  }, []);

  // Load Partners & Services & SubOrders
  useEffect(() => {
    async function loadAuxData() {
      try {
        const [partnersSnap, servicesSnap, subOrdersSnap, ordersSnap] = await Promise.all([
          getDocs(collection(db, 'partners')),
          getDocs(collection(db, 'services')),
          getDocs(collection(db, 'subOrders')),
          getDocs(collection(db, 'orders')),
        ]);

        setPartners(partnersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Partner)));
        setServices(servicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Service)));
        setSubOrders(subOrdersSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubOrder)));
        setOrders(ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      } catch (e) {
        console.error('Aux data loading error:', e);
      }
    }
    loadAuxData();
  }, []);

  // Set default dates when partner selected
  const handlePartnerSelect = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
    const p = partners.find(item => item.id === partnerId);
    if (!p) return;

    const today = new Date();
    const endStr = today.toISOString().split('T')[0];
    let start = new Date();

    const period = p.billingPeriod || 'MONTHLY';
    if (period === 'WEEKLY') {
      start.setDate(today.getDate() - 7);
    } else if (period === 'FORTNIGHTLY') {
      start.setDate(today.getDate() - 15);
    } else if (period === 'CUSTOM' && p.customBillingDays) {
      start.setDate(today.getDate() - p.customBillingDays);
    } else {
      // 1 Month (30 days)
      start.setDate(today.getDate() - 30);
    }

    const startStr = start.toISOString().split('T')[0];
    setPeriodStart(startStr);
    setPeriodEnd(endStr);

    // Auto toggle GST based on GST number existence
    const hasGst = Boolean(p.gstNumber && p.gstNumber.trim().length > 0);
    setApplyGst(hasGst);
    setGstRate(hasGst ? 18 : 0);

    // Scan completed garments
    scanGarmentsForPartner(p, startStr, endStr);
  };

  // Scan completed work for the partner in date range
  const scanGarmentsForPartner = (partner: Partner, startStr: string, endStr: string) => {
    setScanning(true);
    const partnerCat = (partner.category || (partner.categoryArray && partner.categoryArray[0]) || 'GOLD').toUpperCase();

    // Match subOrders for this partner
    const matchingSubs = subOrders.filter(so => so.partnerId === partner.id || so.partnerCode === partner.partnerCode);
    const garmentIdSet = new Set<string>();
    matchingSubs.forEach(so => {
      (so.garmentIds || []).forEach(gid => garmentIdSet.add(gid));
    });

    // Collect all garments across orders
    const serviceCounts: Record<string, { count: number; gids: string[]; orderIds: string[] }> = {};

    orders.forEach(order => {
      (order.garments || []).forEach(g => {
        const isPartnerGarment = garmentIdSet.has(g.garmentId) || g.assignedPartnerId === partner.id;
        if (!isPartnerGarment) return;

        // Check if garment or sub-order is in completed/QC-approved status
        const isEligible =
          g.status === 'COMPLETED' ||
          g.status === 'DELIVERED' ||
          g.status === 'READY_FOR_DELIVERY' ||
          g.status === 'QC_APPROVED' ||
          g.qcStatus === 'QC_PASSED';

        // Filter by date if present
        const orderDate = (order.createdAt || '').slice(0, 10);
        const inRange = (!startStr || orderDate >= startStr) && (!endStr || orderDate <= endStr);

        if (inRange && (isEligible || matchingSubs.length > 0)) {
          const sName = g.serviceType || 'Standard Wash';
          if (!serviceCounts[sName]) {
            serviceCounts[sName] = { count: 0, gids: [], orderIds: [] };
          }
          serviceCounts[sName].count += 1;
          serviceCounts[sName].gids.push(g.garmentId);
          if (!serviceCounts[sName].orderIds.includes(order.id)) {
            serviceCounts[sName].orderIds.push(order.id);
          }
        }
      });
    });

    // Map service counts to rate card
    const items: InvoiceItem[] = [];

    // If no specific garments found in scanned orders, provide default line items based on partner's offered services
    if (Object.keys(serviceCounts).length === 0) {
      (partner.services || []).forEach(sName => {
        const matchedService = services.find(
          s => s.name?.toLowerCase().trim() === sName.toLowerCase().trim() || s.code === sName
        );
        let unitRate = 80;
        if (matchedService) {
          if (partnerCat === 'GOLD') unitRate = matchedService.goldRate || 100;
          else if (partnerCat === 'ORANGE' || partnerCat === 'YELLOW') unitRate = matchedService.yellowRate || 80;
          else unitRate = matchedService.blueRate || 60;
        }
        items.push({
          serviceName: sName,
          description: `${sName} (${partnerCat} tier)`,
          category: partnerCat,
          quantity: 0,
          unitPrice: unitRate,
          amount: 0,
          garmentIds: [],
          orderIds: [],
        });
      });
    } else {
      Object.entries(serviceCounts).forEach(([sName, info]) => {
        const matchedService = services.find(
          s => s.name?.toLowerCase().trim() === sName.toLowerCase().trim() || s.code === sName
        );
        let unitRate = 80;
        if (matchedService) {
          if (partnerCat === 'GOLD') unitRate = matchedService.goldRate || 100;
          else if (partnerCat === 'ORANGE' || partnerCat === 'YELLOW') unitRate = matchedService.yellowRate || 80;
          else unitRate = matchedService.blueRate || 60;
        }

        items.push({
          serviceName: sName,
          description: `${sName} (${partnerCat} rate)`,
          category: partnerCat,
          quantity: info.count,
          unitPrice: unitRate,
          amount: info.count * unitRate,
          garmentIds: info.gids,
          orderIds: info.orderIds,
        });
      });
    }

    setScannedItems(items);
    setScanning(false);
  };

  // Add a manual custom line item
  const handleAddLineItem = () => {
    setScannedItems(prev => [
      ...prev,
      {
        description: 'Custom Service / Incentive',
        quantity: 1,
        unitPrice: 100,
        amount: 100,
      },
    ]);
  };

  // Update line item
  const handleUpdateLineItem = (index: number, field: keyof InvoiceItem, val: any) => {
    setScannedItems(prev => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: val };
      if (field === 'quantity' || field === 'unitPrice') {
        item.amount = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
      }
      copy[index] = item;
      return copy;
    });
  };

  // Remove line item
  const handleRemoveLineItem = (index: number) => {
    setScannedItems(prev => prev.filter((_, i) => i !== index));
  };

  // Compute subtotal, gst, total
  const subtotal = scannedItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
  const effectiveGstRate = applyGst ? gstRate : 0;
  const gstAmount = Math.round((subtotal * effectiveGstRate) / 100);
  const totalAmount = subtotal + gstAmount;
  const totalGarments = scannedItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);

  // Submit and create invoice
  const handleCreateInvoice = async () => {
    const partner = partners.find(p => p.id === selectedPartnerId);
    if (!partner) {
      alert('Please select a partner');
      return;
    }
    if (scannedItems.length === 0) {
      alert('Please add at least one line item to the invoice.');
      return;
    }

    setGenerating(true);
    try {
      const invoiceRef = doc(collection(db, 'invoices'));
      const year = new Date().getFullYear();
      const randNum = String(Date.now()).slice(-4);
      const invoiceNumber = `INV-${year}-${partner.partnerCode || 'P'}-${randNum}`;

      const newInvoice: Partial<Invoice> = {
        id: invoiceRef.id,
        invoiceNumber,
        partnerId: partner.id,
        partnerName: partner.companyName,
        partnerCode: partner.partnerCode,
        partnerCategory: partner.category || (partner.categoryArray && partner.categoryArray[0]) || 'GOLD',
        billingPeriod: partner.billingPeriod || 'MONTHLY',
        periodStart,
        periodEnd,
        items: scannedItems,
        garmentCount: totalGarments,
        subtotal,
        gstRate: effectiveGstRate,
        gstAmount,
        total: totalAmount,
        gstNumber: partner.gstNumber || '',
        bankAccount: partner.bankAccount || { accountNumber: '', ifscCode: '', accountHolder: '' },
        status: 'PENDING_APPROVAL',
        notes: invoiceNotes || `Fulfillment payout for period ${periodStart} to ${periodEnd}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(invoiceRef, newInvoice);
      setShowGenerateModal(false);
      setSelectedPartnerId('');
      setScannedItems([]);
      alert(`Invoice ${invoiceNumber} created successfully!`);
    } catch (e: any) {
      console.error('Error creating invoice:', e);
      alert('Failed to create invoice: ' + (e.message || String(e)));
    } finally {
      setGenerating(false);
    }
  };

  // Approve invoice
  const handleApproveInvoice = async (inv: Invoice) => {
    if (!confirm(`Are you sure you want to approve invoice ${inv.invoiceNumber} for ₹${inv.total?.toLocaleString('en-IN')}?`)) return;
    try {
      await setDoc(doc(db, 'invoices', inv.id), {
        status: 'APPROVED',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      if (viewingInvoice?.id === inv.id) {
        setViewingInvoice(prev => prev ? { ...prev, status: 'APPROVED' } : null);
      }
    } catch (e: any) {
      alert('Failed to approve invoice: ' + e.message);
    }
  };

  // Open Payment modal
  const handleOpenPayment = (inv: Invoice) => {
    setShowPaymentModal(inv);
    setPaymentForm({
      method: 'BANK_TRANSFER',
      reference: `UTR${Date.now().toString().slice(-8)}`,
      paidAt: new Date().toISOString().split('T')[0],
      notes: `Payout transferred to ${inv.bankAccount?.accountHolder || inv.partnerName}`,
    });
  };

  // Submit payment
  const handleRecordPayment = async () => {
    if (!showPaymentModal) return;
    try {
      await setDoc(doc(db, 'invoices', showPaymentModal.id), {
        status: 'PAID',
        paymentDetails: {
          method: paymentForm.method,
          reference: paymentForm.reference,
          paidAt: paymentForm.paidAt,
          notes: paymentForm.notes,
        },
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      if (viewingInvoice?.id === showPaymentModal.id) {
        setViewingInvoice(prev => prev ? {
          ...prev,
          status: 'PAID',
          paymentDetails: paymentForm,
        } : null);
      }
      setShowPaymentModal(null);
    } catch (e: any) {
      alert('Failed to record payment: ' + e.message);
    }
  };

  // Delete Invoice
  const handleDeleteInvoice = async (invId: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await deleteDoc(doc(db, 'invoices', invId));
      if (viewingInvoice?.id === invId) setViewingInvoice(null);
    } catch (e: any) {
      alert('Failed to delete invoice: ' + e.message);
    }
  };

  // Metrics
  const totalInvoicedAmount = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaidAmount = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + (i.total || 0), 0);
  const pendingPayoutAmount = invoices.filter(i => i.status !== 'PAID').reduce((s, i) => s + (i.total || 0), 0);

  // Filtered invoices
  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
    if (partnerFilter !== 'ALL' && inv.partnerId !== partnerFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchNum = (inv.invoiceNumber || '').toLowerCase().includes(q);
      const matchPartner = (inv.partnerName || '').toLowerCase().includes(q);
      const matchCode = (inv.partnerCode || '').toLowerCase().includes(q);
      if (!matchNum && !matchPartner && !matchCode) return false;
    }
    return true;
  });

  const selectedPartner = partners.find(p => p.id === selectedPartnerId);

  return (
    <div className="page" style={{ padding: '24px 32px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Invoices & Payouts</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Track partner billing cycles, calculate service rate earnings, apply GST, and settle payouts
          </p>
        </div>
        <button
          onClick={() => {
            setShowGenerateModal(true);
            if (partners.length > 0 && !selectedPartnerId) {
              handlePartnerSelect(partners[0].id);
            }
          }}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontWeight: 700 }}
        >
          <Plus size={18} /> Generate Partner Invoice
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 12, fontWeight: 600 }}>
            <span>TOTAL INVOICES</span>
            <FileText size={18} color="#6366f1" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>{invoices.length}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Across {partners.length} registered partners</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 12, fontWeight: 600 }}>
            <span>TOTAL INVOICED</span>
            <DollarSign size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>₹{totalInvoicedAmount.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#0284c7', marginTop: 4 }}>Cumulative payout volume</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 12, fontWeight: 600 }}>
            <span>PENDING SETTLEMENT</span>
            <Clock size={18} color="#d97706" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706', marginTop: 8 }}>₹{pendingPayoutAmount.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            {invoices.filter(i => i.status !== 'PAID').length} invoices pending payment
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 12, fontWeight: 600 }}>
            <span>SETTLED (PAID)</span>
            <CheckCircle2 size={18} color="#16a34a" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#16a34a', marginTop: 8 }}>₹{totalPaidAmount.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>Disbursed to partner accounts</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, background: '#fff', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, background: '#f8fafc', padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search by Invoice #, Partner Name, Code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 13 }}
          />
          {searchTerm && <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>}
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="PAID">Paid</option>
          </select>
        </div>

        {/* Partner Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Partner:</span>
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer', maxWidth: 180 }}
          >
            <option value="ALL">All Partners</option>
            {partners.map(p => (
              <option key={p.id} value={p.id}>{p.companyName} ({p.partnerCode || p.category})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="table-container" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              <th style={{ padding: '14px 18px' }}>INVOICE #</th>
              <th style={{ padding: '14px 18px' }}>PARTNER</th>
              <th style={{ padding: '14px 18px' }}>BILLING CYCLE</th>
              <th style={{ padding: '14px 18px' }}>GARMENTS</th>
              <th style={{ padding: '14px 18px' }}>AMOUNT (BASE)</th>
              <th style={{ padding: '14px 18px' }}>GST</th>
              <th style={{ padding: '14px 18px' }}>TOTAL PAYOUT</th>
              <th style={{ padding: '14px 18px' }}>STATUS</th>
              <th style={{ padding: '14px 18px', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                  <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 10px', display: 'block' }} />
                  Loading invoices...
                </td>
              </tr>
            ) : filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                  <FileText size={36} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>No invoices found</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Click "Generate Partner Invoice" above to create a settlement.</div>
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv) => {
                const b = getStatusBadge(inv.status);
                const cat = (inv.partnerCategory || 'GOLD').toUpperCase();
                const catStyle = CATEGORY_COLORS[cat] || CATEGORY_COLORS.GOLD;

                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px' }}>
                      <span
                        onClick={() => setViewingInvoice(inv)}
                        style={{ fontWeight: 800, color: '#4f46e5', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        {inv.invoiceNumber} <ArrowUpRight size={13} />
                      </span>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </div>
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{inv.partnerName}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: catStyle.bg, color: catStyle.text, border: `1px solid ${catStyle.border}` }}>
                          {cat}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        {inv.partnerCode} {inv.gstNumber ? `• GST: ${inv.gstNumber}` : '• No GST'}
                      </div>
                    </td>

                    <td style={{ padding: '14px 18px', fontSize: 12, color: '#475569' }}>
                      {inv.periodStart && inv.periodEnd ? (
                        <div>
                          <div>{inv.periodStart} to {inv.periodEnd}</div>
                          <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize' }}>{inv.billingPeriod?.toLowerCase() || 'Standard'} cycle</span>
                        </div>
                      ) : (
                        <span>{inv.billingPeriod || 'Monthly'}</span>
                      )}
                    </td>

                    <td style={{ padding: '14px 18px', fontWeight: 600, color: '#334155' }}>
                      {inv.garmentCount || (inv.items || []).reduce((s, it) => s + (it.quantity || 0), 0)} pcs
                    </td>

                    <td style={{ padding: '14px 18px', fontWeight: 600, color: '#334155' }}>
                      ₹{inv.subtotal?.toLocaleString('en-IN')}
                    </td>

                    <td style={{ padding: '14px 18px', fontSize: 12, color: '#64748b' }}>
                      ₹{inv.gstAmount?.toLocaleString('en-IN')}
                      <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>({inv.gstRate || 0}%)</span>
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      <strong style={{ fontSize: 15, color: '#0f172a' }}>
                        ₹{inv.total?.toLocaleString('en-IN')}
                      </strong>
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: b.bg, color: b.color, border: `1px solid ${b.border}` }}>
                        {b.label}
                      </span>
                    </td>

                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => setViewingInvoice(inv)}
                          title="View & Print Invoice"
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}
                        >
                          <Eye size={14} /> View
                        </button>

                        {inv.status === 'PENDING_APPROVAL' && (
                          <button
                            onClick={() => handleApproveInvoice(inv)}
                            title="Approve for Payment"
                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}
                          >
                            <CheckCircle2 size={14} /> Approve
                          </button>
                        )}

                        {inv.status === 'APPROVED' && (
                          <button
                            onClick={() => handleOpenPayment(inv)}
                            title="Mark as Paid"
                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}
                          >
                            <CreditCard size={14} /> Pay
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteInvoice(inv.id)}
                          title="Delete Invoice"
                          style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ===== GENERATE INVOICE MODAL ===== */}
      {showGenerateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 840, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Generate Partner Settlement Invoice</h2>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Calculate payout based on partner category rates, completed garments, and GST</p>
              </div>
              <button onClick={() => setShowGenerateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={20} />
              </button>
            </div>

            {/* Step 1: Select Partner */}
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 8 }}>1. Partner & Billing Profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Select Partner *</label>
                  <select
                    value={selectedPartnerId}
                    onChange={(e) => handlePartnerSelect(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, background: '#fff' }}
                  >
                    <option value="">-- Choose Partner --</option>
                    {partners.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.companyName} ({p.partnerCode || p.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Billing Period Start</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => {
                      setPeriodStart(e.target.value);
                      if (selectedPartner) scanGarmentsForPartner(selectedPartner, e.target.value, periodEnd);
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Billing Period End</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => {
                      setPeriodEnd(e.target.value);
                      if (selectedPartner) scanGarmentsForPartner(selectedPartner, periodStart, e.target.value);
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>
              </div>

              {selectedPartner && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: '#475569' }}>
                  <div>
                    <span style={{ color: '#94a3b8' }}>Category:</span>{' '}
                    <strong style={{ color: '#d97706' }}>{selectedPartner.category || 'GOLD'} Tier</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>Cycle:</span>{' '}
                    <strong>{selectedPartner.billingPeriod || 'Monthly (30 days)'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>GSTIN:</span>{' '}
                    <strong>{selectedPartner.gstNumber || 'Unregistered (0% GST)'}</strong>
                  </div>
                  {selectedPartner.bankAccount?.accountNumber && (
                    <div>
                      <span style={{ color: '#94a3b8' }}>Bank A/C:</span>{' '}
                      <strong>{selectedPartner.bankAccount.accountNumber} ({selectedPartner.bankAccount.ifscCode})</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Line Items calculated from Rate Card */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>
                  2. Itemized Services & Tier Rates
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {selectedPartner && (
                    <button
                      type="button"
                      onClick={() => scanGarmentsForPartner(selectedPartner, periodStart, periodEnd)}
                      disabled={scanning}
                      style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <RefreshCw size={13} className={scanning ? 'spinning' : ''} /> Rescan Garments
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', cursor: 'pointer', fontWeight: 600 }}
                  >
                    + Add Item
                  </button>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 11, color: '#64748b' }}>
                      <th style={{ padding: '10px 14px' }}>SERVICE / DESCRIPTION</th>
                      <th style={{ padding: '10px 14px', width: 110 }}>RATE (₹)</th>
                      <th style={{ padding: '10px 14px', width: 90 }}>QTY (PCS)</th>
                      <th style={{ padding: '10px 14px', width: 120 }}>AMOUNT (₹)</th>
                      <th style={{ padding: '10px 14px', width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannedItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                          No services added yet. Select a partner or click "+ Add Item".
                        </td>
                      </tr>
                    ) : (
                      scannedItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => handleUpdateLineItem(idx, 'description', e.target.value)}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => handleUpdateLineItem(idx, 'unitPrice', Number(e.target.value))}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleUpdateLineItem(idx, 'quantity', Number(e.target.value))}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                            ₹{(item.amount || 0).toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(idx)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step 3: Tax, Totals, and Notes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, marginBottom: 24, alignItems: 'start' }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Notes / Settlement Remarks</label>
                <textarea
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="e.g. October first half settlement, QC passed garments verified"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, minHeight: 80 }}
                />

                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="applyGst"
                    checked={applyGst}
                    onChange={(e) => setApplyGst(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#4f46e5' }}
                  />
                  <label htmlFor="applyGst" style={{ fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                    Apply GST ({gstRate}%)
                  </label>
                  {applyGst && (
                    <input
                      type="number"
                      value={gstRate}
                      onChange={(e) => setGstRate(Number(e.target.value))}
                      style={{ width: 64, padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                    />
                  )}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
                  <span>Total Garments</span>
                  <strong>{totalGarments} pcs</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
                  <span>Subtotal (Base Work)</span>
                  <strong>₹{subtotal.toLocaleString('en-IN')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13, color: '#64748b' }}>
                  <span>GST ({effectiveGstRate}%)</span>
                  <strong>₹{gstAmount.toLocaleString('en-IN')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '2px dashed #cbd5e1', fontSize: 17, color: '#0f172a' }}>
                  <strong style={{ fontWeight: 800 }}>Total Payout</strong>
                  <strong style={{ fontWeight: 800, color: '#4f46e5' }}>₹{totalAmount.toLocaleString('en-IN')}</strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="btn"
                style={{ background: '#f1f5f9', color: '#475569' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateInvoice}
                disabled={generating || !selectedPartnerId || scannedItems.length === 0}
                className="btn btn-primary"
                style={{ padding: '10px 24px', fontWeight: 700 }}
              >
                {generating ? 'Creating...' : 'Create & Issue Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== VIEW & PRINT INVOICE MODAL ===== */}
      {viewingInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0', padding: 32 }}>
            {/* Top Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>STATUS:</span>
                {(() => {
                  const b = getStatusBadge(viewingInvoice.status);
                  return (
                    <span style={{ padding: '3px 12px', borderRadius: 12, fontSize: 11, fontWeight: 800, background: b.bg, color: b.color, border: `1px solid ${b.border}` }}>
                      {b.label}
                    </span>
                  );
                })()}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  <Printer size={15} /> Print / PDF
                </button>

                {viewingInvoice.status === 'PENDING_APPROVAL' && (
                  <button
                    type="button"
                    onClick={() => handleApproveInvoice(viewingInvoice)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  >
                    <CheckCircle2 size={15} /> Approve
                  </button>
                )}

                {viewingInvoice.status === 'APPROVED' && (
                  <button
                    type="button"
                    onClick={() => handleOpenPayment(viewingInvoice)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  >
                    <CreditCard size={15} /> Record Payment
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewingInvoice(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Printable Invoice Document */}
            <div id="printable-invoice" style={{ color: '#0f172a' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#4f46e5', letterSpacing: '-0.02em' }}>AmazeFab Marketplace</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Partner Operations & Fulfillment Platform</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Chennai, Tamil Nadu • operations@amazefab.com</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>PARTNER PAYOUT INVOICE</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#4f46e5', marginTop: 3 }}>{viewingInvoice.invoiceNumber}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Date: {viewingInvoice.createdAt ? new Date(viewingInvoice.createdAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}
                  </div>
                  {viewingInvoice.periodStart && viewingInvoice.periodEnd && (
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      Cycle: {viewingInvoice.periodStart} to {viewingInvoice.periodEnd}
                    </div>
                  )}
                </div>
              </div>

              {/* Partner Info & Remittance Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, background: '#f8fafc', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>Payable To (Partner):</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{viewingInvoice.partnerName}</div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>Partner Code: <strong>{viewingInvoice.partnerCode}</strong></div>
                  <div style={{ fontSize: 12, color: '#475569' }}>Tier: <strong>{viewingInvoice.partnerCategory || 'GOLD'}</strong></div>
                  <div style={{ fontSize: 12, color: '#475569' }}>GSTIN: <strong>{viewingInvoice.gstNumber || 'Not Registered'}</strong></div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>Payout Destination (Bank A/C):</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    {viewingInvoice.bankAccount?.accountHolder || viewingInvoice.partnerName}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                    A/C No: <strong>{viewingInvoice.bankAccount?.accountNumber || 'Not specified'}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    IFSC: <strong>{viewingInvoice.bankAccount?.ifscCode || 'Not specified'}</strong>
                  </div>
                </div>
              </div>

              {/* Table of items */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left', fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 14px' }}>#</th>
                    <th style={{ padding: '10px 14px' }}>Service Description</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Tier</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Unit Rate</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingInvoice.items || []).map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{it.description}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 11, color: '#64748b' }}>{it.category || viewingInvoice.partnerCategory || 'GOLD'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#475569' }}>₹{(it.unitPrice || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>{it.quantity}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>₹{(it.amount || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary & Totals */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div style={{ maxWidth: 360 }}>
                  {viewingInvoice.notes && (
                    <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <strong style={{ display: 'block', marginBottom: 4, color: '#334155' }}>Notes:</strong>
                      {viewingInvoice.notes}
                    </div>
                  )}

                  {viewingInvoice.paymentDetails && (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12, color: '#166534' }}>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}>PAYMENT DISBURSEMENT RECORD</div>
                      <div>Method: <strong>{viewingInvoice.paymentDetails.method}</strong></div>
                      <div>Reference (UTR): <strong>{viewingInvoice.paymentDetails.reference}</strong></div>
                      <div>Disbursed On: <strong>{viewingInvoice.paymentDetails.paidAt}</strong></div>
                    </div>
                  )}
                </div>

                <div style={{ width: 260, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: '#64748b' }}>
                    <span>Subtotal:</span>
                    <strong style={{ color: '#0f172a' }}>₹{viewingInvoice.subtotal?.toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: '#64748b' }}>
                    <span>GST ({viewingInvoice.gstRate || 0}%):</span>
                    <strong style={{ color: '#0f172a' }}>₹{viewingInvoice.gstAmount?.toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 6px', borderTop: '2px solid #cbd5e1', fontSize: 17, color: '#0f172a' }}>
                    <strong style={{ fontWeight: 800 }}>Total Payout:</strong>
                    <strong style={{ fontWeight: 800, color: '#4f46e5' }}>₹{viewingInvoice.total?.toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== RECORD PAYMENT MODAL ===== */}
      {showPaymentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Record Payout Disbursement</h3>
              <button onClick={() => setShowPaymentModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>

            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <div>Invoice: <strong>{showPaymentModal.invoiceNumber}</strong></div>
              <div>Partner: <strong>{showPaymentModal.partnerName}</strong></div>
              <div style={{ marginTop: 4, fontSize: 15 }}>Total Amount: <strong style={{ color: '#4f46e5' }}>₹{showPaymentModal.total?.toLocaleString('en-IN')}</strong></div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Payment Method</label>
                <select
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm(p => ({ ...p, method: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                >
                  <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Transaction Reference / UTR Number *</label>
                <input
                  type="text"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm(p => ({ ...p, reference: e.target.value }))}
                  placeholder="e.g. UTR123456789"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Payment Date</label>
                <input
                  type="date"
                  value={paymentForm.paidAt}
                  onChange={(e) => setPaymentForm(p => ({ ...p, paidAt: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm(p => ({ ...p, notes: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowPaymentModal(null)} className="btn" style={{ background: '#f1f5f9', color: '#475569' }}>Cancel</button>
              <button onClick={handleRecordPayment} className="btn btn-primary" style={{ fontWeight: 700 }}>Confirm Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
