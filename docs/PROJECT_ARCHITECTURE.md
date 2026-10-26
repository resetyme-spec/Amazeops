# Amaze Fab Operations — Project Architecture

A complete reference covering every module, the data flow between them, the data model, authentication, and the role of each app in the system.

---

## 1. High-Level Overview

**Amaze Fab Ops** is the laundry & dry-cleaning operations control plane for *Amaze Fab*. It receives orders from a customer-facing source app, assigns them to partner vendors, tracks quality control, manages invoicing, and logs every action.

The repo is a monorepo of **four separately deployable applications** plus shared services:

| App / Service        | Port       | Stack                          | Purpose                                                                                  |
| -------------------- | ---------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| `web/`               | `5173`     | React 19 + Vite + Firebase     | **Real product.** Admin console used by ops staff to manage orders, partners, invoices. |
| `dummy-order-app/`   | `3002`     | Express (Node)                 | **Mock backend.** Simulates the customer-facing order source. Today it both serves and creates orders; in production a real customer app will replace it. |
| `partner-app/`       | (not run)  | Vite + React                   | Future: per-partner vendor portal (scan QR, update status, upload photos).                |
| `staff-app/`         | (not run)  | Vite + React                   | Future: field-staff QC app (inspect garments, mark critical cases).                      |
| `functions/`         | (cloud)    | Firebase Cloud Functions       | Auth helpers, data-fix scripts, integration scripts.                                     |
| `firebase.json`      | emulators  | Firestore / Storage / Auth     | Shared Firebase config + emulator ports.                                                 |

The legacy `src/` (Vite) at the repo root and the `brain/`, `mindmap/`, `prisma/`, `scripts/` folders contain planning artifacts and earlier prototypes — they are **not** part of the running system.

---

## 2. Flow Diagrams

### 2.1 Order lifecycle (current, end-to-end)

```
┌─────────────────────────┐                                 ┌──────────────────────────┐
│  dummy-order-app :3002  │   REST + x-api-key header       │   admin-panel :5173      │
│  (Express mock backend)  │ ───────────────────────────────►│   (React admin)          │
│                         │   GET /api/orders               │                          │
│  - POST /api/orders     │   GET /api/orders/:id           │  - Orders list           │
│  - POST /api/users      │   GET /api/users                │  - Order detail          │
│  - in-memory store      │   GET /api/services             │  - Partners              │
│                         │                                 │  - Users                 │
└─────────────────────────┘                                 │  - Services              │
                                                            │  - Invoices              │
                                                            │  - QC, CriticalCases     │
                                                            │  - ActivityLogs          │
                                                            │  - Settings              │
                                                            │                          │
                                                            │  Login fallback chain:   │
                                                            │   1. Firebase Auth       │
                                                            │   2. Firestore users     │
                                                            │   3. Dummy API users ◄───│ (NEW)
                                                            └──────────────────────────┘
```

### 2.2 Planned production architecture

```
                     ┌────────────────────────────┐
                     │   Customer-facing app      │
                     │   (Android / iOS / web)    │
                     └────────────┬───────────────┘
                                  │ POST /api/orders
                                  ▼
                     ┌────────────────────────────┐
                     │   Amaze Fab REST API       │
                     │   (replaces dummy-order-app)│
                     └────────────┬───────────────┘
                                  │ Firestore writes
                                  ▼
                     ┌────────────────────────────┐
                     │   Firebase (Auth + Firestore)│
                     │   + Cloud Storage (media)  │
                     └────────────┬───────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
 ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
 │ Admin panel  │         │ Partner app  │         │ Staff app    │
 │  (web/)      │         │ (partner-app)│         │ (staff-app)  │
 └──────────────┘         └──────────────┘         └──────────────┘
```

### 2.3 Single-order flow inside the admin panel

```
┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────────┐    ┌─────────┐
│ RECEIVED │───►│ ASSIGNED    │───►│ IN_PROCESS   │───►│ QC         │───►│ DONE    │
│ order    │    │ to partner  │    │ partner      │    │ staff      │    │  │
└──────────┘    └─────────────┘    └──────────────┘    └────────────┘    └─────────┘
                                        │                    │
                                        ▼                    ▼
                                  ┌───────────┐        ┌───────────────┐
                                  │ CRITICAL  │        │ INVOICED      │
                                  │ CASE      │        │ to customer   │
                                  └───────────┘        └───────────────┘
```

---

## 3. Applications in Detail

### 3.1 Admin Panel — `web/`

The real product. React 19 + Vite SPA. Single bundle, role-based pages.

**Pages (`web/src/pages/`):**

