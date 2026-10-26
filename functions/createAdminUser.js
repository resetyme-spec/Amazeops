const admin = require('firebase-admin');
const path = require('path');

// Try to find and use service account key
const saPaths = [
 path.join(__dirname, '..', 'serviceAccountKey.json'),
 path.join(__dirname, '..', 'service-account.json'),
 path.join(__dirname, '..', 'firebase-service-account.json'),
];

async function createAdminUser() {
 let serviceAccount;
 for (const p of saPaths) {
  try {
   serviceAccount = require(p);
   console.log('Found service account at:', p);
   break;
  } catch (e) {
   // try next
  }
 }

 if (!serviceAccount) {
  console.log('No service account key found. Trying with project ID only...');
  admin.initializeApp({ projectId: 'amaze-ops' });
 } else {
  admin.initializeApp({
   credential: admin.credential.cert(serviceAccount),
   projectId: 'amaze-ops',
  });
 }

 const db = admin.firestore();
 const auth = admin.auth();

 try {
  console.log('Creating Firebase Auth user: admin@amazefab.com');
  const userRecord = await auth.createUser({
   email: 'admin@amazefab.com',
   password: 'password',
   displayName: 'Admin',
  });
  console.log('Auth user created with UID:', userRecord.uid);

  // Create Firestore document
  await db.collection('users').doc(userRecord.uid).set({
   name: 'Admin',
   email: 'admin@amazefab.com',
   role: 'ADMIN',
   isActive: true,
   mustChangePassword: false,
   createdAt: new Date().toISOString(),
  });
  console.log('Firestore user document created!');
  console.log('\nLogin with: admin@amazefab.com / password');
 } catch (err) {
  console.error('Error creating user:', err.message);
 }

 process.exit(0);
}

createAdminUser();
