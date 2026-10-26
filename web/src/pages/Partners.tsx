import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { fetchServices, isApiConfigured } from '../lib/api';
import { Plus, Edit2, Trash2, X, UserPlus } from 'lucide-react';
import type { Partner, PartnerCategory, BillingPeriod, Service } from '../types';

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
 GOLD: { bg: '#d97706', text: '#fff' },
 YELLOW: { bg: '#ea580c', text: '#fff' },
 ORANGE: { bg: '#ea580c', text: '#fff' },
 BLUE: { bg: '#3b82f6', text: '#fff' },
};
const CATEGORY_LABELS: Record<string, string> = { GOLD: 'GOLD', YELLOW: 'ORANGE', ORANGE: 'ORANGE', BLUE: 'BLUE' };
const CATEGORIES: PartnerCategory[] = ['GOLD', 'ORANGE', 'BLUE'];
const BILLING_OPTIONS: { value: BillingPeriod; label: string }[] = [
 { value: 'WEEKLY', label: '1 Week (7 days)' },
 { value: 'FORTNIGHTLY', label: '15 Days' },
 { value: 'MONTHLY', label: '1 Month (30 days)' },
 { value: 'CUSTOM', label: 'Custom' },
];

function generatePartnerCode(category: PartnerCategory, existing: Partner[]): string {
 const prefix = category[0];
 const categoryPartners = existing.filter(p => p.category === category);
 const nextNum = String(categoryPartners.length + 1).padStart(2, '0');
 return prefix + 'P' + nextNum;
}