| Page              | Path             | What it does                                                                |
| ----------------- | ---------------- | --------------------------------------------------------------------------- |
| `Login.tsx`       | `/login`         | Email/password login.                                                       |
| `Dashboard.tsx`   | `/`              | KPIs — orders today, in-process, critical, partners active, revenue.        |
| `Orders.tsx`      | `/orders`        | List of orders with filter/search, expand inline to see garments & sub-orders. |
| `OrderDetail.tsx` | `/orders/:id`    | Per-order deep view — garments, QR codes, timeline, sub-orders.             |
| `Partners.tsx`    | `/partners`      | CRUD partners + Firebase Auth account creation.                            |
| `Services.tsx`    | `/services`      | CRUD services with tier-based pricing (gold / yellow / blue).               |
| `Invoices.tsx`    | `/invoices`      | Invoice list + payment tracking.                                            |
| `QC.tsx`          | `/qc`            | QC queue for staff to inspect garments.                                     |
| `CriticalCases.tsx` | `/critical`    | Flagged garments requiring intervention.                                    |
| `Users.tsx`       | `/users`         | User list, role assignment, activation toggle.                               |
| `ActivityLogs.tsx` | `/logs`        | Immutable audit trail of every admin action.                                |
| `Settings.tsx`    | `/settings`      | API base URL + key (writes to `localStorage` so the SPA picks them up).     |

**Helpers (`web/src/lib/`):**
- `api.ts` — REST client. Builds requests with `x-api-key` header, reads `apiBaseUrl` / `apiKey` from `localStorage`. Defaults to `http://localhost:3002` + the API key in the file.
- `assignment.ts` — auto-assignment engine: matches orders to partners based on tier, capacity, and current load.
- `firebase.ts` — Firebase config + init.

**Contexts (`web/src/contexts/`):**
- `AuthContext.tsx` — global auth state + `signIn` / `signOut`.

---

### 3.2 Dummy Order App — `dummy-order-app/`

Standalone Express server. Listens on **port 3002**. API key required on every protected route (`x-api-key` header).

**REST surface:**

| Method | Path                       | Notes                                                                |
| ------ | -------------------------- | -------------------------------------------------------------------- |
| GET    | `/`                        | Static HTML — a form to create fake orders.                          |
| GET    | `/api/orders`              | List orders (in-memory).                                             |
| GET    | `/api/orders/:id`          | Single order.                                                         |
| POST   | `/api/orders`              | Create order — auto-generates `ORD-###` id, QR codes, garments.     |
| GET    | `/api/services`            | List services.                                                       |
| POST   | `/api/services`            | Create service.                                                      |
| GET    | `/api/partners`            | List partners.                                                       |
| POST   | `/api/partners`            | Create partner.                                                      |
| GET    | `/api/users`               | List users (filterable by `role`, `active`).                         |
| POST   | `/api/users`               | Create user.                                                         |
| PATCH  | `/api/users/:id`           | Update user.                                                         |
| DELETE | `/api/users/:id`           | Delete user.                                                         |
| GET    | `/api/roles`               | Roles list.                                                          |
| GET    | `/api/activity-logs`       | Audit log.                                                           |

State is held in process memory (`orders`, `services`, `partners`, `users`, `activityLogs` arrays). It is **lost on restart** — the file is not a persistent store. It is intended as a test fixture, not production.

---

### 3.3 Partner App — `partner-app/` (future)

Vite scaffold only. Will be the per-partner portal — scan QR codes on garments, mark sub-orders ready, accept/reject assignments. Not built yet.

### 3.4 Staff App — `staff-app/` (future)

Vite scaffold only. Will be the field-staff app — perform QC inspections, mark garments as critical, attach photos. Not built yet.

---

## 4. Data Model

The dummy API stores everything in memory. The shapes are the same shapes that the admin panel consumes and (in production) that Firestore will hold.

### 4.1 `Order`

```ts
{
  id: string              // "ORD-001"
  orderId: string         // mirror of id
  customer: {
    name: string          // "Ram"
    phone: string         // "+91 98765 4430"
    category: 'RETAIL' | 'VIP' | 'WHOLESALE'
  }
  careCategory: 'Normal' | 'Signature Care'
  garments: Garment[]
  services: { code: string; name: string }[]
  status: 'RECEIVED' | 'ASSIGNED' | 'IN_PROCESS' | 'QC' | 'DONE' | 'CRITICAL'
  createdAt: string       // ISO timestamp
}
```

### 4.2 `Garment` (inside an order)

```ts
{
  garmentId: string       // "GAR-1790770087693-705"
  qrCode: string          // "QR-1790770087693" — physical sticker
  category: string        // "SHIRT", "PANT", "SAREE", …
  garmentCategory: 'GOLD' | 'YELLOW' | 'BLUE' | 'ORANGE'  // tier / priority
  serviceType: string      // "Wash & Iron", "Dry Clean", …
}
```

