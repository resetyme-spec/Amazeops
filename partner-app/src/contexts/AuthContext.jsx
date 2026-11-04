import { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export const AuthContext = createContext({
  user: null,
  loading: true,
  login: async () => false,
  logout: () => {},
  mustChangePassword: false,
  passwordChanged: () => {},
});

export function AuthProvider(props) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Load Firestore user doc for partnerId, role, permissions, assignedPartners
        let userData = { partnerId: null, role: null, permissions: [], assignedPartners: [] };
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) userData = snap.data();
        } catch (e) {
          console.error('Failed to load user doc:', e);
        }

        const roleUpper = (userData.role || 'PARTNER').toUpperCase();
        const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SUPER_ADMIN';
        const isStaff = roleUpper === 'STAFF';
        const isPartner = roleUpper === 'PARTNER';

        // Permissions parsing: e.g. ['QC_APPROVAL', 'INVOICES_VIEW']
        const rawPermissions = Array.isArray(userData.permissions)
          ? userData.permissions.map(p => String(p).toUpperCase())
          : (userData.permission ? [String(userData.permission).toUpperCase()] : []);

        // Permission flags:
        // Staff can have granular access:
        // - 'QC_APPROVAL'
        // - 'INVOICES_VIEW'
        // If staff permissions array is empty, grant both by default for backwards compatibility
        const hasAll = rawPermissions.includes('ALL') || rawPermissions.includes('ADMIN') || isAdmin;
        const canApproveQc = isAdmin || (isStaff && (hasAll || rawPermissions.includes('QC_APPROVAL') || rawPermissions.length === 0));
        const canViewInvoices = isPartner || isAdmin || (isStaff && (hasAll || rawPermissions.includes('INVOICES_VIEW') || rawPermissions.length === 0));

        // Assigned partners scope for staff
        const assignedPartners = Array.isArray(userData.assignedPartners)
          ? userData.assignedPartners
          : (userData.partnerId ? [userData.partnerId] : []);

        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: userData.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0],
          partnerId: userData.partnerId,
          role: roleUpper,
          isAdmin,
          isStaff,
          isPartner,
          permissions: rawPermissions,
          canApproveQc,
          canViewInvoices,
          assignedPartners,
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
