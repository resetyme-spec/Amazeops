import * as admin from 'firebase-admin';

// Connect to emulator
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('partners').get();
  console.log(`Found ${snap.size} partners:\n`);
  snap.docs.forEach(d => {
    const p = d.data();
    console.log(`ID: ${d.id}`);
    console.log(`  partnerCode: ${p.partnerCode}`);
    console.log(`  companyName: ${p.companyName}`);
    console.log(`  category: ${p.category}`);
    console.log(`  categoryArray: ${JSON.stringify(p.categoryArray)}`);
    console.log(`  active: ${p.active}`);
    console.log(`  services: ${JSON.stringify(p.services)}`);
    console.log(`  priority: ${p.priority}`);
    console.log('');
  });

  // Also check subOrders for ORD-001
  const subsSnap = await db.collection('subOrders').get();
  console.log(`\nFound ${subsSnap.size} sub-orders:\n`);
  subsSnap.docs.forEach(d => {
    const s = d.data();
    if (s.orderId === 'ORD-001' || s.orderId?.startsWith('ORD-001')) {
      console.log(`  ${d.id}: code=${s.subOrderCode} partner=${s.partnerCode} cat=${s.garmentCategory} garments=${JSON.stringify(s.garmentIds)}`);
    }
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