The tier drives pricing: **GOLD** = premium / VIP, **YELLOW** = standard, **BLUE** = economy.

### 4.3 `Service`

```ts
{
  id: string                       // "SVC-001"
  name: string                     // "Wash & Iron"
  amazeFabServiceId: string        // "AMF-A001"
  description: string
  goldRate: number
  yellowRate: number
  blueRate: number
  active: boolean
  createdAt: string
}
```

### 4.4 `Partner`

```ts
{
  id: string
  name: string
  phone: string
  email: string
  address: string
  servicesOffered: string[]        // service ids
  active: boolean
  rating?: number
  createdAt: string
}
```

### 4.5 `User`

```ts
{
  id: string                       // "USR-0001"
  userId: string                   // mirror of id
  name: string
  email: string
  phone: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'PARTNER'
  partnerId?: string               // if role === PARTNER
  assignedOrders: string[]
  permissions: Record<string, boolean>
  isActive: boolean
  password?: string                // local-only field, used by login fallback
  createdAt: string
}
```

### 4.6 `Invoice`

```ts
{
  id: string
  orderId: string
  partnerId: string
  totalAmount: number
  paidAmount: number
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE'
  dueDate: string
  createdAt: string
  payments: { id: string; amount: number; date: string; method: string }[]
}
```

### 4.7 `CriticalCase`

```ts
{
  id: string
  orderId: string
  garmentId: string
  reason: string
  reportedBy: string              // userId
  status: 'OPEN' | 'RESOLVED'
  createdAt: string
}
```

### 4.8 `ActivityLogEntry`

```ts
{
  id: string
  userId: string
  userName: string
  role: string
  action: string                  // 'ORDER_CREATED', 'USER_UPDATED', …
  orderId?: string
  subOrderId?: string
  previousValue?: string
  newValue?: string
  comments?: string
  createdAt: string
}
```

---

## 5. Authentication

### 5.1 Current login chain

`AuthContext.tsx::signIn` runs three fallbacks in order:

```
        ┌─────────────────────────────────────┐
        │ signIn(email, password)             │
        └──────────────┬──────────────────────┘
                       ▼
        ┌─────────────────────────────────────┐
        │ 1. Firebase Auth                    │
        │    signInWithEmailAndPassword       │
        │    → success: load Firestore profile│
        └──────────────┬──────────────────────┘
                       │ on auth/invalid-credential
                       ▼
        ┌─────────────────────────────────────┐
        │ 2. Firestore fallback               │
        │    query users where email == X     │
        │    match if users[i].password === P │
        │    (rules currently block anon read)│
        └──────────────┬──────────────────────┘
                       │ on no match / permission error
                       ▼
        ┌─────────────────────────────────────┐
        │ 3. Dummy API fallback  ◄── NEW       │
        │    GET /api/users (x-api-key)       │
        │    match by email + password        │
        │    → sets user context              │
        └─────────────────────────────────────┘
```

The dummy-API path is what unblocks local development without standing up Firebase Auth. Production builds should rely on path 1 only.

### 5.2 Roles & permissions

| Role         | Can do                                                     |
| ------------ | ---------------------------------------------------------- |
| `SUPER_ADMIN` | Everything `ADMIN` can, plus user management & role edits. |
| `ADMIN`       | All collections.                                           |
| `STAFF`       | Read orders, write QC / critical cases, create sub-orders.  |
| `PARTNER`     | Only their own assigned sub-orders — scan, status update, upload photos. |

Enforced in two places:
- **`web/src/contexts/AuthContext.tsx`** — `hasRole(...roles)` is checked in page components.
- **`firestore.rules`** — server-side. Helpers `isAdmin()`, `isStaff()`, `isPartner()`, `isActive()` gate reads/writes per collection. (Currently the dummy API bypasses Firestore entirely, so rules apply only when Firestore is the data source.)

---

## 6. Configuration & Secrets

### 6.1 `web/src/lib/api.ts`

```ts
const DEFAULT_API_URL = 'http://localhost:3002';
const DEFAULT_API_KEY = 'amaze-fab-super-admin-key-2026';
```

Both are overridable at runtime via the Settings page, which writes `localStorage.apiBaseUrl` and `localStorage.apiKey`.

### 6.2 `web/src/contexts/AuthContext.tsx`

```ts
const DUMMY_API_URL = 'http://localhost:3002';
const DUMMY_API_KEY = 'amaze-fab-super-admin-key-2026';
```

Same key as above. Hard-coded for the login fallback so a fresh visitor can log in before visiting Settings.

