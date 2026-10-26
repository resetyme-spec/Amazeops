// Delete all orders from Firestore
const admin = require('firebase-admin');

async function deleteOrders() {
 try {
 // Use application default credentials (from gcloud auth)
 const app = admin.initializeApp({
 projectId: 'amaze-ops',
 });

 const db = admin.firestore();
 console.log('Deleting all orders...');

 const snapshot = await db.collection('orders').get();
 console.log(`Found ${snapshot.size} orders`);

 const batch = db.batch();
 snapshot.docs.forEach(doc => {
 batch.delete(doc.ref);
 });

 await batch.commit();
 console.log('Deleted all orders!');

 // Also delete users
 const usersSnap = await db.collection('users').get();
 console.log(`Found ${usersSnap.size} users`);
 const userBatch = db.batch();
 usersSnap.docs.forEach(doc => {
 userBatch.delete(doc.ref);
 });
 await userBatch.commit();
 console.log('Deleted all users!');

 process.exit(0);
 } catch (err) {
 console.error('Error:', err.message);
 process.exit(1);
 }
}

deleteOrders();
