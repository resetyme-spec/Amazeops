const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();

async function cleanAll() {
 // Delete all orders
 const ordersSnap = await db.collection('orders').get();
 console.log(`orders: ${ordersSnap.size}`);
 if (ordersSnap.size > 0) {
  const batch = db.batch();
  ordersSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log('Deleted all orders!');
 }

 // Delete all subOrders
 const subOrdersSnap = await db.collection('subOrders').get();
 console.log(`subOrders: ${subOrdersSnap.size}`);
 if (subOrdersSnap.size > 0) {
  const batch = db.batch();
  subOrdersSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log('Deleted all subOrders!');
 }

 // Delete all users
 const usersSnap = await db.collection('users').get();
 console.log(`users: ${usersSnap.size}`);
 if (usersSnap.size > 0) {
  const batch = db.batch();
  usersSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log('Deleted all users!');
 }

 // Delete all partners
 const partnersSnap = await db.collection('partners').get();
 console.log(`partners: ${partnersSnap.size}`);
 if (partnersSnap.size > 0) {
  const batch = db.batch();
  partnersSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log('Deleted all partners!');
 }

 process.exit(0);
}

cleanAll().catch(e => { console.error(e); process.exit(1); });
