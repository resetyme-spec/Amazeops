# 📱 Amaze Fab & Amaze Ops — Complete Customer App API Documentation

**Document Version:** 2.2.0 (Production Master)  
**Target Audience:** Non-Technical Stakeholders, Product Managers, & Customer App Developers (iOS / Android / Flutter / React Native / Web)  
**Postman Collection:** [`docs/Amaze_Customer_App_API.postman_collection.json`](file:///e:/Amaze%20opsv1/docs/Amaze_Customer_App_API.postman_collection.json)  
**Last Updated:** November 2026  

---

## 1. Non-Technical Summary (For Founders, Managers & Business Teams)

### 📌 The Big Picture
Think of this API as the **direct digital bridge** connecting the **Customer App** (where customers book laundry/dry cleaning) and the **Amaze Ops Platform** (our factories, quality checkers, and delivery hubs).

```
   CUSTOMER APP                            AMAZE OPS PLATFORM
 [Customer Phone]                         [Factory & Operations]
        │                                           │
        ├── 1. Pushes Services offered ────────────►│ (Registered in Admin:
        │      (e.g. Iron, Wash, Dry Clean)         │  Gold / Yellow / Blue rates set)
        │                                           │
        ├── 2. Pushes Booking & Garment Tags ──────►│ (Assigned to factory partner
        │      + Customer Wardrobe Photo URLs       │  for washing & care)
        │                                           │
        │◄── 3. Pulls Live Order Status ────────────┤ (Milestones: In Process,
        │      + Factory QC Inspection Photo URLs   │  QC Approved, Ready for Delivery)
        │                                           │
        │◄── 4. Pulls Garment Digital Passport ─────┤ (Past visits, chemical treatments,
        │      (Lifetime stain & care history)      │  complete photo audit archive)
```

---

### ❓ Key Questions Answered in Plain English

#### 1. What does the Customer App send (PUSH) to Amaze Ops?
1. **Services List**: The names of services you offer (e.g. `"Dry Clean"`, `"Wash & Iron"`, `"Iron Only"`).
2. **Customer Orders**: Customer name, phone number, address, and care tier (`Signature`, `Pristine`, `Premium`).
3. **Garment Details & QR Tags**: The list of clothes with their physical tag codes (e.g. `AMZ-TAG-78421`) attached to the garment.
4. **Wardrobe Photos (URLs)**: Photos of the clothes taken when the customer books or hands over to the driver.

#### 2. What does the Customer App receive (GET / PULL) from Amaze Ops?
1. **Live Order Status**: Real-time progress updates (e.g. *Received → Cleaning → Quality Check → Packed → Out for Delivery*).
2. **Individual Garment Tracking**: Status of each individual item inside an order.
3. **Quality Check (QC) Proof Photos (URLs)**: Cleanliness proof photos taken by our factory inspectors under white lights before packaging.
4. **Digital Garment Passport**: Complete history of every garment (past orders, solvents used, stain removals).
5. **Active Rates**: Payout pricing configured in the admin dashboard.

#### 3. Do we send image files or image URLs?
> **Answer: Always Image URLs (never raw image files).**  
> Both apps upload photos directly to cloud storage (Google Cloud Storage / Amazon S3 / Firebase Storage) and pass lightweight public HTTPS links in the API:
> * **`Wardrobe/` folder URLs**: Initial customer/hub photos (e.g. `https://storage.../Wardrobe/ORD-101/GAR-1/front.jpg`).
> * **`QC/` folder URLs**: High-resolution factory inspection proof photos taken by our partners (e.g. `https://storage.../QC/ORD-101/GAR-1/front.jpg`).

#### 4. How does Service Pricing work?
> **Customer App defines WHAT services exist; Amaze Ops sets WHAT partners get paid.**  
> 1. Customer App pushes service names (e.g. `Iron Only`, `Wash & Iron`, `Dry Clean`).  
> 2. They immediately show up on the Amaze Fab Admin screen (`http://localhost:5173/services`).  
> 3. The operations team configures the partner payout rates: **Gold Rate**, **Yellow Rate**, and **Blue Rate**.  
> 4. Whenever the Customer App syncs or updates names, **all existing configured rates are safely preserved**.

---

## 2. Server Environments & Authentication

### Production Base URLs
| Endpoint Type | URL | Description |
| :--- | :--- | :--- |
| **Primary Production URL** | `https://amaze-ops.web.app` | Production Cloud Infrastructure (with SSL/HTTPS) |
| **Direct Cloud Functions URL** | `https://us-central1-amaze-ops.cloudfunctions.net/api` | Direct Google Cloud Functions Endpoint |

> 🔒 **SSL & Security:** All production calls **MUST** use `https://`. Calls over insecure `http://` are rejected.

### Required HTTP Headers
Every API call must include these headers:
```http
Content-Type: application/json
x-api-key: amaze-fab-super-admin-key-2026
```

---

## 3. API Reference

---

### 3.1 Push Services Catalog (`POST /api/services/sync`)
> **Use Case:** Whenever the Customer App adds or modifies services (e.g. `Iron`, `Wash & Iron`, `Dry Clean`), it pushes the service list to Amaze Ops.
> 
> 💡 **Important:** The Customer App **does not** provide rates! Amaze Ops automatically registers the services in the Admin Portal (`localhost:5173/services`), where the admin configures the **Gold Rate**, **Yellow Rate**, and **Blue Rate** for partner payouts. Existing configured rates are **never overwritten** during sync.

* **Method:** `POST`
* **Path:** `/api/services/sync`
* **Headers:**
  * `Content-Type: application/json`
  * `x-api-key: amaze-fab-super-admin-key-2026`

#### Request Body
```json
{
  "services": [
    {
      "name": "Dry Clean",
      "code": "DRY-CLEAN",
      "description": "Eco-friendly solvent dry cleaning with hand press",
      "active": true
    },
    {
      "name": "Wash & Iron",
      "code": "WASH-IRON",
      "description": "Bio-wash detergent cycle followed by steam iron",
      "active": true
    },
    {
      "name": "Iron Only",
      "code": "IRON-ONLY",
      "description": "Steam press finishing for formalwear",
      "active": true
    },
    {
      "name": "Stain Removal",
      "code": "STAIN-TREATMENT",
      "description": "Spot treatment for tough grease, wine, or ink stains",
      "active": true
    }
  ]
}
```

#### Field Definitions
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `services` | array | **Yes** | Array of service objects offered by the Customer App. |
| `name` | string | **Yes** | Human-readable service name (e.g. `"Wash & Iron"`). |
| `code` | string | **Yes** | Unique service identifier (e.g. `"WASH-IRON"`). |
| `description` | string | Optional | Customer-facing service summary. |
| `active` | boolean | Optional | `true` if currently available; `false` to disable. Default `true`. |

#### Response (`200 OK`)
```json
{
  "success": true,
  "count": 4,
  "message": "Services catalog synced successfully. Partner pricing preserved."
}
```

---

### 3.2 Fetch Services & Configured Rates (`GET /api/services`)
> **Use Case:** Pull the active services list along with configured Gold / Yellow / Blue rates.

* **Method:** `GET`
* **Path:** `/api/services`
* **Headers:** `x-api-key: amaze-fab-super-admin-key-2026`

#### Response (`200 OK`)
```json
{
  "success": true,
  "services": [
    {
      "id": "SVC-001",
      "name": "Dry Clean",
      "code": "DRY-CLEAN",
      "amazeFabServiceId": "AMF-DRYC",
      "description": "Eco-friendly solvent dry cleaning with hand press",
      "goldRate": 120,
      "yellowRate": 90,
      "blueRate": 60,
      "active": true
    },
    {
      "id": "SVC-002",
      "name": "Wash & Iron",
      "code": "WASH-IRON",
      "amazeFabServiceId": "AMF-WASH",
      "description": "Bio-wash detergent cycle followed by steam iron",
      "goldRate": 80,
      "yellowRate": 60,
      "blueRate": 40,
      "active": true
    }
  ]
}
```

---

### 3.3 Place New Order (`POST /api/orders`)
> **Use Case:** Pushes a completed customer booking into Amaze Ops for partner assignment and factory processing.

* **Method:** `POST`
* **Path:** `/api/orders`
* **Headers:**
  * `Content-Type: application/json`
  * `x-api-key: amaze-fab-super-admin-key-2026`

#### Request Body
```json
{
  "order_no": "ORD-2026-9812",
  "customer_name": "Ramesh Kumar",
  "customer_phone": "+91 98765 43210",
  "customer_category": "Signature Care",
  "care_category": "SIGNATURE",
  "status": "RECEIVED",
  "city": "Chennai",
  "pincode": "600040",
  "hub": {
    "name": "Amaze Main Hub",
    "code": "HUB-CHN-01",
    "location": "Anna Nagar, Chennai",
    "address": "No. 42, 2nd Avenue, Anna Nagar West, Chennai - 600040",
    "latitude": 13.0827,
    "longitude": 80.2707,
    "phone": "+91 98400 12345"
  },
  "garments": [
    {
      "garment_id_code": "GAR-ORD-9812-1",
      "qr_code": "AMZ-TAG-78421",
      "garment_type": "SILK_SAREE",
      "category": "GOLD",
      "service_type": "Dry Clean",
      "brand": "Kanchipuram Silk",
      "color": "Royal Blue",
      "special_instructions": "Delicate gold zari border - use gentle solvent cycle",
      "wardrobePhotos": {
        "front": "https://storage.googleapis.com/amaze-ops/Wardrobe/ORD-2026-9812/GAR-1/front.jpg",
        "tag": "https://storage.googleapis.com/amaze-ops/Wardrobe/ORD-2026-9812/GAR-1/tag.jpg"
      }
    },
    {
      "garment_id_code": "GAR-ORD-9812-2",
      "qr_code": "AMZ-TAG-78422",
      "garment_type": "SHIRT",
      "category": "BLUE",
      "service_type": "Wash & Iron",
      "brand": "Raymond",
      "color": "White",
      "special_instructions": "Collar coffee stain pre-treatment requested",
      "wardrobePhotos": {
        "front": "https://storage.googleapis.com/amaze-ops/Wardrobe/ORD-2026-9812/GAR-2/front.jpg"
      }
    }
  ]
}
```

#### Field Specifications
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `order_no` | string | **Yes** | Unique order reference from Customer App (e.g. `ORD-2026-XXXX`). |
| `customer_name` | string | **Yes** | Customer full name. |
| `customer_phone` | string | **Yes** | Mobile phone (used for delivery tracking and updates). |
| `customer_category` | string | Optional | `Signature Care`, `Pristine`, or `Regular`. |
| `care_category` | string | **Yes** | Service tier: `"SIGNATURE"`, `"PRISTINE"`, or `"PREMIUM"`. |
| `status` | string | **Yes** | Set to `"RECEIVED"` on initial placement. |
| `city` / `pincode` | string | **Yes** | Pickup & drop location. |
| `hub` | object | Optional | Intake hub metadata (name, code, coordinates, address, phone). |
| `garments` | array | **Yes** | Array of garment items. |
| `garments[].garment_id_code`| string | **Yes** | Unique garment ID. |
| `garments[].qr_code` | string | **Yes** | **QR code / physical tag barcode** printed/attached on garment. |
| `garments[].garment_type` | string | **Yes** | e.g. `SHIRT`, `SUIT_2PC`, `SILK_SAREE`, `DRESS`, `KURTA`. |
| `garments[].category` | string | **Yes** | Rate category: `"GOLD"` (delicate/silk), `"YELLOW"` (standard), `"BLUE"` (regular cotton). |
| `garments[].service_type` | string | **Yes** | `Dry Clean`, `Wash & Iron`, or `Steam Press`. |
| `garments[].brand` | string | Optional | Clothing brand (e.g. `Armani`, `Zara`). |
| `garments[].wardrobePhotos` | object | Optional | Digital twin photo URLs (`front`, `back`, `tag`). |

#### Response (`201 Created` with Partner Assignments)
```json
{
  "success": true,
  "order_no": "ORD-2026-9812",
  "status": "ASSIGNED",
  "total_sub_orders": 2,
  "partner_assignments": [
    {
      "sub_order_no": "ORD-2026-9812-P1-1",
      "category": "BLUE",
      "garment_count": 3,
      "partner": {
        "id": "PRT-001",
        "name": "ABC Rapid Laundry (Partner A)",
        "phone": "+91 98400 11111",
        "address": "12, Industrial Estate, Guindy, Chennai",
        "geo_location": {
          "latitude": 13.0067,
          "longitude": 80.2030
        },
        "distance_from_hub_km": 4.2
      },
      "garments": [
        {
          "garment_id_code": "GAR-ORD-9812-1",
          "qr_code": "AMZ-TAG-78421",
          "garment_type": "SHIRT",
          "category": "BLUE",
          "service_type": "Wash & Iron"
        }
      ]
    },
    {
      "sub_order_no": "ORD-2026-9812-P2-2",
      "category": "GOLD",
      "garment_count": 5,
      "partner": {
        "id": "PRT-002",
        "name": "Premier Silk & Dry Cleaners (Partner B)",
        "phone": "+91 98400 22222",
        "address": "88, Sterling Road, Nungambakkam, Chennai",
        "geo_location": {
          "latitude": 13.0604,
          "longitude": 80.2376
        },
        "distance_from_hub_km": 2.8
      },
      "garments": [
        {
          "garment_id_code": "GAR-ORD-9812-2",
          "qr_code": "AMZ-TAG-78422",
          "garment_type": "SILK_SAREE",
          "category": "GOLD",
          "service_type": "Dry Clean"
        }
      ]
    }
  ]
}
```

---

### 3.4 Live Order & Multi-Partner Tracking (`GET /api/orders/:id`)
> **Use Case:** Query real-time order lifecycle status, including **individual live status and 5-step lifecycle progression for each assigned partner factory** and assigned garments.

* **Method:** `GET`
* **Path:** `/api/orders/:id` (Accepts `order_no` like `ORD-2026-9812` or `AF-50281`, or internal Firestore ID)
* **Example:** `GET https://amaze-ops.web.app/api/orders/ORD-2026-9812`
* **Headers:** `x-api-key: amaze-fab-super-admin-key-2026`

#### Response (`200 OK`)
```json
{
  "success": true,
  "order_no": "ORD-2026-9812",
  "overall_status": "IN_PROCESS",
  "total_sub_orders": 2,
  "timeline": [
    { "stage": "ASSIGNED", "name": "Assigned", "step": 1, "progress_pct": 20, "completed": true, "current": false, "timestamp": "2026-11-06T18:00:00.000Z" },
    { "stage": "IN_PROCESS", "name": "Accepted & Processing", "step": 2, "progress_pct": 40, "completed": true, "current": true, "timestamp": "2026-11-06T18:15:00.000Z" },
    { "stage": "QC_PENDING", "name": "QC Submitted", "step": 3, "progress_pct": 60, "completed": false, "current": false, "timestamp": null },
    { "stage": "QC_APPROVED", "name": "QC Verified", "step": 4, "progress_pct": 80, "completed": false, "current": false, "timestamp": null },
    { "stage": "COMPLETED", "name": "Completed", "step": 5, "progress_pct": 100, "completed": false, "current": false, "timestamp": null }
  ],
  "partner_statuses": [
    {
      "sub_order_no": "ORD-2026-9812-P1-1",
      "category": "BLUE",
      "garment_count": 3,
      "status": "IN_PROCESS",
      "status_label": "Accepted & Processing",
      "current_step": 2,
      "progress_pct": 40,
      "lifecycle": [
        { "step": 1, "name": "Assigned", "status": "COMPLETED", "progress_pct": 20 },
        { "step": 2, "name": "Accepted & Processing", "status": "CURRENT", "progress_pct": 40 },
        { "step": 3, "name": "QC Submitted", "status": "PENDING", "progress_pct": 60 },
        { "step": 4, "name": "QC Verified", "status": "PENDING", "progress_pct": 80 },
        { "step": 5, "name": "Completed", "status": "PENDING", "progress_pct": 100 }
      ],
      "partner": {
        "id": "PRT-001",
        "name": "ABC Rapid Laundry (Partner A)",
        "phone": "+91 98400 11111",
        "address": "12, Industrial Estate, Guindy, Chennai",
        "geo_location": {
          "latitude": 13.0067,
          "longitude": 80.2030
        },
        "distance_from_hub_km": 4.2
      },
      "garments": [
        {
          "garment_id_code": "GAR-ORD-9812-1",
          "qr_code": "AMZ-TAG-78421",
          "garment_type": "SHIRT",
          "category": "BLUE",
          "service_type": "Wash & Iron",
          "status": "IN_PROCESS"
        }
      ]
    },
    {
      "sub_order_no": "ORD-2026-9812-P2-2",
      "category": "GOLD",
      "garment_count": 2,
      "status": "ASSIGNED",
      "status_label": "Assigned",
      "current_step": 1,
      "progress_pct": 20,
      "lifecycle": [
        { "step": 1, "name": "Assigned", "status": "CURRENT", "progress_pct": 20 },
        { "step": 2, "name": "Accepted & Processing", "status": "PENDING", "progress_pct": 40 },
        { "step": 3, "name": "QC Submitted", "status": "PENDING", "progress_pct": 60 },
        { "step": 4, "name": "QC Verified", "status": "PENDING", "progress_pct": 80 },
        { "step": 5, "name": "Completed", "status": "PENDING", "progress_pct": 100 }
      ],
      "partner": {
        "id": "PRT-002",
        "name": "Premier Silk & Dry Cleaners (Partner B)",
        "phone": "+91 98400 22222",
        "address": "88, Sterling Road, Nungambakkam, Chennai",
        "geo_location": {
          "latitude": 13.0604,
          "longitude": 80.2376
        },
        "distance_from_hub_km": 2.8
      },
      "garments": [
        {
          "garment_id_code": "GAR-ORD-9812-2",
          "qr_code": "AMZ-TAG-78422",
          "garment_type": "SILK_SAREE",
          "category": "GOLD",
          "service_type": "Dry Clean",
          "status": "ASSIGNED"
        }
      ]
    }
  ]
}
```

#### Multi-Partner Lifecycle Guide (Standard 5 Steps)
Each assigned partner progresses independently through these 5 lifecycle milestones:
1. **`1. Assigned`** (20%) — Partner factory has been assigned based on fabric category & GPS routing.
2. **`2. Accepted & Processing`** (40%) — Partner accepted the garments and processing has begun.
3. **`3. QC Submitted`** (60%) — Partner finished work and submitted QC photos for inspection.
4. **`4. QC Verified`** (80%) — Operations inspector approved the quality check.
5. **`5. Completed`** (100%) — Garments completed and ready for final hub consolidation.

---

### 3.5 Notify Pickup Arranged (`POST /api/orders/:order_no/pickup-arranged`)
> **Use Case:** Once garments are marked **Completed**, Customer App or Logistics triggers this API to schedule pickup. Updates the order and all partner sub-orders with the **"PICKUP ARRANGED"** badge in both the Admin Operations Portal and the Partner App.

* **Method:** `POST`
* **Path:** `/api/orders/:order_no/pickup-arranged` (or `/api/orders/:order_no/pickup`)
* **Example:** `POST https://amaze-ops.web.app/api/orders/AF-50201/pickup-arranged`
* **Headers:**
  * `Content-Type: application/json`
  * `x-api-key: amaze-fab-super-admin-key-2026`

#### Request Body (Optional details)
```json
{
  "rider_name": "Suresh (Logistics)",
  "rider_phone": "+91 98400 99999",
  "pickup_time": "2026-11-07T10:30:00.000Z",
  "notes": "Van route 4 arriving for batch pickup"
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "order_no": "AF-50201",
  "status": "PICKUP_ARRANGED",
  "badge": "PICKUP ARRANGED",
  "pickup_arranged_at": "2026-11-07T00:15:00.000Z",
  "rider_name": "Suresh (Logistics)",
  "rider_phone": "+91 98400 99999",
  "pickup_time": "2026-11-07T10:30:00.000Z",
  "sub_orders_updated": 2,
  "message": "Pickup arranged successfully. Status badge updated to PICKUP ARRANGED across Admin and Partner apps."
}
```

---

### 3.6 Customer Order History List (`GET /api/orders`)
> **Use Case:** Fetch all past and active orders for a customer account.

* **Method:** `GET`
* **Path:** `/api/orders?phone=+919876543210`
* **Headers:** `x-api-key: amaze-fab-super-admin-key-2026`

#### Response (`200 OK`)
```json
{
  "success": true,
  "count": 2,
  "orders": [
    {
      "orderId": "ORD-2026-9812",
      "status": "QC_APPROVED",
      "careCategory": "SIGNATURE",
      "totalGarments": 2,
      "createdAt": "2026-11-05T09:30:00.000Z"
    },
    {
      "orderId": "ORD-2026-8710",
      "status": "DELIVERED",
      "careCategory": "PREMIUM",
      "totalGarments": 4,
      "createdAt": "2026-10-22T14:15:00.000Z"
    }
  ]
}
```

---

### 3.7 Garment Lifetime Passport & QC Archive (`GET /api/garments/:qrCode/history`)
> **Use Case:** Tapping any garment in the customer's digital wardrobe displays its full lifetime history, visit records, chemical treatments, and past QC photos.

* **Method:** `GET`
* **Path:** `/api/garments/:qrCode/history`
* **Example:** `GET /api/garments/AMZ-TAG-78421/history`
* **Headers:** `x-api-key: amaze-fab-super-admin-key-2026`

#### Response (`200 OK`)
```json
{
  "success": true,
  "garment": {
    "qrCode": "AMZ-TAG-78421",
    "garmentType": "SILK_SAREE",
    "brand": "Kanchipuram Silk",
    "color": "Royal Blue",
    "wardrobeTwinPhotos": [
      "https://storage.googleapis.com/amaze-ops/Wardrobe/ORD-2026-9812/GAR-1/front.jpg"
    ],
    "lifetimeVisits": 4,
    "lastCleanedAt": "2026-11-05T10:15:00.000Z",
    "allSolventsUsed": [
      "Hydrocarbon Eco-Solvent",
      "K4 Eco-Solvent"
    ],
    "stainTreatments": [
      "Tea/Coffee Tannin Removal (Oct 2026)"
    ],
    "serviceHistory": [
      {
        "orderId": "ORD-2026-9812",
        "date": "2026-11-05",
        "serviceType": "Dry Clean",
        "careCategory": "SIGNATURE",
        "qcScore": 5,
        "qcStatus": "QC_APPROVED",
        "qcPhotos": [
          "https://storage.googleapis.com/amaze-ops/QC/ORD-2026-9812/GAR-1/front.jpg"
        ]
      }
    ]
  }
}
```

---

## 4. Order Lifecycle & Status Progression Table

Map the operational `"status"` field directly to your customer app tracker:

| Operational Status | Customer Milestone | Customer Display Label | Description Shown to Customer |
| :--- | :---: | :--- | :--- |
| `RECEIVED` | Step 1 | **Order Booked** | Order confirmed, scheduled for pickup from doorstep/hub |
| `ASSIGNED` | Step 2 | **Facility Assigned** | Routed to specialized textile care partner |
| `IN_PROCESS` | Step 3 | **Cleaning & Washing** | Undergoing specialized washing, solvent treatment, or dry cleaning |
| `QC_SENT` / `QC_PENDING` | Step 4 | **Quality Inspection** | Clothes washed, undergoing 10-point stain & pressing inspection |
| `QC_REJECTED` | Step 4.1 | **Rework & Retreatment** | Did not meet high quality standard; undergoing complimentary re-wash |
| `QC_APPROVED` | Step 5 | **Packed & Sealed** | Certified 100% clean, steam finished, and bagged |
| `READY_FOR_DELIVERY` | Step 6 | **Out for Delivery** | Handed over to courier / rider for doorstep drop |
| `DELIVERED` | Step 7 | **Delivered ✓** | Order delivered to customer |

---

## 5. Image & Storage Routing Rules

* **Why Image URLs?**: To keep the API lightweight and fast, both systems exchange **Image URLs** (never heavy raw binary files).
* **`Wardrobe/` Folder**: Permanent digital wardrobe photos taken by customer or hub staff at booking (`Wardrobe/{orderId}/{garmentId}/front.jpg`).
* **`QC/` Folder**: High-resolution quality check photos captured by partner facilities upon finishing cleaning (`QC/{orderId}/{garmentId}/front.jpg`).

---

## 6. Physical QR Tag Standard

* **Tag Type**: Heat-sealable fabric tag, washable barcode label, or RFID/QR tag attached to the garment hem/label.
* **Payload**: Only encode the raw code string (e.g. `AMZ-TAG-78421`). Do not encode full URLs in the physical tag so standard scanners parse it instantly.

---

## 7. Ready-to-Run Production cURL Examples

### A. Sync Services Catalog (Customer App → Amaze Ops):
```bash
curl -X POST "https://amaze-ops.web.app/api/services/sync" \
  -H "Content-Type: application/json" \
  -H "x-api-key: amaze-fab-super-admin-key-2026" \
  -d '{
    "services": [
      { "name": "Dry Clean", "code": "DRY-CLEAN", "description": "Eco solvent dry clean", "active": true },
      { "name": "Wash & Iron", "code": "WASH-IRON", "description": "Bio wash and steam iron", "active": true },
      { "name": "Iron Only", "code": "IRON-ONLY", "description": "Steam press", "active": true }
    ]
  }'
```

### B. Place Order:
```bash
curl -X POST "https://amaze-ops.web.app/api/orders" \
  -H "Content-Type: application/json" \
  -H "x-api-key: amaze-fab-super-admin-key-2026" \
  -d '{
    "order_no": "ORD-CUST-1001",
    "customer_name": "Priya Sharma",
    "customer_phone": "+91 98410 55555",
    "customer_category": "Signature Care",
    "care_category": "SIGNATURE",
    "status": "RECEIVED",
    "city": "Chennai",
    "pincode": "600040",
    "garments": [
      {
        "garment_id_code": "GAR-1001-1",
        "qr_code": "AMZ-TAG-9901",
        "garment_type": "SILK_SAREE",
        "category": "GOLD",
        "service_type": "Dry Clean",
        "brand": "Sabyasachi"
      }
    ]
  }'
```

### C. Live Tracking:
```bash
curl -X GET "https://amaze-ops.web.app/api/orders/ORD-CUST-1001" \
  -H "x-api-key: amaze-fab-super-admin-key-2026"
```

### D. Garment Lifetime History & QC Photos:
```bash
curl -X GET "https://amaze-ops.web.app/api/garments/AMZ-TAG-9901/history" \
  -H "x-api-key: amaze-fab-super-admin-key-2026"
```

---

## 8. Error Codes & Troubleshooting

| HTTP Code | Error Reason | Resolution |
| :---: | :--- | :--- |
| `400 Bad Request` | Missing required fields (`order_no`, `garments`, `customer_phone`) | Ensure all required fields are included in the request body. |
| `401 Unauthorized`| Missing or invalid `x-api-key` header | Verify header `x-api-key: amaze-fab-super-admin-key-2026`. |
| `404 Not Found` | Order ID or QR code not found | Verify order ID or QR code exists. |
| `500 Server Error`| Internal processing error | Check payload formatting or retry with backoff. |
