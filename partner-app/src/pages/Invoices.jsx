import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText, ArrowLeft, RefreshCw, CheckCircle2, Clock,
  DollarSign, ChevronRight, X, Printer, CreditCard, Building2,
  Calendar, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchInvoicesByPartner } from '../lib/api';

function getBadge(status) {
  const s = (status || '').toUpperCase();
  if (s === 'PAID') {
    return { label: 'PAID', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
  }
  if (s === 'APPROVED') {
    return { label: 'APPROVED', bg: '#e0e7ff', color: '#4338ca', border: '#a5b4fc' };
  }
  return { label: 'PENDING APPROVAL', bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
}

export default function PartnerInvoices() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      if (user?.id) {
        const list = await fetchInvoicesByPartner(user.id);
        setInvoices(list);
      }
    } catch (e) {
      console.error('Failed to load partner invoices:', e);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const totalEarned = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + (i.total || 0), 0);
  const pendingAmount = invoices.filter(i => i.status !== 'PAID').reduce((s, i) => s + (i.total || 0), 0);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner-large" />
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 60, minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <header className="screen-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#475569', padding: 4 }}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Earnings & Invoices</h1>
        </div>
        <button
          className="icon-btn"
          onClick={() => loadData(true)}
          disabled={refreshing}
          style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}
        >
          <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
        </button>
      </header>

      {/* Overview Earnings Card */}
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          borderRadius: 16,
          padding: 20,
          color: '#fff',
          boxShadow: '0 8px 20px rgba(79, 70, 229, 0.25)'
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Total Partner Earnings
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, marginTop: 4, letterSpacing: '-0.02em' }}>
            ₹{totalEarned.toLocaleString('en-IN')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>Settled (Paid)</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: '#bbf7d0' }}>
                ₹{totalPaid.toLocaleString('en-IN')}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>Pending Payout</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: '#fef08a' }}>
                ₹{pendingAmount.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Invoice History ({invoices.length})
          </h2>
        </div>

        {invoices.length === 0 ? (
          <div style={{ background: '#fff', padding: 36, borderRadius: 14, textAlign: 'center', border: '1px solid #e2e8f0', color: '#94a3b8' }}>
            <FileText size={40} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#475569' }}>No Invoices Yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Settlement invoices will appear here once processed by AmazeFab Operations.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {invoices.map((inv) => {
              const b = getBadge(inv.status);
              return (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInvoice(inv)}
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    padding: 16,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{inv.invoiceNumber}</span>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                        {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </div>
                    </div>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 9px',
                      borderRadius: 12,
                      fontSize: 10,
                      fontWeight: 800,
                      background: b.bg,
                      color: b.color,
                      border: `1px solid ${b.border}`
                    }}>
                      {b.label}
                    </span>
                  </div>

                  {inv.periodStart && inv.periodEnd && (
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={12} color="#94a3b8" /> Cycle: {inv.periodStart} to {inv.periodEnd}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        Base: ₹{inv.subtotal?.toLocaleString('en-IN')} {inv.gstAmount ? `+ GST ₹${inv.gstAmount?.toLocaleString('en-IN')}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {inv.garmentCount || (inv.items || []).reduce((s, it) => s + (it.quantity || 0), 0)} garments fulfilled
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Total Payout</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#4f46e5' }}>
                          ₹{inv.total?.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <ChevronRight size={18} color="#94a3b8" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Invoice Detail Modal */}
      {selectedInvoice && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(3px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 520,
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 20,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase' }}>Payout Statement</span>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{selectedInvoice.invoiceNumber}</h3>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Printer size={13} /> Print
                </button>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Brand & Partner Details */}
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16, fontSize: 12 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{selectedInvoice.partnerName}</div>
              <div style={{ color: '#64748b', marginTop: 2 }}>Partner Code: <strong>{selectedInvoice.partnerCode}</strong></div>
              <div style={{ color: '#64748b' }}>Rate Tier: <strong>{selectedInvoice.partnerCategory || 'GOLD'}</strong></div>
              {selectedInvoice.gstNumber && <div style={{ color: '#64748b' }}>GSTIN: <strong>{selectedInvoice.gstNumber}</strong></div>}

              {selectedInvoice.bankAccount?.accountNumber && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #cbd5e1', color: '#334155' }}>
                  Remittance Bank: <strong>{selectedInvoice.bankAccount.accountNumber}</strong> ({selectedInvoice.bankAccount.ifscCode})
                </div>
              )}
            </div>

            {/* Services breakdown table */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                Completed Services Breakdown
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 10px' }}>Service</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Qty</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedInvoice.items || []).map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e293b' }}>{it.description}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>₹{it.unitPrice}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>{it.quantity}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          ₹{(it.amount || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#64748b' }}>
                <span>Base Subtotal</span>
                <strong>₹{selectedInvoice.subtotal?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#64748b' }}>
                <span>GST ({selectedInvoice.gstRate || 0}%)</span>
                <strong>₹{selectedInvoice.gstAmount?.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px dashed #cbd5e1', fontSize: 16, color: '#0f172a' }}>
                <strong style={{ fontWeight: 900 }}>Total Payable</strong>
                <strong style={{ fontWeight: 900, color: '#4f46e5' }}>₹{selectedInvoice.total?.toLocaleString('en-IN')}</strong>
              </div>
            </div>

            {/* Payment Record if Paid */}
            {selectedInvoice.paymentDetails && (
              <div style={{ background: '#f0fdf4', padding: 12, borderRadius: 10, border: '1px solid #bbf7d0', fontSize: 12, color: '#166534', marginBottom: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 2 }}>✓ Payment Disbursed</div>
                <div>Method: <strong>{selectedInvoice.paymentDetails.method}</strong></div>
                <div>UTR/Ref: <strong>{selectedInvoice.paymentDetails.reference}</strong></div>
                <div>Disbursed On: <strong>{selectedInvoice.paymentDetails.paidAt}</strong></div>
              </div>
            )}

            <button
              onClick={() => setSelectedInvoice(null)}
              className="btn btn-full"
              style={{ background: '#f1f5f9', color: '#475569', fontWeight: 700 }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
