const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();

async function setupAdmin() {
 // List all users to find available UIDs
 const usersSnap = await db.collection('users').get();
 console.log('Existing users:', usersSnap.size);
 usersSnap.forEach(d => console.log(' -', d.id, d.data().email));

 // We'll use the existing UID from the partner user as reference, but create admin with a known UID
 const ADMIN_UID = 'admin-local-user';
 const adminDoc = {
  id: ADMIN_UID,
  email: 'admin@amazefab.com',
  name: 'Admin',
  role: 'ADMIN',
  isActive: true,
  mustChangePassword: false,
  password: 'password', // plain text for fallback
  createdAt: new Date().toISOString(),
 };

 await db.collection('users').doc(ADMIN_UID).set(adminDoc, { merge: true });
 console.log('\nAdmin user created in Firestore with UID:', ADMIN_UID);
 console.log('Login with: admin@amazefab.com / password');
 process.exit(0);
}

setupAdmin();
