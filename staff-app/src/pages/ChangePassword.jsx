import { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function ChangePassword({ onComplete }) {
 const [currentPassword, setCurrentPassword] = useState('');
 const [newPassword, setNewPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(false);
 const [showPasswords, setShowPasswords] = useState(false);

 const handleSubmit = async (e) => {
 e.preventDefault();
 setError('');

 if (!currentPassword || !newPassword || !confirmPassword) {
 setError('All fields are required');
 return;
 }

 if (newPassword.length < 6) {
 setError('New password must be at least 6 characters');
 return;
 }

 if (newPassword !== confirmPassword) {
 setError('New passwords do not match');
 return;
 }

 setLoading(true);
 try {
 const user = auth.currentUser;
 if (!user) throw new Error('No user logged in');

 // Re-authenticate with current password
 const credential = EmailAuthProvider.credential(user.email, currentPassword);
 await reauthenticateWithCredential(user, credential);

 // Update password
 await updatePassword(user, newPassword);

 // Success - call onComplete
 onComplete();
 } catch (err) {
 if (err.code === 'auth/wrong-password') {
 setError('Current password is incorrect');
 } else if (err.code === 'auth/too-many-requests') {
 setError('Too many attempts. Please try again later.');
 } else {
 setError(err.message || 'Failed to change password');
 }
 }
 setLoading(false);
 };

 return (
 <div className="change-password-screen">
 <div className="change-password-card">
 <div className="change-password-header">
 <div className="change-password-icon"><Lock size={32} /></div>
 <h1>Change Password</h1>
 <p>For security, please change your default password</p>
 </div>

 {error && <div className="error-banner"><AlertCircle size={16} /> {error}</div>}

 <form onSubmit={handleSubmit} className="change-password-form">
 <div className="form-group">
 <label>Current Password</label>
 <div className="password-input">
 <input
 className="form-input"
 type={showPasswords ? 'text' : 'password'}
 value={currentPassword}
 onChange={e => setCurrentPassword(e.target.value)}
 placeholder="Enter current password (123456)"
 required
 />
 <button type="button" className="password-toggle" onClick={() => setShowPasswords(!showPasswords)}>
 {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
 </button>
 </div>
 </div>

 <div className="form-group">
 <label>New Password</label>
 <div className="password-input">
 <input
 className="form-input"
 type={showPasswords ? 'text' : 'password'}
 value={newPassword}
 onChange={e => setNewPassword(e.target.value)}
 placeholder="Minimum 6 characters"
 required
 />
 <button type="button" className="password-toggle" onClick={() => setShowPasswords(!showPasswords)}>
 {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
 </button>
 </div>
 </div>

 <div className="form-group">
 <label>Confirm New Password</label>
 <div className="password-input">
 <input
 className="form-input"
 type={showPasswords ? 'text' : 'password'}
 value={confirmPassword}
 onChange={e => setConfirmPassword(e.target.value)}
 placeholder="Re-enter new password"
 required
 />
 </div>
 </div>

 <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
 {loading ? <span className="spinner" /> : 'Change Password'}
 </button>
 </form>
 </div>
 </div>
 );
}
