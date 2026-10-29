import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCdg49Z-UMSYpAkxck0O1BCDHK0B6MQ9ic",
  authDomain: "amaze-ops.firebaseapp.com",
  projectId: "amaze-ops",
  storageBucket: "amaze-ops.firebasestorage.app",
  messagingSenderId: "220706809252",
  appId: "1:220706809252:web:430965ad5e7e6687b4cd31",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const orderId = 'ORD-1793024089423';
  console.log('--- Checking Order: ' + orderId + ' ---');

  const orderSnap = await getDoc(doc(db, 'orders', orderId));
  if (orderSnap.exists()) {
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
  const subsQ = query(collection(db, 'subOrders'), where('orderId', '==', orderId));
  const subsSnap = await getDocs(subsQ);
  console.log('Sub-orders count:', subsSnap.size);
  subsSnap.docs.forEach(d => {
    console.log(`SubOrder ${d.id}:`, d.data().status, 'qcStatus:', d.data().qcStatus);
  });

  console.log('\n--- Checking qcRecords ---');
  const qcQ = query(collection(db, 'qcRecords'), where('orderId', '==', orderId));
  const qcSnap = await getDocs(qcQ);
  console.log('qcRecords count:', qcSnap.size);
  qcSnap.docs.forEach(d => {
    const qData = d.data();
    console.log(`qcRecord ${d.id}: status=${qData.status}, submittedBy=${qData.submittedBy}`);
    console.log('  garmentUpdates:', JSON.stringify(qData.garmentUpdates, null, 2));
  });

  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
