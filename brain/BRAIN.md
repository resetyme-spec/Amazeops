# AmazeFab Marketplace V1 — BRAIN.md

> **Single source of truth.** Every agent must read this first. Updated: 2026-09-15 · Brain v1.0.0

---

## 1. PROJECT IDENTITY

| Field | Value |
|---|---|
| **Name** | AmazeFab Marketplace |
| **Type** | Partner Operations Platform (Laundry Fulfillment) |
| **Platforms** | Admin Web + Staff Mobile + Partner Mobile |
| **Source System** | AmazeFab (API) |
| **V1 Boundary** | Ready for Delivery |
| **Firebase Project** | `amaze-ops` |
| **Firebase Project ID** | `amaze-ops` |
| **Android App** | `com.amaze.ops` (Amaze Ops) |
| **Web App** | `Amazeops` |
| **Project Root** | `E:\Amaze opsv1\` |
| **Brain Location** | `E:\Amaze opsv1\brain\BRAIN.md` |
| **Mind Map** | `E:\Amaze opsv1\mindmap\index.html` |

---

## 2. TECH STACK (LOCKED)

| Component | Technology |
|---|---|
| **Database** | Firebase Firestore |
| **File Storage** | Firebase Storage |
| **Authentication** | Firebase Authentication |
| **Hosting** | Firebase Hosting (Admin Web) |
| **Backend Logic** | Firebase Cloud Functions (Node.js) |
| **Admin Web Frontend** | Web app (HTML/JS or framework) |
| **Staff Mobile** | Android app (com.amaze.ops) |
| **Partner Mobile** | Android app (to be created) |
| **Rules/Security** | Firestore Security Rules + Storage Rules |

### What this means:
- NO Prisma/ORM — Firestore collections directly
- NO Express server — Cloud Functions for backend logic
- NO SQL migrations — Firestore is schemaless (but we enforce structure in code)
- Auth handled by Firebase Auth with custom claims for roles
- Media stored in Firebase Storage with security rules

---

## 3. SYSTEM BOUNDARY

### AmazeFab owns:
- Customer info, customer category
- Original orders (customer-side)
- Service master (service IDs, names)
- Garment data via API

### Marketplace owns (on Firebase):
- Partner management (Firestore: `partners` collection)
- Partner category, services, pricing
- Order operational processing (`orders` collection)
- Garment sorting → partner assignment
- Partner sub-orders
- QR/garment tracking
- Critical handling, reassignment
- QC (Admin/Staff)
- Rework
- Ready for Delivery
- Partner wallet → invoicing → payments
- Exceptions, notifications, audit trail
- Media/photos (Firebase Storage)

---

## 4. FIRESTORE DATA MODEL

### Collections Structure:

```
users/{userId} ← Firebase Auth UID as document ID
partners/{partnerId}
services/{serviceId}
partnerServices/{partnerServiceId}
partnerPricings/{pricingId}
orders/{orderId}
 ├── garments/{garmentId}
 ├── subOrders/{subOrderId}
 └── timeline/{eventId} (order timeline events)
garments/{garmentId} (top-level for cross-order queries)
 ├── scans/{scanId}
 ├── criticalCases/{caseId}
 ├── qcRecords/{qcId}
 └── media/{mediaId}
criticalCases/{caseId} (top-level for admin queue)
qcRecords/{qcId} (top-level for QC queue)
walletTransactions/{txId}
invoices/{invoiceId}
 ├── payments/{paymentId}
