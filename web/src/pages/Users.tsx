import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, X, Check, Key, Shield, Building2, CheckSquare, Square, UserCheck } from 'lucide-react';
import { fetchUsers, createUser, updateUser, deleteUser, fetchPartners } from '../lib/api';
import { auth, db } from '../lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import type { AppUser, Partner } from '../types';

const DEFAULT_PERMISSIONS = {
  canViewOrders: true,
  canManageOrders: true,
  canPerformQC: true,
  canScanTags: true,
  canViewInvoices: false,
  canAssignPartners: false,
  canManageCriticalCases: true,
};

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'STAFF' as 'STAFF' | 'ADMIN',
    isActive: true,
    accessAllPartners: true,
    assignedPartnerIds: [] as string[],
    permissions: { ...DEFAULT_PERMISSIONS },
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [uList, pList] = await Promise.all([
        fetchUsers().catch(() => []),
        fetchPartners().catch(() => [])
      ]);

      // Also merge live Firestore users if available
      try {
        const snap = await getDocs(collection(db, 'users'));
        if (!snap.empty) {
          const fbUsers: AppUser[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              userId: d.id,
              name: data.name || data.displayName || 'Unnamed User',
              email: data.email || '',
              phone: data.phone || '',
              role: (data.role || 'STAFF').toUpperCase() as any,
              partnerId: data.partnerId,
              assignedOrders: data.assignedOrders || [],
              assignedPartnerIds: data.assignedPartnerIds || [],
              permissions: data.permissions || DEFAULT_PERMISSIONS,
              isActive: data.isActive !== false,
              mustChangePassword: data.mustChangePassword,
              createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
            };
          });

          // Merge by email
          const emailMap = new Map<string, AppUser>();
          fbUsers.forEach(u => { if (u.email) emailMap.set(u.email.toLowerCase(), u); });
          uList.forEach(u => {
            if (u.email && !emailMap.has(u.email.toLowerCase())) {
              emailMap.set(u.email.toLowerCase(), u);
            }
          });
          setUsers(Array.from(emailMap.values()));
        } else {
          setUsers(uList);
        }
      } catch (e) {
        setUsers(uList);
      }

      setPartners(pList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({
      name: '',
      email: '',
      phone: '',
      role: 'STAFF',
      isActive: true,
      accessAllPartners: true,
      assignedPartnerIds: [],
      permissions: { ...DEFAULT_PERMISSIONS },
    });
    setShowForm(false);
    setEditingId(null);
    setError('');
    setSuccess('');
  };

  const handleTogglePartner = (partnerId: string) => {
    setForm(prev => {
      const exists = prev.assignedPartnerIds.includes(partnerId);
      const next = exists
        ? prev.assignedPartnerIds.filter(id => id !== partnerId)
        : [...prev.assignedPartnerIds, partnerId];
      return { ...prev, accessAllPartners: false, assignedPartnerIds: next };
    });
  };

  const handleTogglePermission = (key: keyof typeof DEFAULT_PERMISSIONS) => {
    setForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Please fill in Name and Email');
      return;
    }
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const finalPartnerIds = form.accessAllPartners ? ['ALL'] : form.assignedPartnerIds;

      if (editingId) {
        // Update Firestore profile
        try {
          await setDoc(doc(db, 'users', editingId), {
            name: form.name,
            phone: form.phone,
            role: form.role,
            isActive: form.isActive,
            assignedPartnerIds: finalPartnerIds,
            permissions: form.permissions,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (fsErr) {
          console.warn('Firestore update warning:', fsErr);
        }

        // Also update backend API
        await updateUser(editingId, {
          name: form.name,
          email: form.email,
          phone: form.phone,
          role: form.role,
          isActive: form.isActive,
          permissions: form.permissions,
          assignedPartnerIds: finalPartnerIds,
        } as any);

        setSuccess('Staff member updated successfully');
      } else {
        // Create user in Firebase Auth with default password Admin@123
        try {
          const userCred = await createUserWithEmailAndPassword(auth, form.email.trim(), 'Admin@123');

          // Store profile in Firestore with mustChangePassword = true
          await setDoc(doc(db, 'users', userCred.user.uid), {
            email: form.email.trim(),
            name: form.name.trim(),
            phone: form.phone.trim(),
            role: form.role,
            isActive: form.isActive,
            mustChangePassword: true,
            assignedPartnerIds: finalPartnerIds,
            permissions: form.permissions,
            createdAt: serverTimestamp(),
          });

          // Also create in backend API for fallback
          await createUser({
            id: userCred.user.uid,
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            role: form.role,
            isActive: form.isActive,
            permissions: form.permissions,
            assignedPartnerIds: finalPartnerIds,
          } as any);

          setSuccess('Staff account created! Initial password: Admin@123 (must change on first login)');
        } catch (fbErr: any) {
          if (fbErr?.code === 'auth/email-already-in-use') {
            setError('A login account already exists for this email address');
          } else {
            setError('Authentication error: ' + (fbErr?.message || 'unknown'));
          }
          setSubmitting(false);
          return;
        }
      }

      resetForm();
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to save staff member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (u: AppUser) => {
    const isAll = !u.assignedPartnerIds || u.assignedPartnerIds.length === 0 || u.assignedPartnerIds.includes('ALL');
    setForm({
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      role: (u.role === 'ADMIN' ? 'ADMIN' : 'STAFF'),
      isActive: u.isActive,
      accessAllPartners: isAll,
      assignedPartnerIds: isAll ? [] : (u.assignedPartnerIds || []),
      permissions: {
        ...DEFAULT_PERMISSIONS,
        ...(u.permissions || {}),
      },
    });
    setEditingId(u.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this staff account?')) return;
    try {
      await deleteUser(id);
      load();
    } catch (err: any) {
      alert('Failed to delete staff member');
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!confirm(`Reset first-login password flag for ${email}? They will use Admin@123 on login.`)) return;
    try {
      const snap = await getDocs(collection(db, 'users'));
      const targetDoc = snap.docs.find(d => d.data().email?.toLowerCase() === email.toLowerCase());
      if (targetDoc) {
        await setDoc(doc(db, 'users', targetDoc.id), { mustChangePassword: true }, { merge: true });
        alert(`Reset flag saved for ${email}. Staff member must change password on login.`);
      } else {
        alert('Could not find user profile in Firestore.');
      }
    } catch (err: any) {
      alert('Failed: ' + err.message);
    }
  };

  const staffUsers = users.filter(u => u.role === 'STAFF' || u.role === 'ADMIN');
  const partnerUsers = users.filter(u => u.role === 'PARTNER');

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Staff Management</h1>
          <p className="page-subtitle">Add staff members, assign partner factory access, and configure permissions</p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={16} /> Add Staff
        </button>
      </div>

      {success && !showForm && (
        <div style={{ padding: '12px 16px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 500 }}>
          {success}
        </div>
      )}

      {/* Staff Accounts Section */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserCheck size={18} style={{ color: '#6366f1' }} />
            <span style={{ fontWeight: 600, color: '#0f172a' }}>Internal Staff & Operations ({staffUsers.length})</span>
          </div>
          <span style={{ fontSize: 12, color: '#64748b' }}>Partners are created automatically from the <strong>Partners</strong> page</span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Staff Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Assigned Partner Access</th>
              <th>Status</th>
              <th style={{ width: 150 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staffUsers.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No staff members added yet. Click &quot;+ Add Staff&quot; to add one.</td></tr>
            ) : staffUsers.map(u => {
              const isAll = !u.assignedPartnerIds || u.assignedPartnerIds.length === 0 || u.assignedPartnerIds.includes('ALL');
              const assignedNames = isAll
                ? 'All Partners'
                : (u.assignedPartnerIds || []).map(pid => partners.find(p => p.id === pid)?.companyName || pid).join(', ');

              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: u.role === 'ADMIN' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0
                      }}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span style={{ fontWeight: 600, color: '#0f172a', display: 'block' }}>{u.name}</span>
                        {u.phone && <span style={{ fontSize: 11, color: '#94a3b8' }}>{u.phone}</span>}
                      </div>
                    </div>
                  </td>
                  <td style={{ color: '#475569' }}>{u.email}</td>
                  <td>
                    <span className={`badge badge-${u.role.toLowerCase()}`}>{u.role}</span>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 12, padding: '3px 8px', borderRadius: 6,
                      background: isAll ? '#eff6ff' : '#f8fafc',
                      color: isAll ? '#1d4ed8' : '#334155',
                      border: '1px solid #e2e8f0'
                    }}>
                      <Building2 size={12} /> {assignedNames}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.isActive ? 'badge-active' : 'badge-inactive'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="action-btns">
                      <button className="btn-icon btn-icon-edit" onClick={() => handleEdit(u)} title="Edit Staff Permissions"><Edit2 size={15} /></button>
                      <button className="btn-icon" onClick={() => handleResetPassword(u.email)} title="Reset Password Flag" style={{ color: '#f59e0b' }}><Key size={15} /></button>
                      <button className="btn-icon btn-icon-danger" onClick={() => handleDelete(u.id)} title="Delete Staff"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Partner Accounts (Read-only reference) */}
      {partnerUsers.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#faf5ff' }}>
            <span style={{ fontWeight: 600, color: '#7e22ce', fontSize: 13 }}>
              Partner Accounts ({partnerUsers.length}) — Created via Partner Onboarding
            </span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Partner Name</th>
                <th>Login Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {partnerUsers.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</td>
                  <td style={{ color: '#475569' }}>{p.email}</td>
                  <td><span className="badge badge-partner">PARTNER</span></td>
                  <td><span className={`badge ${p.isActive ? 'badge-active' : 'badge-inactive'}`}>{p.isActive ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Staff Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={20} style={{ color: '#6366f1' }} />
                <h2>{editingId ? 'Edit Staff Member' : 'Add New Staff Member'}</h2>
              </div>
              <button className="btn-icon" onClick={resetForm}><X size={18} /></button>
            </div>

            {error && <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            {success && <div style={{ padding: '10px 14px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{success}</div>}

            {!editingId && (
              <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#334155' }}>
                <div style={{ fontWeight: 600, marginBottom: 2, color: '#1e293b' }}>🔐 Initial Password Policy:</div>
                Account will be created with default password <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: 4, fontWeight: 700, color: '#0f172a' }}>Admin@123</code>. Staff will be required to create their own new password upon first login.
              </div>
            )}

            <div className="form-grid">
              <div className="form-group full-width">
                <label>Staff Full Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Anand Kumar" />
              </div>

              <div className="form-group">
                <label>Email Address *</label>
                <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="staff@amazefab.com" disabled={!!editingId} />
              </div>

              <div className="form-group">
                <label>Phone Number</label>
                <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
              </div>

              <div className="form-group">
                <label>Role</label>
                <select className="select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as 'STAFF' | 'ADMIN' })}>
                  <option value="STAFF">Staff (Operations)</option>
                  <option value="ADMIN">Admin (Super User)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Account Status</label>
                <select className="select" value={form.isActive ? 'active' : 'inactive'} onChange={e => setForm({ ...form, isActive: e.target.value === 'active' })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Partner Facility Access */}
              <div className="form-group full-width" style={{ marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#1e293b' }}>
                  <Building2 size={16} style={{ color: '#2563eb' }} />
                  Partner Facility Access (Which partners can this staff access?)
                </label>

                <div style={{ marginTop: 6, padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10, fontWeight: 600, color: '#0f172a' }}>
                    <input
                      type="checkbox"
                      checked={form.accessAllPartners}
                      onChange={e => setForm({ ...form, accessAllPartners: e.target.checked, assignedPartnerIds: [] })}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <span>All Partners (Full Factory Network Access)</span>
                  </label>

                  {!form.accessAllPartners && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 8, maxHeight: 150, overflowY: 'auto' }}>
                      {partners.map(p => {
                        const isChecked = form.assignedPartnerIds.includes(p.id);
                        return (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#334155' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePartner(p.id)}
                              style={{ width: 15, height: 15, cursor: 'pointer' }}
                            />
                            <span>{p.companyName || p.contactPerson || p.id}</span>
                          </label>
                        );
                      })}
                      {partners.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>No partners onboarded yet</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Staff Operational Permissions */}
              <div className="form-group full-width" style={{ marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#1e293b' }}>
                  <Shield size={16} style={{ color: '#16a34a' }} />
                  Operational Permissions (What can this staff member do?)
                </label>

                <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { key: 'canViewOrders', label: 'View Orders', desc: 'See incoming & active order queues' },
                    { key: 'canManageOrders', label: 'Manage Orders', desc: 'Update statuses & garment details' },
                    { key: 'canPerformQC', label: 'Perform Quality Check (QC)', desc: 'Approve or reject cleaned clothes' },
                    { key: 'canScanTags', label: 'Scan Garment Tags', desc: 'Use camera scanner for QR barcodes' },
                    { key: 'canViewInvoices', label: 'View Invoices & Payouts', desc: 'Access rate cards & financial totals' },
                    { key: 'canAssignPartners', label: 'Assign Orders to Partners', desc: 'Route garments to specific factories' },
                    { key: 'canManageCriticalCases', label: 'Manage Critical Cases', desc: 'Handle stains, delays & garment issues' },
                  ].map(perm => {
                    const isChecked = !!(form.permissions as any)[perm.key];
                    return (
                      <div
                        key={perm.key}
                        onClick={() => handleTogglePermission(perm.key as any)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                          padding: '10px 12px', borderRadius: 8,
                          border: isChecked ? '1px solid #86efac' : '1px solid #e2e8f0',
                          background: isChecked ? '#f0fdf4' : '#fff',
                          cursor: 'pointer', transition: 'all 0.15s ease'
                        }}
                      >
                        {isChecked ? (
                          <CheckSquare size={16} style={{ color: '#16a34a', marginTop: 2, flexShrink: 0 }} />
                        ) : (
                          <Square size={16} style={{ color: '#94a3b8', marginTop: 2, flexShrink: 0 }} />
                        )}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: isChecked ? '#166534' : '#334155' }}>
                            {perm.label}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{perm.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.name.trim() || !form.email.trim() || submitting}>
                <Check size={16} /> {submitting ? 'Saving...' : editingId ? 'Update Staff Member' : 'Create Staff Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
