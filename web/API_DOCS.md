# API Reference — What to Fetch

Base URL: `http://localhost:3002`
Header: `x-api-key: dummy-app-key-2025`

---

## GET /api/orders
Returns all orders. Use for: Orders page, Dashboard, QC Check, Critical Cases.

```json
{
  "orders": [
    {
      "id": "ORD-001",
      "orderId": "ORD-001",
      "customer": {
        "name": "Ramesh Kumar",
        "phone": "+91 98765 43210",
        "category": "Regular Customer"
      },
      "careCategory": "Premium",
      "garments": [
        {
          "garmentId": "GAR-...",
          "qrCode": "QR-...",
          "category": "SHIRT",
          "serviceType": "Wash & Iron"
        }
      ],
      "services": [],
      "status": "RECEIVED",
      "createdAt": "2026-09-18T06:00:00.000Z"
    }
  ]
}
```

## GET /api/orders/:id
Returns one order. Use for: Order Detail page.
Response: `{ "order": { ...same as above... } }`

## GET /api/services
Returns all services. Use for: Services page.
```json
{
  "services": [
    {
      "id": "SVC-001",
      "name": "Wash & Iron",
      "code": "WASH-IRON",
      "amazeFabServiceId": "AMF-A001",
      "description": "Standard wash and iron service",
      "goldRate": 80,
      "yellowRate": 60,
      "blueRate": 40,
      "active": true,
      "createdAt": "2026-09-18T06:00:00.000Z"
    }
  ]
}
```

## POST /api/services
Creates a service. Send body: name, code, amazeFabServiceId, description, goldRate, yellowRate, blueRate, active.

## PUT /api/services/:id
Updates a service. Send same body as POST.

## DELETE /api/services/:id
Deletes a service.

## GET /api/stats
Returns dashboard numbers. Use for: Dashboard page.
```json
{
  "totalOrders": 5,
  "activeOrders": 2,
  "completedOrders": 1,
  "deliveredOrders": 1,
  "criticalCases": 0,
  "totalRevenue": 0,
  "pendingInvoices": 0,
  "activePartners": 0
}
```

## GET /api/categories
Returns customer categories. Use for: any customer category dropdown.
```json
{ "categories": ["RETAIL", "VIP", "WHOLESALE"] }
```

## GET /api/garments
Currently empty `{ "garments": [] }`. Use for: Garments page.

## GET /api/partners
Currently empty `{ "partners": [] }`. Use for: Partners page.

## GET /api/invoices
Currently empty `{ "invoices": [] }`. Use for: Invoices page.

## GET /api/critical-cases
Currently empty `{ "cases": [] }`. Use for: Critical Cases page.

## GET /api/notifications
Currently empty `{ "notifications": [] }`. Use for: Notifications.

---

## Quick Map: Page → Endpoint

| Page | Endpoint |
|---|---|
| Dashboard | GET /api/stats, GET /api/orders |
| Orders | GET /api/orders |
| Order Detail | GET /api/orders/:id |
| Garments | GET /api/garments |
| Partners | GET /api/partners |
| Services | GET /api/services, POST, PUT, DELETE |
| Invoices | GET /api/invoices |
| QC Check | GET /api/orders |
| Critical Cases | GET /api/orders, GET /api/critical-cases |
