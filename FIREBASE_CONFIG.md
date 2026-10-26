# Firebase Project: amaze-ops

## Project Info
- **Project Name:** Amaze ops
- **Project ID:** amaze-ops
- **Project Number:** 220706809252
- **Plan:** Blaze (Pay as you go)

## Web App
- **Nickname:** Amazeops
- **App ID:** 1:220706809252:web:430965ad5e7e6687b4cd31
- **Auth Domain:** amaze-ops.firebaseapp.com
- **Storage Bucket:** amaze-ops.firebasestorage.app
- **Messaging Sender:** 220706809252
- **Measurement ID:** G-M1WM5PM4T0

### Web SDK Config
```javascript
const firebaseConfig = {
 apiKey: "AIzaSyCdg49Z-UMSYpAkxck0O1BCDHK0B6MQ9ic",
 authDomain: "amaze-ops.firebaseapp.com",
 projectId: "amaze-ops",
 storageBucket: "amaze-ops.firebasestorage.app",
 messagingSenderId: "220706809252",
 appId: "1:220706809252:web:430965ad5e7e6687b4cd31",
 measurementId: "G-M1WM5PM4T0"
};
```

## Android App
- **Nickname:** Amaze Ops
- **Package:** com.amaze.ops
- **App ID:** 1:220706809252:android:1f55ba9c6fde87b4cd31

## Deployed Services
- ✅ Authentication (configured)
- ✅ Firestore (database — empty, rules BLOCKING)
- ✅ Storage (empty, rules needed)
- ✅ Cloud Functions (not deployed)
- ✅ FCM (configured, not implemented)
- ✅ Hosting (configured, not deployed)

## Deploy Commands

### Install
```bash
npm install -g firebase-tools
npm install
cd functions && npm install
```

### Deploy All
```bash
firebase login
firebase deploy
```

### Deploy Rules Only
```bash
firebase deploy --only firestore:rules,storage:rules
```

### Deploy Functions
```bash
firebase deploy --only functions
```

### Run Emulators (Local Dev)
```bash
firebase emulators:start
```

## Console Links
- Firebase Console: https://console.firebase.google.com/project/amaze-ops
- Authentication: /authentication
- Firestore: /firestore
- Storage: /storage
- Functions: /functions