exceptions/{exceptionId}
auditLogs/{logId}
integrationSyncLogs/{syncId}
notifications/{notificationId}
```

### Why dual structure (subcollection + top-level)?
- Subcollections under orders for order-scoped queries
- Top-level collections for cross-cutting queries (QC queue, critical queue, wallet)
- Same data, two access patterns

---

## 5. CUSTOMER CATEGORIES & PARTNER ELIGIBILITY

| Customer | Eligible Partners |
|---|---|
| Gold | Gold only |
| Yellow | Gold, Yellow |
| Blue | Gold, Yellow, Blue |

### Implementation: Cloud Function `validatePartnerAssignment()`
- Checks: active, category eligible, service available, price exists

---

## 6. PARTNER SYSTEM

### Partner Code Format: `{CategoryInitial}{NN}` (e.g., G01, Y03, B12)
### Partner Code: UNIQUE (Firestore query constraint)

### Partner Document Fields:
```
partnerCode, companyName, category(GOLD/YELLOW/BLUE), contactPerson, phone, email,
gstNumber, address, geoLocation(latitude, longitude), active, services[],
billingPeriod(WEEKLY/FORTNIGHTLY/MONTHLY/CUSTOM), customBillingDays,
bankAccount({accountNumber, ifscCode, accountHolder}),
rating, totalOrders, totalEarnings, createdAt, updatedAt
```

### Partner Onboarding Fields:
- Company name, contact person, email, phone, address
- Geo location (lat/lng)
- GST number
- Category: GOLD / YELLOW / BLUE (admin-selectable)
- Services offered (comma-separated)
- Billing period: 1 week / 15 days / 1 month / custom days
- Bank account details (optional)
- Status: ACTIVE / INACTIVE / SUSPENDED
- Active: Yes/No toggle

### No capacity logic in V1.

---

## 7. SERVICE & PRICING

### Service Source: AmazeFab (synced to Firestore `services` collection)
### Price Priority:
1. Partner-specific price (in PartnerPricing where partnerId = specific)
2. Partner category price (in PartnerPricing where partnerCategory = partner's category)
3. Default marketplace price (in PartnerPricing where both null)

### Price effective dates: startDate, endDate fields in PartnerPricing

---

## 8. AUTHENTICATION & AUTHORIZATION

### Firebase Auth:
- **Admin/Staff:** Email/Password signup (created by existing Admin)
- **Partners:** Email/Password or Phone (created by Admin)
- **Custom Claims:** `role` (admin, staff, partner), `partnerId` (for partners)

### Security Rules approach:
- Firestore rules enforce role-based access
- Partners can only read/write their own data
- Staff can read operational data but NOT financial admin
- Admin has full access

### Cloud Functions for sensitive operations:
- Order ingest (validates, deduplicates)
- Wallet credit (ensures single credit per garment)
- Financial calculations

---

## 9. ORDER INTAKE (AmazeFab → Firebase)

### Flow:
```
AmazeFab → HTTPS Callable Cloud Function (ingestOrder)
 → Validate
 → Duplicate Check (query by externalOrderId)
 → Create/Update Firestore documents
 → Return order reference
```

### Idempotency:
- Query `orders` collection where `externalOrderId == payload.orderId` AND `sourceSystem == 'AMAZEFAB'`
- If exists → return existing, don't duplicate

### Sync Failure:
- Write to `integrationSyncLogs` collection
- Status: PENDING, SUCCESS, FAILED, RETRYING, INCOMPLETE
- Admin can view and retry from Firestore

---

## 10. IDENTIFIERS

| Entity | Identifiers |
|---|---|
| Order | Firebase doc ID, externalOrderId (AmazeFab), originalOrderNumber |
| Garment | Firebase doc ID, amazeFabGarmentId, garmentCode, qrCode (UNIQUE) |
| Partner Sub-order | `{originalOrderNumber}-{partnerCode}` as subOrderNumber |

---

## 11. GARMENT STATE MACHINE (LOCKED)

```
RECEIVED
 ↓
PENDING_SORTING
 ↓
ASSIGNED
 ↓
ACCEPTED
 ↓
IN_PROCESSING
 ├──────────────→ CRITICAL
 │ Admin/Staff Review
 │ ├── REASSIGN → New Partner → ASSIGNED → ACCEPTED → IN_PROCESSING
 │ └── RETAIN + Updated Instruction → ACCEPTED → IN_PROCESSING
 ↓
QC_PENDING
 ↓
QC_PASSED → READY_FOR_DELIVERY ← V1 END
 ↓
