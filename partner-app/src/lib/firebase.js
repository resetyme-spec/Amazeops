import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
 apiKey: "AIzaSyCdg49Z-UMSYpAkxck0O1BCDHK0B6MQ9ic",
 authDomain: "amaze-ops.firebaseapp.com",
 projectId: "amaze-ops",
 storageBucket: "amaze-ops.firebasestorage.app",
 messagingSenderId: "220706809252",
 appId: "1:220706809252:web:430965ad5e7e6687b4cd31",
 measurementId: "G-M1WM5PM4T0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
