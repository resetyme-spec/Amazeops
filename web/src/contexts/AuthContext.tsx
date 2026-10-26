import { useState, useEffect } from 'react';
import { createContext, useContext } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User as FBUser } from 'firebase/auth';
import { doc, getDoc, setDoc, query, where, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { User, Role } from '../types';

const DUMMY_API_URL = 'http://localhost:3002';
const DUMMY_API_KEY = 'amaze-fab-super-admin-key-2026';

interface AuthContextType {
 user: User | null;
 firebaseUser: FBUser | null;
 loading: boolean;
 signIn: (email: string, password: string) => Promise<void>;
 signOut: () => Promise<void>;
 hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toDate(v: any): Date {
 if (!v) return new Date();
 if (v instanceof Date) return v;
 if (typeof v?.toDate === 'function') return v.toDate();
 if (typeof v === 'string') return new Date(v);
 return new Date();
}

async function tryDummyApiLogin(email: string, password: string): Promise<User | null> {
 try {
  const res = await fetch(`${DUMMY_API_URL}/api/users`, {
   headers: { 'x-api-key': DUMMY_API_KEY },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const users = data.users || [];
  const match = users.find((u: any) => u.email === email && u.password === password);
  if (!match) return null;
  return {
   id: match.id || match.userId,
   email: match.email || email,
   name: match.name || '',
   role: match.role || 'STAFF',
   partnerId: match.partnerId,
   phone: match.phone,
   isActive: match.isActive !== false,
   createdAt: toDate(match.createdAt),
  };
 } catch {
  return null;
 }
}

async function loadOrBootstrapUser(fbUser: FBUser): Promise<User | null> {
 try {
  const ref = doc(db, 'users', fbUser.uid);
  let snap = await getDoc(ref);
  let uid: string | null = fbUser.uid;

  // 1) No doc at UID — look up by email
  if (!snap.exists()) {
   const q = query(collection(db, 'users'), where('email', '==', fbUser.email || ''));
   const qs = await getDocs(q);
   if (!qs.empty) {
    snap = qs.docs[0];
    uid = snap.id;
   } else {
    // Check dummy API for role (local-dev only)
    let apiRole: Role = 'STAFF';
    try {
     const apiRes = await fetch(`${DUMMY_API_URL}/api/users?email=${encodeURIComponent(fbUser.email || '')}`, {
      headers: { 'x-api-key': DUMMY_API_KEY },
     });
     if (apiRes.ok) {
      const apiData = await apiRes.json();
      const apiUsers = apiData.users || [];
      const apiMatch = apiUsers.find((u: any) => u.email === fbUser.email);
      if (apiMatch?.role) apiRole = apiMatch.role as Role;
     }
    } catch { /* ignore */ }

    // Bootstrap Firestore user doc with the real role
    const data = {
     email: fbUser.email || '',
     name: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'User'),
     role: apiRole,
     isActive: true,
     createdAt: serverTimestamp(),
    };
    await setDoc(ref, data);
    return {
     id: fbUser.uid,
     email: data.email,
     name: data.name,
     role: data.role as Role,
     isActive: true,
     createdAt: new Date(),
    };
   }
  }

  const d = snap.data() as any;
  return {
   id: uid!,
   email: d.email || fbUser.email || '',
   name: d.name || '',
   role: (d.role || 'STAFF') as Role,
   partnerId: d.partnerId,
   phone: d.phone,
   isActive: d.isActive !== false,
   createdAt: toDate(d.createdAt),
  };
 } catch (e) {
  console.error('loadOrBootstrapUser failed:', e);
  return null;
 }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
 const [user, setUser] = useState<User | null>(null);
 const [firebaseUser, setFirebaseUser] = useState<FBUser | null>(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (fbUser) => {
   setFirebaseUser(fbUser);
   if (fbUser) {
    const u = await loadOrBootstrapUser(fbUser);
    setUser(u);
   } else {
    setUser(null);
   }
   setLoading(false);
  });
  return unsub;
 }, []);

 const signIn = async (email: string, password: string) => {
  setLoading(true);
  try {
   await signInWithEmailAndPassword(auth, email, password);
   // The onAuthStateChanged listener will load/bootstrap the user doc.
  } catch (err) {
   const code = (err as any)?.code as string | undefined;
   if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    // Try Firestore fallback
    try {
     const q = query(collection(db, 'users'), where('email', '==', email));
     const usersSnap = await getDocs(q);
     const match = usersSnap.docs.find(d => (d.data() as any).password === password);
     if (match) {
      const md = match.data() as any;
      setUser({
       id: match.id, email: md.email || email, name: md.name || '',
       role: md.role || 'STAFF', partnerId: md.partnerId, phone: md.phone,
       isActive: md.isActive !== false, createdAt: toDate(md.createdAt),
      });
      setFirebaseUser(null);
      return;
     }
    } catch {}

    // Fallback: try Dummy API users
    const apiUser = await tryDummyApiLogin(email, password);
    if (apiUser) {
     setUser(apiUser);
     setFirebaseUser(null);
     return;
    }
   }
   throw new Error('Invalid email or password');
  } finally {
   setLoading(false);
  }
 };

 const signOut = async () => { await fbSignOut(auth); setUser(null); };
 const hasRole = (...roles: Role[]) => user ? roles.includes(user.role) : false;

 return (
  <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, signOut, hasRole }}>
   {children}
  </AuthContext.Provider>
 );
}

export function useAuth() {
 const ctx = useContext(AuthContext);
 if (!ctx) throw new Error('useAuth must be used within AuthProvider');
 return ctx;
}
