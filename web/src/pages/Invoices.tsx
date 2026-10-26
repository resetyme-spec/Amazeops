import { useEffect, useState } from 'react';
import { fetchInvoices } from '../lib/api';
import type { Invoice } from '../types';

export default function InvoicesPage() {
 const [invoices, setInvoices] = useState<Invoice[]>([]);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 fetchInvoices().then(setInvoices).catch(console.error).finally(() => setLoading(false));
 }, []);

 if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

 return (
 <div className="page">
 <div className="page-header">
 <div><h1>Invoices</h1><p className="page-subtitle">Track partner invoices and payments</p></div>
 </div>
 <div className="table-container">
 <table className="data-table">
 <thead><tr><th>Invoice #</th><th>Partner</th><th>Amount</th><th>GST</th><th>Total</th><th>Status</th></tr></thead>
 <tbody>
 {invoices.map(inv => (
 <tr key={inv.id}>
 <td><strong>{inv.invoiceNumber}</strong></td>
 <td>{inv.partnerName}</td>
 <td>₹{inv.subtotal?.toLocaleString('en-IN')}</td>
 <td>₹{inv.gstAmount?.toLocaleString('en-IN')}</td>
 <td><strong>₹{inv.total?.toLocaleString('en-IN')}</strong></td>
 <td><span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span></td>
 </tr>
 ))}
 {invoices.length === 0 && <tr><td colSpan={6} className="text-center text-muted">No invoices found</td></tr>}
 </tbody>
 </table>
 </div>
 </div>
 );
}
