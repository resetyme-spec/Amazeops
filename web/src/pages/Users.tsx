import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, X, Check, Key, Users as UsersIcon } from 'lucide-react';
import { fetchUsers, createUser, updateUser, deleteUser, fetchRoles } from '../lib/api';
import { auth, db } from '../lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import type { AppUser, AppRole } from '../types';

export default function UsersPage() {
 const [users, setUsers] = useState<AppUser[]>([]);
 const [roles, setRoles] = useState<AppRole[]>([]);
 const [loading, setLoading] = useState(true);
 const [showForm, setShowForm] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'PARTNER' as 'ADMIN' | 'STAFF' | 'PARTNER', partnerId: '', isActive: true });
 const [submitting, setSubmitting] = useState(false);
 const [error, setError] = useState('');
 const [success, setSuccess] = useState('');

 const load = () => {
 setLoading(true);
 Promise.all([fetchUsers(), fetchRoles()])
 .then(([u, r]) => { setUsers(u); setRoles(r); })
 .catch(console.error)
 .finally(() => setLoading(false));
 };

 useEffect(() => { load(); }, []);

 const resetForm = () => {
 setForm({ name: '', email: '', phone: '', role: 'PARTNER', partnerId: '', isActive: true });
 setShowForm(false); setEditingId(null);
 setError('');
 setSuccess('');
 };

 const handleSubmit = async () => {
 if (!form.name.trim() || !form.email.trim()) return;
 setError('');
 setSuccess('');
 setSubmitting(true);

 try {
 if (editingId) {
 // Update existing user in dummy API
 await updateUser(editingId, form);
 setSuccess('User updated successfully');
 } else {
 // Create user in Firebase Auth + Firestore
 try {
 const userCred = await createUserWithEmailAndPassword(auth, form.email, '123456');

 // Create Firestore profile with mustChangePassword = true
 await setDoc(doc(db, 'users', userCred.user.uid), {
 email: form.email,
 name: form.name,
 phone: form.phone,
 role: form.role,
 partnerId: form.partnerId || null,
 isActive: form.isActive,
 mustChangePassword: true,
 createdAt: serverTimestamp(),
 });

 // Also create in dummy API for reference
 await createUser({
 ...form,
 id: userCred.user.uid,
 });

 setSuccess('User created. Login password: 123456 (must change on first login)');
 } catch (fbErr: any) {
 if (fbErr?.code === 'auth/email-already-in-use') {
 setError('A Firebase account already exists for this email');
 } else {
 setError('Firebase error: ' + (fbErr?.message || 'unknown'));
 }
 return;
 }
 }
 resetForm();
 load();
 } catch (err: any) {
 setError(err?.message || 'Failed to save user');
 } finally {
 setSubmitting(false);
 }
 };

 const handleEdit = (u: AppUser) => {
 setForm({ name: u.name, email: u.email, phone: u.phone || '', role: u.role, partnerId: u.partnerId || '', isActive: u.isActive });
 setEditingId(u.id); setShowForm(true);
 };

 const handleDelete = async (id: string) => {
 if (!confirm('Delete this user?')) return;
 try {
 await deleteUser(id);
 // Optionally delete from Firebase too
 load();
 } catch (err: any) {
 alert('Failed to delete user');
 }
 };

 const handleResetPassword = async (email: string) => {
 if (!confirm(`Reset password for ${email} to 123456?`)) return;
 try {
 // Get Firestore UID for this email
 const snap = await getDoc(doc(db, 'users_by_email', email.replace(/\./g, '_')));
 if (!snap.exists()) {
 alert('No Firebase account found for this email');
 return;
 }
 const uid = snap.data().uid;
 // Use Firebase Admin SDK or update Firestore mustChangePassword flag
 // For client-side, we can only update mustChangePassword; actual password reset requires Admin SDK
 await setDoc(doc(db, 'users', uid), { mustChangePassword: true }, { merge: true });
 alert('Password reset flag set. User will be forced to change password on next login.');
 } catch (err: any) {
 alert('Failed: ' + err.message);
 }
 };

 const openCreate = () => {
 resetForm();
 setShowForm(true);
 };

 if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

 return (
 <div className="page">
 <div className="page-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
 <div><h1>Users</h1><p className="page-subtitle">Manage Staff & Partner access</p></div>
 <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add User</button>
 </div>

 {success && !showForm && (
 <div style={{ padding: '10px 16px', background: '#f0fdf4', color: '#16a34a', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{success}</div>
 )}

 {/* Users Table */}
 <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
 <table className="data-table">
 <thead>
 <tr>
 <th>Name</th><th>Email</th><th>Role</th><th>Status</th>
 <th style={{ width: 150 }}>Actions</th>
 </tr>
 </thead>
 <tbody>
 {users.length === 0 ? (
 <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No users found</td></tr>
 ) : users.map(u => (
 <tr key={u.id}>
 <td>
 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
 <div style={{ width: 32, height: 32, borderRadius: 8, background: u.role === 'ADMIN' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : u.role === 'STAFF' ? 'linear-gradient(135deg,#f59e0b,#fbbf24)' : 'linear-gradient(135deg,#06b6d4,#22d3ee)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{u.name.charAt(0).toUpperCase()}</div>
 <span style={{ fontWeight: 600, color: '#0f172a' }}>{u.name}</span>
 </div>
 </td>
 <td style={{ color: '#475569' }}>{u.email}</td>
 <td>
 <span className={`badge badge-${u.role.toLowerCase()}`}>{u.role}</span>
 </td>
 <td>
 <span className={`badge ${u.isActive ? 'badge-active' : 'badge-inactive'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
 </td>
 <td>
 <div className="action-btns">
 <button className="btn-icon btn-icon-edit" onClick={() => handleEdit(u)} title="Edit"><Edit2 size={15} /></button>
 <button className="btn-icon" onClick={() => handleResetPassword(u.email)} title="Reset Password" style={{ color: '#f59e0b' }}><Key size={15} /></button>
 <button className="btn-icon btn-icon-danger" onClick={() => handleDelete(u.id)} title="Delete"><Trash2 size={15} /></button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* Create/Edit Form Modal */}
 {showForm && (
 <div className="modal-overlay" onClick={resetForm}>
 <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
 <div className="modal-header">
 <h2>{editingId ? 'Edit User' : 'Add New User'}</h2>
 <button className="btn-icon" onClick={resetForm}><X size={18} /></button>
 </div>

 {error && <div style={{ padding: '10px 12px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
 {success && <div style={{ padding: '10px 12px', background: '#f0fdf4', color: '#16a34a', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{success}</div>}

 {!editingId && (
 <div style={{ padding: '10px 12px', background: '#fef3c7', color: '#92400e', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
 <strong>Note:</strong> Firebase Auth account will be created with default password <code>123456</code>. User will be required to change password on first login.
 </div>
 )}

 <div className="form-grid">
 <div className="form-group full-width">
 <label>Full Name *</label>
 <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Enter full name" />
 </div>
 <div className="form-group">
 <label>Email *</label>
 <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" disabled={!!editingId} />
 </div>
 <div className="form-group">
 <label>Phone</label>
 <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91XXXXXXXXXX" />
 </div>
 <div className="form-group">
 <label>Role</label>
 <select className="select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as 'ADMIN' | 'STAFF' | 'PARTNER' })}>
 <option value="ADMIN">Admin</option>
 <option value="STAFF">Staff</option>
 <option value="PARTNER">Partner</option>
 </select>
 </div>
 <div className="form-group">
 <label>Status</label>
 <select className="select" value={form.isActive ? 'active' : 'inactive'} onChange={e => setForm({ ...form, isActive: e.target.value === 'active' })}>
 <option value="active">Active</option>
 <option value="inactive">Inactive</option>
 </select>
 </div>
 </div>
 <div className="modal-footer">
 <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>
 <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.name.trim() || !form.email.trim() || submitting}>
 <Check size={16} /> {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'} User
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
