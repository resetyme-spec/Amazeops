const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();

async function createAdmin() {
 // Check if admin user exists in Firestore
 const userDoc = await db.collection('users').doc('admin').get();
 if (userDoc.exists) {
  console.log('Admin user already exists:', userDoc.data());
 } else {
  console.log('Creating admin user...');
  // The admin user in Firebase Auth would have a UID - let's create the Firestore doc
  // First, let's check what UID the admin has by listing users
  const auth = admin.auth();
  try {
   const user = await auth.getUserByEmail('admin@amazefab.com');
   console.log('Found auth user with UID:', user.uid);

   // Create/update the Firestore user document
   await db.collection('users').doc(user.uid).set({
    name: 'Admin',
    email: 'admin@amazefab.com',
    role: 'ADMIN',
    isActive: true,
    createdAt: new Date().toISOString(),
   });
   console.log('Admin user document created in Firestore!');
  } catch (err) {
   console.log('Auth user not found. Error:', err.message);
   console.log('You need to create the Firebase Auth user first, or the user was deleted.');
  }
 }

 // List all users in Firestore for reference
 const allUsers = await db.collection('users').get();
 console.log('\nAll users in Firestore:', allUsers.size);
 allUsers.forEach(doc => console.log(' -', doc.id, doc.data()));

 process.exit(0);
}

createAdmin().catch(e => { console.error(e); process.exit(1); });
