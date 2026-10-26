import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCdg49Z-UMSYpAkxck0O1BCDHK0B6MQ9ic',
  authDomain: 'amaze-ops.firebaseapp.com',
  projectId: 'amaze-ops',
  storageBucket: 'amaze-ops.firebasestorage.app',
  messagingSenderId: '220706809252',
  appId: '1:220706809252:web:430965ad5e7e6687b4cd31',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  try {
    const [ordersSnap, partnersSnap, subOrdersSnap, qcSnap] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'partners')),
      getDocs(collection(db, 'subOrders')),
      getDocs(collection(db, 'qcRecords')),
    ]);

    console.log('Orders count in Firestore:', ordersSnap.size);
    let critCount = 0;
    ordersSnap.docs.forEach(d => {
      const data = d.data();
      const crits = (data.garments || []).filter(g => g.isCritical);
      if (crits.length > 0) {
        console.log('Order with critical:', d.id, crits.length);
        critCount += crits.length;
      }
    });
    console.log('Total critical garments in Firestore:', critCount);

    console.log('Partners count in Firestore:', partnersSnap.size);
    partnersSnap.docs.forEach(d => {
      const p = d.data();
      console.log('Partner:', d.id, p.companyName, 'active:', p.active);
    });

    console.log('SubOrders count in Firestore:', subOrdersSnap.size);
    const subStatuses = {};
    subOrdersSnap.docs.forEach(d => {
      const s = d.data();
      subStatuses[s.status] = (subStatuses[s.status] || 0) + 1;
      if (s.qcStatus) subStatuses['qcStatus:' + s.qcStatus] = (subStatuses['qcStatus:' + s.qcStatus] || 0) + 1;
      if (s.deliveryStatus) subStatuses['deliv:' + s.deliveryStatus] = (subStatuses['deliv:' + s.deliveryStatus] || 0) + 1;
    });
    console.log('SubOrder statuses:', subStatuses);

    console.log('QC records count in Firestore:', qcSnap.size);
    qcSnap.docs.forEach(d => {
      console.log('QC record:', d.id, d.data().status);
    });
  } catch (err) {
    console.error('Error fetching Firestore:', err);
  }
}

check();
