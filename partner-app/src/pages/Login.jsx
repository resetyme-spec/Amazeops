import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Lock } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export default function Login() {
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(false);
 const navigate = useNavigate();

 const handleSubmit = async (e) => {
 e.preventDefault();
 setError('');
 setLoading(true);

 try {
 // Firebase Auth login
 const cred = await signInWithEmailAndPassword(auth, email, password);

 // Get user profile from Firestore
 const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
 if (!userDoc.exists()) {
 // No profile yet - allow access without mustChangePassword check
 navigate('/');
 return;
 }

 const userData = userDoc.data();

 // Check if must change password
 if (userData.mustChangePassword) {
 navigate('/change-password');
 return;
 }

 // Check role and redirect
 if (userData.role === 'PARTNER') {
 navigate('/');
 } else {
 setError('Access denied. Partner app for partners only.');
 await auth.signOut();
 }
} catch (err) {
 console.error('Login error:', err);
 if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
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
 <div className="login-logo">
 <div className="login-icon"><Lock size={32} /></div>
 <h1>Amaze Fab</h1>
 <p className="login-subtitle">Partner App</p>
 </div>
 <form onSubmit={handleSubmit} className="login-form">
 {error && <div className="error-banner">{error}</div>}
 <div className="form-group">
 <label>Email</label>
 <input
 className="form-input"
 type="email"
 value={email}
 onChange={e => setEmail(e.target.value)}
 placeholder="partner@company.com"
 required
 autoComplete="email"
 />
 </div>
 <div className="form-group">
 <label>Password</label>
 <input
 className="form-input"
 type="password"
 value={password}
 onChange={e => setPassword(e.target.value)}
 placeholder="Enter password"
 required
 autoComplete="current-password"
 />
 </div>
 <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
 {loading ? <span className="spinner" /> : <><LogIn size={18} /> Sign In</>}
 </button>
 <p className="login-hint">Use your partner email and password</p>
 </form>
 </div>
 </div>
 );
}
