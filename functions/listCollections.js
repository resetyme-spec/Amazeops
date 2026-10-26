const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();
db.listCollections().then(cols => {
  console.log('Collections:', cols.map(c => c.id));
}).catch(e => console.error(e)).finally(() => process.exit(0));
