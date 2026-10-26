const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();

async function checkAuth() {
 try {
  const auth = admin.auth();
  const result = await auth.listUsers(10);
  console.log('Firebase Auth users:', result.users.map(u => ({ uid: u.uid, email: u.email })));
 } catch (err) {
  console.log('Cannot list Auth users:', err.message);
 }
 process.exit(0);
}
checkAuth();