QC_NOT_OK → REWORK → QC_PENDING (loop, max 3)
```

> **Note:** SERVICE_COMPLETED and SENT_FOR_QC states are simplified — garments go directly IN_PROCESSING → QC_PENDING
> **WALLET_CREDIT** is a WalletTransaction record, NOT a garment state

### Status values (stored as string field in garment document):
```
RECEIVED, PENDING_SORTING, ASSIGNED, ACCEPTED, IN_PROCESSING,
CRITICAL, QC_PENDING, QC_PASSED, QC_NOT_OK, REWORK, READY_FOR_DELIVERY
```

---

## 12. PROGRESS FORMULA

```
Progress % = (QC_PASSED + READY_FOR_DELIVERY) / Total garments × 100
```

### Missing garment handling:
- Confirmed missing → excluded from denominator
- Creates Exception for Admin resolution

---

## 13. PARTNER WORKFLOW

### Acceptance (Mobile App):
- Partner sees assigned sub-order
- Reviews garments, services, instructions, photos
- Taps Accept → Cloud Function updates garments to ACCEPTED

### QR Scan (Mobile App):
- Partner scans QR using camera
- App validates: garment exists, belongs to this partner, correct sub-order
- Creates GarmentScan document
- Moves garment to IN_PROCESSING

### Service Completion (Mobile App):
- Partner marks garment complete
- Optional photo + comment
- Updates garment status to QC_PENDING

### Critical (Mobile App):
- Partner marks garment CRITICAL with description + photo
- Creates CriticalCase document
- Admin/Staff reviews and resolves

---

## 14. CRITICAL RESOLUTION

### Option A — Reassign:
- Admin selects new partner (validated)
- Cloud Function moves garment to new partner
- Original partner: `appliedPrice = null`, earns ₹0
- New partner: fresh price resolved on QC pass

### Option B — Retain:
- Admin provides updated instruction + optional photo
- Garment goes back to ACCEPTED
- Partner sees new instruction, can Accept or mark Critical again

---

## 15. QC (Admin/Staff Web App)

### One garment at a time.
### QC Decision:
- PASS → garment → READY_FOR_DELIVERY, trigger wallet credit Cloud Function
- FAIL → garment → REWORK, add instruction, max 3 attempts

### QC Record stored in:
- `garments/{garmentId}/qcRecords/{qcId}` (subcollection)
- AND `qcRecords/{qcId}` (top-level for QC queue queries)

---

## 16. WALLET

### Wallet Credit (Cloud Function):
- Triggered after QC_PASSED
- Checks `walletCredited` flag on garment
- Resolves price using pricing logic
- Creates `walletTransactions/{txId}` with status `AVAILABLE`
- Sets `garment.walletCredited = true`

### Wallet States:
- `AVAILABLE` — QC-passed, not yet invoiced
- `INVOICED` — Included in invoice
- `PAID` — Payment received

### Wallet Summary (Cloud Function):
- Aggregates by partner
- Calculates: available, invoiced, paid, totalEarned

---

## 17. INVOICING (NOT BUILT)

### Schema exists in Prisma reference, needs Firestore implementation
### Partner raises invoice from available wallet transactions
### Admin approves
### Payment recorded

---

## 18. NOTIFICATIONS

### Firebase Cloud Messaging (FCM):
- Admin/Staff/Partner devices registered for FCM tokens
- Cloud Functions send notifications on events
- Also stored in Firestore `notifications/{id}` for in-app viewing

---

## 19. FIREBASE SECURITY RULES

### Current Firestore Rules (BLOCKING):
```
match /{document=**} {
 allow read, write: if false;
}
```
**⚠ MUST CHANGE before any development.** Rules need to be updated to allow authenticated access with role-based restrictions.

### Required Rules:
- Admin: read/write all collections
- Staff: read orders, garments, QC; write QC, critical, garment status
- Partner: read own subOrders/garments only; write own processing data
- All: write access gated by matching userId to document owner

---

## 20. FIREBASE STORAGE

### Current State: Empty
### Rules: Default (authenticated read/write to their own path)

### Usage:
- Garment photos (before, stain, critical, instruction, completion, QC, rework)
- File path pattern: `garments/{garmentId}/{type}_{timestamp}.jpg`

---

## 21. DEVELOPMENT PHASES — FIREBASE VERSION

### Phase 1 — Firebase Setup + Foundation
| Component | Status |
|---|---|
| Firebase project config | ✅ Done (amaze-ops) |
| Firestore security rules | ⚠ BLOCKING — need to update from deny-all |
| Firebase Storage rules | ⚠ Needs configuration |
| Firebase Auth setup | ⚠ Needs configuration |
| Data model (Firestore collections) | ✅ Designed (see §4) |
| Cloud Functions | 🟡 Partial — 8 callable functions implemented (see §21a) |
| Admin Web frontend | 🟡 Partial — Auth, Dashboard, Orders, Partners, Invoices, QC, Critical Cases, Settings pages built |

### Phase 1a — Cloud Functions Implemented
| Function | Purpose |
|---|---|
| `apiCreateOrder` | Create order with customer details + garments |
| `apiAddGarmentsToOrder` | Add garments to existing order |
| `apiAssignGarmentsToPartner` | Assign garments to partner for processing |
| `apiCreatePartner` | Onboard new partner (company, category, GST, billing, geo) |
| `apiUpdatePartner` | Update partner profile |
| `apiDeletePartner` | Suspend/deactivate partner |
| `apiCreateCriticalCase` | Report critical issue on a garment |
| `apiSubmitQCResult` | Submit QC pass/fail result |
| `apiCreateInvoice` | Generate invoice from wallet transactions |
| `apiApproveInvoice` | Admin approve/reject invoice |
| `apiRecordPayment` | Record payment against invoice |

> These are scaffolded in `functions/src/index.ts`. Full business logic (validation, pricing, wallet credit) still needs implementation.

### Phase 1b — Admin Web Frontend Built
| Page | Route | Features |
|---|---|---|
| Login | `/login` | Firebase email/password auth |
| Dashboard | `/` | Stats cards (orders, revenue, critical, invoices, partners) + recent orders table |
| Orders | `/orders` | List with status filter, new order form |
| Order Detail | `/orders/:id` | Garments list, add garment form |
| Partners | `/partners` | Partner listing with status |
| Invoices | `/invoices` | Invoice listing with amounts |
| QC Check | `/qc` | Single garment QC pass/fail submission |
| Critical Cases | `/critical` | Sorted by severity (CRITICAL→LOW) |
| Settings | `/settings` | Profile, notifications, integrations tabs |

**Stack:** React 19 + TypeScript + Vite + React Router + TanStack Query + Lucide icons
**Location:** `E:\Amaze opsv1\web\`

### Phase 2 — Core Operations
| Component | Status |
|---|---|
| Order ingest from AmazeFab | ❌ Not started |
| Sorting/assignment workflow | ❌ Not started — Cloud Function scaffold exists |
| Partner sub-orders | ❌ Not started |
| Partner Mobile (Android) | ❌ Not started |
| QR scanning | ❌ Not started |
| Processing workflow | ❌ Not started |
| Critical workflow | 🟡 Function scaffold only |
| Reassignment | ❌ Not started |

### Phase 3 — QC
| Component | Status |
|---|---|
| QC queue (Admin/Staff) | 🟡 QC page built, single garment input |
| QC perform | 🟡 Pass/Fail with notes |
| Rework loop | ❌ Not started (max 3 attempts) |
| Ready for Delivery | ❌ Not started |

### Phase 4 — Finance
| Component | Status |
|---|---|
| Wallet credit Cloud Function | ❌ Not started |
| Wallet summary | ❌ Not started |
| Invoice generation | 🟡 Function scaffold + UI page |
| Payment recording | 🟡 Function scaffold |
| GST calculation | ❌ Not started |

### Phase 5 — Control
| Component | Status |
|---|---|
| Dashboards | 🟡 Basic dashboard built |
| Notifications (FCM) | ❌ Not started |
| Reports | ❌ Not started |
| Search/Filter | 🟡 Basic status filters on orders |
| Audit logs | ❌ Not started |

---

## 22. IMMEDIATE NEXT STEPS

1. **Update Firestore Security Rules** — current rules block everything
2. **Set up Firebase Storage Rules** — define paths and access
3. **Configure Firebase Auth** — enable email/password, set up custom claims
4. **Initialize Firebase Cloud Functions** — `firebase init functions`
5. **Build order ingest function** — first Cloud Function, tests idempotency
6. **Build Admin Web frontend** — starts with order management
7. **Build Partner Mobile app** — starts with order viewing

---

## 23. LOCKED BUSINESS RULES

1. AmazeFab = source for customer/order/service. Marketplace = partner ops + finance.
2. Gold customer → Gold partner only. Yellow → Gold/Yellow. Blue → Gold/Yellow/Blue.
3. Partner must have BOTH category eligibility AND service availability.
4. One order can split across multiple partners.
5. Critical is garment-level only.
6. Reassignment before QC → original partner earns ₹0.
7. QC performed by Admin/Staff, one garment at a time.
8. QC failure → rework. Max 3 attempts then Admin override.
9. Only QC approval can create Ready for Delivery.
10. Wallet credit ONLY after QC_PASSED. Never before. Never twice.
11. 1 wallet tx = 1 invoice line.
12. Multiple/partial payments supported.
13. Partner sees ONLY own data. Full Firestore security rule enforcement.
14. No capacity management in V1.
15. V1 ends at Ready for Delivery.

---

## 24. FIREBASE CONFIG

### Android App (Amaze Ops):
```
Package: com.amaze.ops
App ID: 1:220706809252:android:1f55ba9c6fde87b4cd31
```

### Web App (Amazeops):
```
App ID: 1:220706809252:web:430965ad5e7e6687b4cd31
Auth Domain: amaze-ops.firebaseapp.com
Project ID: amaze-ops
Storage Bucket: amaze-ops.firebasestorage.app
Messaging Sender: 220706809252
Measurement ID: G-M1WM5PM4T0
```

---

## 25. CHANGE LOG

| Date | Version | Change |
|---|---|---|
| 2026-09-15 | 0.1.0 | Initial Brain seeded from V1 Spec + review findings |
| 2026-09-15 | 0.2.0 | Brain updated with actual codebase state from E:\Amazeops |
| 2026-09-15 | 1.0.0 | Architecture changed to Firebase. Firestore + Storage + Auth + Cloud Functions. Prisma/Express removed. |
| 2026-09-15 | 1.1.0 | Admin Web frontend built (React + Vite). 8 Cloud Function scaffolds created. QC, Orders, Invoices, Partners, Critical Cases pages operational. |

---

*This file is the BRAIN. All agents must read it first.*
