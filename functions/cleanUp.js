const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();

async function cleanUp() {
 // Delete subOrders
 const subOrdersSnap = await db.collection('subOrders').get();
 console.log(`subOrders: ${subOrdersSnap.size} docs`);
 if (subOrdersSnap.size > 0) {
  const batch = db.batch();
  subOrdersSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log('Deleted all subOrders!');
 }

 // Check partners
 const partnersSnap = await db.collection('partners').get();
 console.log(`partners: ${partnersSnap.size} docs`);

 // Check services
 const servicesSnap = await db.collection('services').get();
 console.log(`services: ${servicesSnap.size} docs`);

 // Check settings
 const settingsSnap = await db.collection('settings').get();
 console.log(`settings: ${settingsSnap.size} docs`);

 process.exit(0);
}

cleanUp().catch(e => { console.error(e); process.exit(1); });
