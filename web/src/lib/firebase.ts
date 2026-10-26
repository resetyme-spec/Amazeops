import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
 apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCdg49Z-UMSYpAkxck0O1BCDHK0B6MQ9ic',
 authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'amaze-ops.firebaseapp.com',
 projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'amaze-ops',
 storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'amaze-ops.firebasestorage.app',
 messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '220706809252',
 appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:220706809252:web:430965ad5e7e6687b4cd31',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
