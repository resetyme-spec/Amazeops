# Dummy Order Creator

A simple web app that imitates the customer's order placement system. Use it to create test orders that your admin panel can fetch.

## Run

```bash
cd "e:\Amaze opsv1\dummy-order-app"
npm install
npm start
```

Opens at: **http://localhost:3002**

## API details

- **URL:** `http://localhost:3002`
- **API Key:** `dummy-app-key-2025`

## Endpoints

- `GET /api/orders` — list all orders
- `GET /api/orders/:id` — get one order
- `POST /api/orders` — create order
- `GET /api/stats` — dashboard stats

## Connect to admin panel

In admin panel **Settings → API Connection**:
- API URL: `http://localhost:3002`
- API Key: `dummy-app-key-2025`
