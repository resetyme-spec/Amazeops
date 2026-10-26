import { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export const AuthContext = createContext({ user: null, loading: true, login: async () => false, logout: () => {}, mustChangePassword: false });

export function AuthProvider(props) {
 const [user, setUser] = useState(null);
 const [loading, setLoading] = useState(true);
 const [mustChangePassword, setMustChangePassword] = useState(false);

 useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
   if (firebaseUser) {
    // Load Firestore user doc for partnerId and role
    let userData = { partnerId: null, role: null };
    try {
     const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
     if (snap.exists()) userData = snap.data();
    } catch (e) { console.error('Failed to load user doc:', e); }

    setUser({
     id: firebaseUser.uid,
     email: firebaseUser.email,
     name: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
     partnerId: userData.partnerId,
     role: userData.role,
    });
    // Check if must change password
    const lastSignIn = firebaseUser.metadata?.lastSignInTime;
    const creationTime = firebaseUser.metadata?.creationTime;
    if (lastSignIn && creationTime) {
     const isFirstLogin = new Date(lastSignIn).getTime() - new Date(creationTime).getTime() < 1000;
     setMustChangePassword(isFirstLogin);
    } else {
     setMustChangePassword(false);
    }
   } else {
    setUser(null);
    setMustChangePassword(false);
   }
   setLoading(false);
  });
  return unsubscribe;
 }, []);

 const login = async (email, password) => {
  try {
   const cred = await signInWithEmailAndPassword(auth, email, password);
   const lastSignIn = cred.user.metadata?.lastSignInTime;
   const creationTime = cred.user.metadata?.creationTime;
   if (lastSignIn && creationTime) {
    const isFirstLogin = new Date(lastSignIn).getTime() - new Date(creationTime).getTime() < 1000;
    if (isFirstLogin) {
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

 const logout = () => {
  auth.signOut();
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
