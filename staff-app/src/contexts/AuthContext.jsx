import { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AuthContext = createContext({ user: null, loading: true, login: async () => false, logout: () => {}, mustChangePassword: false, passwordChanged: () => {} });

export function AuthProvider(props) {
 const [user, setUser] = useState(null);
 const [loading, setLoading] = useState(true);
 const [mustChangePassword, setMustChangePassword] = useState(false);

 useEffect(() => {
 const unsub = onAuthStateChanged(auth, async (fbUser) => {
 if (fbUser) {
 const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
 if (userDoc.exists()) {
 const data = userDoc.data();
 setUser({
 id: fbUser.uid,
 email: fbUser.email,
 name: data.name || fbUser.email?.split('@')[0],
 role: data.role,
 });
 setMustChangePassword(data.mustChangePassword === true);
 } else {
 setUser(null);
 setMustChangePassword(false);
 }
 } else {
 setUser(null);
 setMustChangePassword(false);
 }
 setLoading(false);
 });
 return unsub;
 }, []);

 const login = async (email, password) => {
 try {
 const cred = await signInWithEmailAndPassword(auth, email, password);
 const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
 if (userDoc.exists()) {
 const data = userDoc.data();
 if (data.mustChangePassword) {
 setMustChangePassword(true);
 return true;
 }
 }
 setMustChangePassword(false);
 return true;
 } catch (err) {
 console.error('Login error:', err);
 return false;
 }
 };

 const logout = async () => {
 await fbSignOut(auth);
 setMustChangePassword(false);
 };

 const passwordChanged = () => {
 setMustChangePassword(false);
 };

 return (
 <AuthContext.Provider value={{ user, loading, login, logout, mustChangePassword, passwordChanged }}>
 {props.children}
 </AuthContext.Provider>
 );
}

export function useAuth() {
 return useContext(AuthContext);
}
