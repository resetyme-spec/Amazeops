const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();

async function check() {
  const orderId = 'ORD-1793024089423';
  console.log('--- Checking Order: ' + orderId + ' ---');

  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    const oData = orderSnap.data();
    console.log('Order status:', oData.status);
    console.log('Order qcStatus:', oData.qcStatus);
    console.log('Garments count:', oData.garments?.length);
    (oData.garments || []).forEach((g, i) => {
      console.log(`Garment ${i + 1} (${g.garmentId}):`);
      console.log('  brand:', g.brand);
      console.log('  comments:', g.comments);
      console.log('  photos:', JSON.stringify(g.photos));
      console.log('  qcPhotos:', JSON.stringify(g.qcPhotos));
      console.log('  qcStatus:', g.qcStatus);
      console.log('  status:', g.status);
    });
  } else {
    console.log('Order doc not found');
  }

  console.log('\n--- Checking subOrders ---');
  const subsSnap = await db.collection('subOrders').where('orderId', '==', orderId).get();
  console.log('Sub-orders count:', subsSnap.size);
  subsSnap.docs.forEach(d => {
    const s = d.data();
    console.log(`SubOrder ${d.id}: status=${s.status}, qcStatus=${s.qcStatus}`);
    console.log('  garmentIds:', s.garmentIds);
  });

  console.log('\n--- Checking qcRecords ---');
  const qcSnap = await db.collection('qcRecords').where('orderId', '==', orderId).get();
  console.log('qcRecords count:', qcSnap.size);
  qcSnap.docs.forEach(d => {
    const qData = d.data();
    console.log(`qcRecord ${d.id}: status=${qData.status}, submittedBy=${qData.submittedBy}`);
    console.log('  garmentUpdates:', JSON.stringify(qData.garmentUpdates, null, 2));
  });

  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