### 6.3 `dummy-order-app/src/server.js`

```js
const API_KEY = 'amaze-fab-super-admin-key-2026';
const PORT    = 3002;
```

The same key the admin panel uses — keep them in sync.

### 6.4 `web/src/lib/firebase.ts`

Holds the Firebase web config — currently pointing at the local Firestore emulator (`localhost:8080`) and Auth emulator (`localhost:9099`). Emulators are enabled in `firebase.json`.

---

## 7. Run Order Stack — practical sequence

```bash
# 1. Start the mock backend (orders + users + services)
cd dummy-order-app
node src/server.js
# → http://localhost:3002

# 2. Start the admin panel
cd ../web
npm run dev
# → http://localhost:5173

# 3. (Optional) Start Firebase emulators if you want to use Firestore paths
cd ..
firebase emulators:start --only auth,firestore
# → Firestore on 8080, Auth on 9099

# 4. Seed the dummy backend with sample data
cd dummy-order-app
node src/seed.js
```

Login at `http://localhost:5173/login` with any user from `GET /api/users` (use the password stored on the user record).

---

## 8. What is mocked vs real

| Capability            | Today (mock)                                          | Future (real)                         |
| --------------------- | ----------------------------------------------------- | ------------------------------------- |
| Customer order source | `dummy-order-app` HTTP form + POST                    | Real customer Android/iOS/web app     |
| Order persistence     | In-memory array in `dummy-order-app/src/server.js`    | Firestore                             |
| Auth                  | Firebase Auth *or* dummy-API password fallback        | Firebase Auth only (password fallback removed) |
| Partner portal        | Not built (only Vite scaffold in `partner-app/`)      | Full React app                        |
| Staff QC app          | Not built (only Vite scaffold in `staff-app/`)        | Full React app                        |
| Cloud Functions       | Only data-fix scripts in `functions/`                  | Real event handlers (order.created → notify partner) |
| Media uploads         | None                                                  | Firebase Storage                      |
| Real-time updates      | Poll-on-mount only                                    | Firestore listeners / onSnapshot      |

---

## 9. Repository Map (what's where)

```
E:\Amaze opsv1\
├── web/                        # Admin panel (the real product)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/        # Layout, Sidebar
│   │   ├── contexts/          # AuthContext
│   │   ├── lib/               # api.ts, assignment.ts, firebase.ts
│   │   ├── pages/             # 12 page components (see §3.1)
│   │   └── types/index.ts
│   ├── package.json           # vite, react 19, firebase, react-query, lucide
│   └── vite.config.ts
│
├── dummy-order-app/            # Mock backend + order creator
│   ├── src/
│   │   ├── server.js          # Express API (port 3002)
│   │   ├── seed.js            # Seed sample data via REST
│   │   └── public/index.html  # Form to create orders manually
│   └── package.json           # express, cors, body-parser
│
├── partner-app/                # Future per-partner portal (Vite scaffold)
├── staff-app/                  # Future staff QC app (Vite scaffold)
│
├── functions/                  # Firebase Cloud Functions source
│   ├── lib/                   # Shared helpers
│   ├── src/                   # Triggers
│   ├── *.js                   # Admin scripts (createAdmin, cleanAll, …)
│   └── package.json
│
├── firebase.json               # Emulator + deploy config
├── firestore.rules             # Security rules (see §5.2)
├── storage.rules
├── firestore.indexes.json
├── .firebaserc                 # Default project alias
│
├── src/                        # Earlier Vite prototype (unused at runtime)
├── prisma/                     # Earlier Prisma schema experiment (unused)
├── scripts/, brain/, mindmap/  # Planning artifacts (unused)
│
├── FIREBASE_CONFIG.md
└── README.md
```

---

## 10. Key Things to Remember

1. **The admin panel is the real product.** `dummy-order-app` is a stand-in for the future real customer-facing order source — its API contract is what the admin panel codes against.
2. **The login chain is intentional.** Firebase Auth first, then Firestore, then dummy-API password. The third path is local-dev only; it must be removed before production.
3. **The dummy API is in-memory.** Restarting it loses every order, user, and partner. Use `seed.js` to repopulate.
4. **API key must match across three files:** `dummy-order-app/src/server.js`, `web/src/lib/api.ts`, `web/src/contexts/AuthContext.tsx`.
5. **Tier (gold/yellow/blue) drives pricing**, not the service. The service is the operation; the tier is the priority lane.
6. **Garments carry QR codes** — every garment has a unique `qrCode` (printed sticker) that partners scan to identify it.
7. **Settings page is the runtime config knob.** `apiBaseUrl` and `apiKey` go to `localStorage`, not env vars, so the deployed SPA can be repointed without rebuild.