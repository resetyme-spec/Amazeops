import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Lock, Shield, UserCheck, Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export default function Login() {
  const [roleTab, setRoleTab] = useState('partner'); // 'partner' | 'staff'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleTabChange = (tab) => {
    setRoleTab(tab);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Firebase Auth login
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);

      // Get user profile from Firestore
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      if (!userDoc.exists()) {
        // No profile yet - allow access
        navigate('/');
        return;
      }

      const userData = userDoc.data();

      // Check if must change password
      if (userData.mustChangePassword) {
        navigate('/change-password');
        return;
      }

      // Check role & validate against selected toggle tab
      const roleUpper = (userData.role || 'PARTNER').toUpperCase();
      const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SUPER_ADMIN';
      const isStaff = roleUpper === 'STAFF';
      const isPartner = roleUpper === 'PARTNER';

      const allowedRoles = ['PARTNER', 'STAFF', 'ADMIN', 'SUPER_ADMIN'];
      if (!allowedRoles.includes(roleUpper)) {
        setError('Access denied. Your account is not authorized for this portal.');
        await auth.signOut();
        setLoading(false);
        return;
      }

      // Role toggle validation
      if (roleTab === 'partner') {
        if (!isPartner && !isAdmin) {
          setError('This account is registered as Staff. Please switch to the Staff Login tab above.');
          await auth.signOut();
          setLoading(false);
          return;
        }
      } else if (roleTab === 'staff') {
        if (!isStaff && !isAdmin) {
          setError('This account is registered as Partner. Please switch to the Partner Login tab above.');
          await auth.signOut();
          setLoading(false);
          return;
        }
      }

      navigate('/');
    } catch (err) {
      console.error('Login error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password');
      } else {
        setError(err.message || 'Login failed');
      }
    }

    setLoading(false);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        {/* Header / Logo */}
        <div className="login-logo">
          <div className="login-icon">
            {roleTab === 'partner' ? <Shield size={32} /> : <UserCheck size={32} />}
          </div>
          <h1>Amaze Fab</h1>
          <p className="login-subtitle">
            {roleTab === 'partner' ? 'Partner Facility Portal' : 'Staff Operations & QC Portal'}
          </p>
        </div>

        {/* Role Toggle: Partner vs Staff */}
        <div className="login-toggle-wrap" role="tablist" aria-label="Login role selector">
          <button
            type="button"
            role="tab"
            aria-selected={roleTab === 'partner'}
            onClick={() => handleTabChange('partner')}
            className={`login-toggle-btn ${roleTab === 'partner' ? 'active' : ''}`}
          >
            <Shield size={16} />
            <span>Partner Login</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={roleTab === 'staff'}
            onClick={() => handleTabChange('staff')}
            className={`login-toggle-btn ${roleTab === 'staff' ? 'active' : ''}`}
          >
            <UserCheck size={16} />
            <span>Staff Login</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-banner">{error}</div>}

          <div className="form-group">
            <label>{roleTab === 'partner' ? 'Partner Email' : 'Staff Email'}</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={roleTab === 'partner' ? 'partner@amazeops.com' : 'staff@amazeops.com'}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="current-password"
                style={{ paddingRight: 42, width: '100%', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 4,
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? (
              <span className="spinner" />
            ) : (
              <>
                <LogIn size={18} />
                <span>Sign In as {roleTab === 'partner' ? 'Partner' : 'Staff'}</span>
              </>
            )}
          </button>

          <p className="login-hint">
            {roleTab === 'partner'
              ? 'Access orders, processing pipeline & settlement invoices'
              : 'Access assigned partner hubs, QC approvals & order audits'}
          </p>
        </form>
      </div>
    </div>
  );
}
