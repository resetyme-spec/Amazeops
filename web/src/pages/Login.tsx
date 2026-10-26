import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, AlertCircle } from 'lucide-react';

export default function Login() {
 const { user, signIn, loading } = useAuth();
 const navigate = useNavigate();
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [error, setError] = useState('');
 const [submitting, setSubmitting] = useState(false);

 if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;
 if (user) return <Navigate to="/" replace />;

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setError('');
 setSubmitting(true);
 try {
 await signIn(email, password);
 navigate('/');
 } catch (err: any) {
 setError(err.message?.replace('Firebase:', '').trim() || 'Invalid credentials');
 } finally { setSubmitting(false); }
 };

 return (
 <div className="login-page">
 <div className="login-card">
 <div className="login-header">
 <div className="login-logo"><Lock size={32} /></div>
 <h1>Amaze Fab</h1>
 <p>Operations Portal</p>
 </div>
 <form onSubmit={handleSubmit} className="login-form">
 {error && <div className="error-banner"><AlertCircle size={16} /><span>{error}</span></div>}
 <div className="form-group">
 <label htmlFor="email">Email</label>
 <input id="email" className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus />
 </div>
 <div className="form-group">
 <label htmlFor="password">Password</label>
 <input id="password" className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
 </div>
 <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
 {submitting ? 'Signing in...' : 'Sign In'}
 </button>
 <p className="login-hint">Demo: admin@amazefab.com / password</p>
 </form>
 </div>
 </div>
 );
}