function cleanUndefined(obj: any): any {
 const result: any = {};
 for (const [k, v] of Object.entries(obj)) if (v !== undefined) result[k] = v;
 return result;
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 };
const inputStyle: React.CSSProperties = { fontSize: 14, padding: '10px 14px' };
const smallStyle: React.CSSProperties = { fontSize: 11, color: '#9ca3af' };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
 <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
 <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #f3f4f6' }}>{title}</div>
 {children}
 </div>
);
const SectionGrid = ({ children }: { children: React.ReactNode }) => (
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>{children}</div>
);

 export default function PartnersPage() {
 const [partners, setPartners] = useState<Partner[]>([]);
 const [loading, setLoading] = useState(true);
 const [showForm, setShowForm] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);
 const [creatingAccount, setCreatingAccount] = useState(false);
 const [accountCreated, setAccountCreated] = useState<{ email: string; password: string } | null>(null);
 const [form, setForm] = useState({
 companyName: '', contactPerson: '', email: '', phone: '', address: '',
 geoLat: '', geoLng: '', gstNumber: '', category: [] as PartnerCategory[],
 billingPeriod: 'MONTHLY' as BillingPeriod, customBillingDays: '',
 active: true, services: [] as string[],
 accountNumber: '', ifscCode: '', accountHolder: '', dailyCapacity: 0,
 priority: '' as string,
 });
 const [allServices, setAllServices] = useState<Service[]>([]);

 useEffect(() => { loadPartners(); loadServices(); }, []);

 async function loadServices() {
 try {
 if (isApiConfigured()) {
 const data = await fetchServices();
 setAllServices(data.filter(s => s.active));
 } else {
 const q = query(collection(db, 'services'), orderBy('name', 'asc'));
 const snap = await getDocs(q);
 setAllServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Service)).filter((s: any) => s.active));
 }
 } catch (e) { console.error(e); }
 }

 async function loadPartners() {
 try {
 const q = query(collection(db, 'partners'), orderBy('createdAt', 'desc'));
 const snap = await getDocs(q);
 setPartners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Partner)));
 } catch (e) { console.error(e); }
 setLoading(false);
 }

 function resetForm() {
 setForm({ companyName: '', contactPerson: '', email: '', phone: '', address: '', geoLat: '', geoLng: '', gstNumber: '', category: [], billingPeriod: 'MONTHLY', customBillingDays: '', active: true, services: [], accountNumber: '', ifscCode: '', accountHolder: '', dailyCapacity: 0, priority: '' });
 setEditingId(null);
 }
 function openAdd() { resetForm(); setShowForm(true); setAccountCreated(null); }
 function openEdit(p: Partner) {
 const normalize = (cats: string[]) => (cats || []).map(c => c === 'YELLOW' ? 'ORANGE' : c) as PartnerCategory[];
 setForm({ companyName: p.companyName, contactPerson: p.contactPerson, email: p.email, phone: p.phone, address: p.address, geoLat: p.geoLocation?.latitude?.toString() || '', geoLng: p.geoLocation?.longitude?.toString() || '', gstNumber: p.gstNumber || '', category: normalize(p.categoryArray || (p.category ? [p.category] : [])), billingPeriod: p.billingPeriod, customBillingDays: p.customBillingDays?.toString() || '', active: p.active, services: p.services || [], accountNumber: p.bankAccount?.accountNumber || '', ifscCode: p.bankAccount?.ifscCode || '', accountHolder: p.bankAccount?.accountHolder || '', dailyCapacity: p.dailyCapacity || 0, priority: p.priority ? String(p.priority) : '' });
 setEditingId(p.id); setShowForm(true);
 }
 function toggleCategory(cat: PartnerCategory) {
 setForm(f => ({ ...f, category: f.category.includes(cat) ? f.category.filter(c => c !== cat) : [...f.category, cat] }));
 }
 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setSaving(true);
 setAccountCreated(null);
 if (form.priority && ['1','2','3'].includes(form.priority)) {
  const dup = partners.find(p => p.priority === Number(form.priority) && p.id !== editingId);
  if (dup) { alert('Priority ' + form.priority + ' is already assigned to ' + dup.companyName + '.'); setSaving(false); return; }
 }
 try {
 const partnerCode = editingId ? undefined : generatePartnerCode(form.category[0] || 'GOLD', partners);
 const raw: any = { companyName: form.companyName, partnerCode, category: form.category[0] || 'GOLD', categoryArray: form.category, contactPerson: form.contactPerson, email: form.email, phone: form.phone, address: form.address, geoLocation: (form.geoLat && form.geoLng) ? { latitude: Number(form.geoLat), longitude: Number(form.geoLng) } : undefined, gstNumber: form.gstNumber || undefined, billingPeriod: form.billingPeriod, customBillingDays: form.billingPeriod === 'CUSTOM' && form.customBillingDays ? Number(form.customBillingDays) : undefined, services: form.services, active: form.active, dailyCapacity: form.dailyCapacity || 0, priority: form.priority ? Number(form.priority) : undefined, bankAccount: (form.accountNumber || form.ifscCode || form.accountHolder) ? { accountNumber: form.accountNumber, ifscCode: form.ifscCode, accountHolder: form.accountHolder } : undefined, updatedAt: new Date() };
 const data = cleanUndefined(raw);
 let partnerId: string;
 if (editingId) { await setDoc(doc(db, 'partners', editingId), data, { merge: true }); partnerId = editingId; }
 else { const ref = doc(collection(db, 'partners')); await setDoc(ref, { ...data, id: ref.id, partnerId: ref.id, createdAt: new Date() }); partnerId = ref.id; }

 // Create Firebase Auth account for new partner
 if (!editingId && form.email) {
 try {
 const userCred = await createUserWithEmailAndPassword(auth, form.email, '123456');
 // Try to store user profile in Firestore (may fail if rules block)
 try {
 await setDoc(doc(db, 'users', userCred.user.uid), {
 email: form.email,
 name: form.contactPerson || form.companyName,
 phone: form.phone,
 role: 'PARTNER',
 partnerId: partnerId,
 isActive: true,
 mustChangePassword: true,
 createdAt: serverTimestamp(),
 });
 } catch (firestoreErr) {
 console.warn('Firestore write failed (permission issue), but Firebase Auth account was created:', firestoreErr);
 }
 setAccountCreated({ email: form.email, password: '123456' });
 } catch (fbErr: any) {
 if (fbErr?.code === 'auth/email-already-in-use') {
 alert('Firebase account already exists for this email. User can login directly.');
 } else {
 console.error('Firebase error:', fbErr);
 alert('Firebase error: ' + (fbErr?.message || 'unknown'));
 }
 }
 }
 setShowForm(false); resetForm(); loadPartners();
 } catch (e) { console.error(e); alert('Error saving partner'); }
 setSaving(false);
 }
 async function handleDelete(id: string) {
 if (!confirm('Delete this partner permanently?')) return;
 try { await deleteDoc(doc(db, 'partners', id)); setPartners(prev => prev.filter(p => p.id !== id)); }
 catch (e) { console.error(e); alert('Error deleting partner'); }
 }

 if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

 return (
 <div className="page">
 <div className="page-header">
 <div><h1>Partners</h1><p className="page-subtitle">Manage your processing partners</p></div>
 <button className="btn btn-primary" onClick={openAdd}><Plus size={18} /> Add Partner</button>
 </div>

 {accountCreated && (
 <div style={{ padding: '14px 18px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
 <div>
 <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>✓ Firebase Account Created</div>
 <div style={{ fontSize: 13, color: '#166534' }}>Email: <strong>{accountCreated.email}</strong> · Password: <strong>{accountCreated.password}</strong></div>
 <div style={{ fontSize: 11, color: '#15803d', marginTop: 4 }}>Partner can now login to the Partner App. They must change password on first login.</div>
 </div>
 <button onClick={() => setAccountCreated(null)} style={{ background: 'transparent', border: '1px solid #86efac', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#166534' }}>Dismiss</button>
 </div>
 )}

 <div className="table-container">
 <table className="data-table">
 <thead>
 <tr>
 <th>Company</th><th>Phone</th><th>Billing</th><th>Capacity</th><th>Priority</th><th>Active</th><th>Actions</th>
 </tr>
 </thead>
 <tbody>
 {partners.map(p => {
 const cats = p.categoryArray && p.categoryArray.length > 0 ? p.categoryArray : (p.category ? [p.category] : []);
 const primaryCat = cats[0];
 const borderColor = CATEGORY_COLORS[primaryCat]?.bg || 'transparent';
 return (
 <tr key={p.id} style={{ borderLeft: '4px solid ' + borderColor }}>
 <td>
 <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
 <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, color: '#fff', background: '#4f46e5', fontWeight: 700, letterSpacing: 0.5 }}>{p.partnerCode}</span>
 <div style={{ display: 'inline-flex', gap: 2 }}>
 {cats.map(cat => {
 const c = CATEGORY_COLORS[cat];
 return <span key={cat} title={CATEGORY_LABELS[cat] || cat} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', fontSize: 10, fontWeight: 700, background: c?.bg || '#999', color: c?.text || '#fff', lineHeight: 1 }}>{(CATEGORY_LABELS[cat] || cat)[0]}</span>;
 })}
 </div>
 </div>
 <span style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>{p.companyName}</span>
 </div>
 </td>
 <td>
 <div style={{ fontSize: 13, fontWeight: 500, color: '#1f2937' }}>{p.contactPerson}</div>
 <div style={{ fontSize: 11, color: '#6b7280', marginTop: -2 }}>{p.phone}</div>
 </td>
 <td>{p.billingPeriod}{p.customBillingDays ? ' (' + p.customBillingDays + 'd)' : ''}</td>
 <td><strong>{p.dailyCapacity || 0}</strong> /day</td>
<td>
{p.priority ? (
  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: p.priority === 1 ? '#d97706' : p.priority === 2 ? '#ea580c' : '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 700 }}>{p.priority}</span>
) : '—'}
</td>
 <td><span className={'badge ' + (p.active ? 'badge-active' : 'badge-inactive')}>{p.active ? 'Yes' : 'No'}</span></td>
 <td>
 <div className="action-btns">
 <button className="btn-icon btn-icon-edit" onClick={() => openEdit(p)} title="Edit"><Edit2 size={16} /></button>
 <button className="btn-icon" onClick={async () => {
 if (!p.email) { alert('No email for this partner'); return; }
 setCreatingAccount(true);
 try {
 const userCred = await createUserWithEmailAndPassword(auth, p.email, '123456');
 await setDoc(doc(db, 'users', userCred.user.uid), {
 email: p.email,
 name: p.contactPerson || p.companyName,
 phone: p.phone,
 role: 'PARTNER',
 partnerId: p.id,
 isActive: true,
 mustChangePassword: true,
 createdAt: serverTimestamp(),
 });
 alert('Firebase account created! Password: 123456');
 } catch (fbErr: any) {
 if (fbErr?.code === 'auth/email-already-in-use') {
 alert('Firebase account already exists for this email');
 } else {
 alert('Error: ' + (fbErr?.message || 'unknown'));
 }
 }
 setCreatingAccount(false);
 }} title="Create Firebase Account" style={{ color: '#10b981' }} disabled={creatingAccount}><UserPlus size={15} /></button>
 <button className="btn-icon btn-icon-danger" onClick={() => handleDelete(p.id)} title="Delete"><Trash2 size={16} /></button>
 </div>
 </td>
 </tr>
 );
 })}
 {partners.length === 0 && (
 <tr><td colSpan={7} className="text-center text-muted">No partners found. Click "Add Partner" to onboard your first partner.</td></tr>
 )}
 </tbody>
 </table>
 </div>

 {showForm && (
 <div className="modal-overlay" onClick={() => setShowForm(false)}>
 <div className="modal" onClick={e => e.stopPropagation()}>
 <form onSubmit={handleSubmit}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
 <span style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>{editingId ? 'Edit Partner' : 'New Partner Onboarding'}</span>
 <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
 <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
 <span style={{
 width: 26, height: 26, borderRadius: '50%', background: form.active ? '#10b981' : '#d1d5db',
 display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
 color: '#fff', fontSize: 12, fontWeight: 700,
 }}>{form.active ? 'OK' : ''}</span>
 <span>{form.active ? 'Active' : 'Inactive'}</span>
 <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ display: 'none' }} />
 </label>
 <button type="button" className="btn-icon" onClick={() => setShowForm(false)}><X size={20} /></button>
 </div>
 </div>

 <Section title="Personal Details">
 <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 14 }}>
 <div>
 <label style={labelStyle}>Company Name <span style={{ color: '#ef4444' }}>*</span></label>
 <input className="form-input" required style={inputStyle} value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="ABC Laundry Services" />
 </div>
 <div>
 <label style={labelStyle}>Contact Person <span style={{ color: '#ef4444' }}>*</span></label>
 <input className="form-input" required style={inputStyle} value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} placeholder="Ramesh Kumar" />
 </div>
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
 <div>
 <label style={labelStyle}>Phone <span style={{ color: '#ef4444' }}>*</span></label>
 <input className="form-input" required style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
 </div>
 <div>
 <label style={labelStyle}>Email <span style={{ color: '#ef4444' }}>*</span></label>
 <input className="form-input" type="email" required style={inputStyle} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@company.com" />
 </div>
 </div>
 <div>
 <label style={labelStyle}>Address <span style={{ color: '#ef4444' }}>*</span></label>
 <textarea className="form-input" rows={2} required style={inputStyle} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Full business address" />
 </div>
 </Section>

 <Section title="Operations">
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
 <div>
 <label style={labelStyle}>Partner Category</label>
 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
 {CATEGORIES.map(cat => {
 const active = form.category.includes(cat);
 const c = CATEGORY_COLORS[cat];
 return <button key={cat} type="button" onClick={() => toggleCategory(cat)} style={{ padding: '6px 16px', borderRadius: 16, border: '1.5px solid ' + c.bg, background: active ? c.bg : '#fff', color: active ? c.text : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>{cat}</button>;
 })}
 </div>
 <small style={{ ...smallStyle, display: 'block', marginTop: 6 }}>Gold = premium, Orange = mid-tier, Blue = standard</small>
 </div>
 <div>
 <label style={labelStyle}>Daily Capacity</label>
 <input className="form-input" type="number" min="0" placeholder="e.g. 500" style={inputStyle} value={form.dailyCapacity || ''} onChange={e => setForm(f => ({ ...f, dailyCapacity: parseInt(e.target.value) || 0 }))} />
 <small style={{ ...smallStyle, display: 'block', marginTop: 4 }}>Garments per day</small>
 </div>
 </div>
 <div>
 <label style={labelStyle}>Services Offered</label>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
 {allServices.length === 0 ? <p style={{ ...smallStyle, margin: 0 }}>No services available.</p> : allServices.map(svc => {
 const checked = form.services.includes(svc.id);
 return <button key={svc.id} type="button" onClick={() => setForm(f => ({ ...f, services: checked ? f.services.filter(id => id !== svc.id) : [...f.services, svc.id] }))} style={{ padding: '6px 14px', borderRadius: 16, border: '1.5px solid ' + (checked ? '#3b82f6' : '#d1d5db'), background: checked ? '#3b82f6' : '#fff', color: checked ? '#fff' : '#374151', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}>{svc.name}</button>;
 })}
 </div>
 </div>
 </Section>

 <Section title="Priority">
 <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 14 }}>
 <div style={{ maxWidth: 120 }}>
 <label style={labelStyle}>Priority Level</label>
 <select className="form-input" required style={inputStyle} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
 <option value="">—</option>
 <option value="1">1 (Highest)</option>
 <option value="2">2</option>
 <option value="3">3 (Lowest)</option>
 </select>
 </div>
 <div style={{ fontSize: 12, color: '#6b7280', paddingBottom: 10, lineHeight: 1.5 }}>
 Each priority level can be assigned to only one partner. Choosing a level already taken by another partner will show a warning.
 </div>
 </div>
 </Section>

 <Section title="Finance">
 <div style={{ marginBottom: 14 }}>
 <label style={labelStyle}>Billing Period <span style={{ color: '#ef4444' }}>*</span></label>
 <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
 {BILLING_OPTIONS.map(opt => (
 <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
 <input type="radio" name="billing" value={opt.value} checked={form.billingPeriod === opt.value} onChange={() => setForm(f => ({ ...f, billingPeriod: opt.value as BillingPeriod }))} />
 <span>{opt.label}</span>
 </label>
 ))}
 </div>
 </div>
 <div style={{ marginBottom: 14 }}>
 <label style={labelStyle}>GST Number</label>
 <input className="form-input" style={inputStyle} value={form.gstNumber} onChange={e => setForm(f => ({ ...f, gstNumber: e.target.value.toUpperCase() }))} placeholder="33AAAAA0000A1Z5" />
 </div>
 <div>
 <label style={labelStyle}>Bank Account <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 6 }}>
 <input className="form-input" placeholder="Account Number" style={{ ...inputStyle, fontSize: 13 }} value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} />
 <input className="form-input" placeholder="IFSC Code" style={{ ...inputStyle, fontSize: 13 }} value={form.ifscCode} onChange={e => setForm(f => ({ ...f, ifscCode: e.target.value.toUpperCase() }))} />
 <input className="form-input" placeholder="Account Holder" style={{ ...inputStyle, fontSize: 13 }} value={form.accountHolder} onChange={e => setForm(f => ({ ...f, accountHolder: e.target.value }))} />
 </div>
 </div>
 </Section>

 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 18, borderTop: '1px solid #e5e7eb', marginTop: 8 }}>
 <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving} style={{ padding: '10px 24px', fontSize: 14 }}>Cancel</button>
 <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '10px 28px', fontSize: 14 }}>
 {saving ? 'Saving...' : editingId ? 'Update Partner' : 'Add Partner'}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}
 </div>
 );
}
