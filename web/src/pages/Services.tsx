import { db } from '../lib/firebase';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { callApi, isApiConfigured } from '../lib/api';
import type { Service } from '../types';

export default function ServicesPage() {
 const [services, setServices] = useState<Service[]>([]);
 const [loading, setLoading] = useState(true);
 const [showForm, setShowForm] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);
 const [deletingId, setDeletingId] = useState<string | null>(null);

 const [form, setForm] = useState({
  name: '',
  code: '',
  amazeFabServiceId: '',
  description: '',
  goldRate: '',
  yellowRate: '',
  blueRate: '',
  active: true,
 });

 useEffect(() => { loadServices(); }, []);

 async function loadServices() {
  setLoading(true);
  try {
   let list: Service[] = [];
   try {
    const snap = await getDocs(collection(db, 'services'));
    if (!snap.empty) {
     list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Service));
    }
   } catch (e) {}

   if (!list.length) {
    try {
     const data = await callApi<any>('/api/services');
     list = (data.services || []).map((s: any) => ({ id: s.id, ...s } as Service));
    } catch (e) {}
   }

   setServices(list);
  } catch (e) { console.error(e); }
  setLoading(false);
 }

 function resetForm() {
  setForm({ name: '', code: '', amazeFabServiceId: '', description: '', goldRate: '', yellowRate: '', blueRate: '', active: true });
  setEditingId(null);
 }

 function openAdd() { resetForm(); setShowForm(true); }

 function openEdit(s: Service) {
  setForm({
   name: s.name, code: s.code || '', amazeFabServiceId: s.amazeFabServiceId, description: s.description || '',
   goldRate: String(s.goldRate), yellowRate: String(s.yellowRate), blueRate: String(s.blueRate),
   active: s.active,
  });
  setEditingId(s.id);
  setShowForm(true);
 }

 async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setSaving(true);
  try {
   const data = {
    name: form.name,
    code: form.code || undefined,
    amazeFabServiceId: form.amazeFabServiceId,
    description: form.description || undefined,
    goldRate: Number(form.goldRate),
    yellowRate: Number(form.yellowRate),
    blueRate: Number(form.blueRate),
    active: form.active,
   };

   const serviceId = editingId || doc(collection(db, 'services')).id;
   try {
    await setDoc(doc(db, 'services', serviceId), { ...data, id: serviceId }, { merge: true });
   } catch (err) {}
   try {
    if (editingId) {
     await callApi(`/api/services/${editingId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
     await callApi('/api/services', { method: 'POST', body: JSON.stringify({ ...data, id: serviceId }) });
    }
   } catch (err) {}

   setShowForm(false);
   resetForm();
   loadServices();
  } catch (e: any) { alert('Error saving: ' + (e.message || JSON.stringify(e))); console.error(e); }
  setSaving(false);
 }

 function askDelete(s: Service) {
  setDeletingId(s.id);
 }

 async function confirmDelete() {
  if (!deletingId) return;
  const id = deletingId;
  setDeletingId(null);
  setServices(prev => prev.filter(s => s.id !== id));

  try {
   await callApi(`/api/services/${id}`, { method: 'DELETE' });
  } catch (e: any) {
   alert('Delete failed: ' + (e.message || JSON.stringify(e)));
   loadServices();
  }
 }



 if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

 return (
  <div className="page">
  <div className="page-header">
  <div><h1>Services</h1><p className="page-subtitle">{services.length} services configured</p></div>
  <button className="btn btn-primary" onClick={openAdd}><Plus size={18} /> Add Service</button>
  </div>

  <div className="table-container">
   <table className="data-table">
    <thead>
     <tr><th>Service Name</th><th>Code</th><th>AmazeFab ID</th><th>Gold Rate</th><th>Yellow Rate</th><th>Blue Rate</th><th>Status</th><th>Actions</th></tr>
    </thead>
    <tbody>
     {services.map(s => (
      <tr key={s.id}>
       <td><strong>{s.name}</strong>{s.description && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{s.description}</div>}</td>
       <td><code>{s.code || '—'}</code></td>
       <td><code>{s.amazeFabServiceId || '—'}</code></td>
       <td style={{ color: '#d97706', fontWeight: 600 }}>Rs {s.goldRate?.toFixed(2)}</td>
       <td style={{ color: '#ca8a04', fontWeight: 600 }}>Rs {s.yellowRate?.toFixed(2)}</td>
       <td style={{ color: '#2563eb', fontWeight: 600 }}>Rs {s.blueRate?.toFixed(2)}</td>
       <td><span className={`badge ${s.active ? 'badge-active' : 'badge-inactive'}`}>{s.active ? 'Active' : 'Inactive'}</span></td>
       <td>
        <div className="action-btns">
         <button className="btn-icon btn-icon-edit" onClick={() => openEdit(s)} title="Edit"><Edit2 size={16} /></button>
         <button className="btn-icon btn-icon-danger" onClick={() => askDelete(s)} title="Delete"><Trash2 size={16} /></button>
        </div>
       </td>
      </tr>
     ))}
     {services.length === 0 && <tr><td colSpan={8} className="text-center text-muted" style={{ padding: 32 }}>No services found. Add your first service to get started.</td></tr>}
    </tbody>
   </table>
  </div>

  {showForm && (
  <div className="modal-overlay" onClick={() => setShowForm(false)}>
   <div className="modal" onClick={e => e.stopPropagation()}>
   <div className="modal-header">
    <h2>{editingId ? 'Edit Service' : 'Add New Service'}</h2>
    <button className="btn-icon" onClick={() => setShowForm(false)}><X size={20} /></button>
   </div>
   <form onSubmit={handleSubmit}>
    <div className="form-grid">
     <div className="form-group full-width">
      <label className="form-label">Service Name *</label>
      <input className="form-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Dry Clean, Iron, Wash & Iron" />
     </div>
     <div className="form-group full-width">
      <label className="form-label">Service Code (e.g. WASH-IRON)</label>
      <input className="form-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="WASH-IRON" />
     </div>
     <div className="form-group full-width">
      <label className="form-label">AmazeFab Service ID (e.g. AMF-A001)</label>
      <input className="form-input" value={form.amazeFabServiceId} onChange={e => setForm(f => ({ ...f, amazeFabServiceId: e.target.value }))} placeholder="AMF-A001" />
     </div>
     <div className="form-group full-width">
      <label className="form-label">Description (optional)</label>
      <textarea className="form-input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description of the service" />
     </div>
     <div className="form-group full-width">
      <label className="form-label">Pricing per Category (INR)</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
       <div><label className="form-label" style={{ color: '#f59e0b' }}>Gold Rate</label><input className="form-input" type="number" step="0.01" min="0" required value={form.goldRate} onChange={e => setForm(f => ({ ...f, goldRate: e.target.value }))} placeholder="0.00" /></div>
       <div><label className="form-label" style={{ color: '#eab308' }}>Yellow Rate</label><input className="form-input" type="number" step="0.01" min="0" required value={form.yellowRate} onChange={e => setForm(f => ({ ...f, yellowRate: e.target.value }))} placeholder="0.00" /></div>
       <div><label className="form-label" style={{ color: '#3b82f6' }}>Blue Rate</label><input className="form-input" type="number" step="0.01" min="0" required value={form.blueRate} onChange={e => setForm(f => ({ ...f, blueRate: e.target.value }))} placeholder="0.00" /></div>
      </div>
      <small className="text-muted">Rate per unit. Resolved at partner assignment.</small>
     </div>
     <div className="form-group">
      <label className="form-label">Active</label>
      <select className="form-input" value={form.active ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, active: e.target.value === 'true' }))}>
       <option value="true">Yes</option><option value="false">No</option>
      </select>
     </div>
    </div>
    <div className="modal-footer">
     <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
     <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update Service' : 'Create Service'}</button>
    </div>
   </form>
   </div>
  </div>
  )}

  {deletingId && (
  <div className="modal-overlay" onClick={() => setDeletingId(null)}>
   <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
   <div className="modal-header"><h2>Delete Service</h2><button className="btn-icon" onClick={() => setDeletingId(null)}><X size={20} /></button></div>
   <div style={{ padding: '20px 24px' }}><p style={{ margin: 0, color: '#374151', fontSize: 14 }}>Are you sure? This permanently removes the service.</p></div>
   <div className="modal-footer">
    <button className="btn btn-secondary" onClick={() => setDeletingId(null)}>Cancel</button>
    <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
   </div>
   </div>
  </div>
  )}
  </div>
 );
}
