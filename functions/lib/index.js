"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.admin_instance = exports.db_instance = exports.api = exports.weeklyPartnerSummary = exports.dailyDeliveryReminder = exports.paymentOnCreate = exports.invoiceOnUpdate = exports.invoiceOnCreate = exports.qcRecordOnCreate = exports.subOrderOnUpdate = exports.subOrderOnCreate = exports.criticalCaseOnUpdate = exports.criticalCaseOnCreate = exports.garmentOnUpdate = exports.garmentOnCreate = exports.orderOnUpdate = exports.orderOnCreate = exports.apiInitializeFirestore = exports.apiRecordPayment = exports.apiApproveInvoice = exports.apiCreateInvoice = exports.apiSubmitQCResult = exports.apiCreateCriticalCase = exports.apiDeleteService = exports.apiUpdateService = exports.apiCreateService = exports.apiDeletePartner = exports.apiUpdatePartner = exports.apiCreatePartner = exports.apiAssignGarmentsToPartner = exports.apiAddGarmentsToOrder = exports.apiCreateOrder = void 0;
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'amaze-ops';
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const https_1 = require("firebase-functions/v2/https");
const orderService_1 = require("./services/orderService");
const callableFunctions_1 = require("./services/callableFunctions");
// Initialize Firebase Admin — emulator-safe (no production creds)
admin.initializeApp({ projectId: 'amaze-ops' });
const db = admin.firestore();
// ===== CALLABLE (HTTP) FUNCTIONS =====
exports.apiCreateOrder = callableFunctions_1.createOrder;
exports.apiAddGarmentsToOrder = callableFunctions_1.addGarmentsToOrder;
exports.apiAssignGarmentsToPartner = callableFunctions_1.assignGarmentsToPartner;
exports.apiCreatePartner = callableFunctions_1.createPartner;
exports.apiUpdatePartner = callableFunctions_1.updatePartner;
exports.apiDeletePartner = callableFunctions_1.deletePartner;
exports.apiCreateService = callableFunctions_1.createService;
exports.apiUpdateService = callableFunctions_1.updateService;
exports.apiDeleteService = callableFunctions_1.deleteService;
exports.apiCreateCriticalCase = callableFunctions_1.createCriticalCase;
exports.apiSubmitQCResult = callableFunctions_1.submitQCResult;
exports.apiCreateInvoice = callableFunctions_1.createInvoice;
exports.apiApproveInvoice = callableFunctions_1.approveInvoice;
exports.apiRecordPayment = callableFunctions_1.recordPayment;
exports.apiInitializeFirestore = callableFunctions_1.initializeFirestore;
// ===== FIRESTORE TRIGGERS =====
// Orders
exports.orderOnCreate = functions.firestore
    .document('orders/{orderId}')
    .onCreate((snap) => (0, orderService_1.onOrderCreated)(snap));
exports.orderOnUpdate = functions.firestore
    .document('orders/{orderId}')
    .onUpdate((change) => (0, orderService_1.onOrderUpdated)(change));
// Garments
exports.garmentOnCreate = functions.firestore
    .document('garments/{garmentId}')
    .onCreate((snap) => (0, orderService_1.onGarmentCreated)(snap));
exports.garmentOnUpdate = functions.firestore
    .document('garments/{garmentId}')
    .onUpdate((change) => (0, orderService_1.onGarmentStatusUpdated)(change));
// Critical Cases
exports.criticalCaseOnCreate = functions.firestore
    .document('criticalCases/{caseId}')
    .onCreate((snap) => (0, orderService_1.onCriticalCaseCreated)(snap));
exports.criticalCaseOnUpdate = functions.firestore
    .document('criticalCases/{caseId}')
    .onUpdate((change) => (0, orderService_1.onCriticalCaseUpdated)(change));
// Sub-Orders
exports.subOrderOnCreate = functions.firestore
    .document('orders/{orderId}/subOrders/{subOrderId}')
    .onCreate((snap) => (0, orderService_1.onSubOrderCreated)(snap));
exports.subOrderOnUpdate = functions.firestore
    .document('orders/{orderId}/subOrders/{subOrderId}')
    .onUpdate((change) => (0, orderService_1.onSubOrderUpdated)(change));
// QC Records
exports.qcRecordOnCreate = functions.firestore
    .document('qcRecords/{qcId}')
    .onCreate((snap) => (0, orderService_1.onQCRecordCreated)(snap));
// Invoices
exports.invoiceOnCreate = functions.firestore
    .document('invoices/{invoiceId}')
    .onCreate((snap) => (0, orderService_1.onInvoiceCreated)(snap));
exports.invoiceOnUpdate = functions.firestore
    .document('invoices/{invoiceId}')
    .onUpdate((change) => (0, orderService_1.onInvoiceUpdated)(change));
// Payments
exports.paymentOnCreate = functions.firestore
    .document('payments/{paymentId}')
    .onCreate((snap) => (0, orderService_1.onPaymentCreated)(snap));
// ===== SCHEDULED FUNCTIONS =====
// Daily reminder for pending deliveries
exports.dailyDeliveryReminder = functions.pubsub.schedule('0 9 * * *').onRun(async (context) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const snapshot = await db.collection('orders')
        .where('status', 'in', ['IN_PROCESS', 'COMPLETED'])
        .where('deliveryDate', '==', tomorrowStr)
        .get();
    const userNotifications = {};
    snapshot.docs.forEach(doc => {
        const order = doc.data();
        if (!userNotifications[order.createdBy]) {
            userNotifications[order.createdBy] = [];
        }
        userNotifications[order.createdBy].push({
            title: 'Delivery Tomorrow',
            message: `Order ${order.orderNumber} is due for delivery tomorrow`,
            type: 'INFO',
            link: `/orders/${doc.id}`,
        });
    });
    for (const [userId, notifications] of Object.entries(userNotifications)) {
        const batch = db.batch();
        notifications.forEach(n => {
            const ref = db.collection('notifications').doc();
            batch.create(ref, { ...n, userId, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        await batch.commit();
    }
    return null;
});
// Weekly partner summary
exports.weeklyPartnerSummary = functions.pubsub.schedule('0 8 * * 1').onRun(async (context) => {
    const partnersSnapshot = await db.collection('partners').get();
    for (const partnerDoc of partnersSnapshot.docs) {
        const partnerId = partnerDoc.id;
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const paymentsSnapshot = await db.collection('walletTransactions')
            .where('partnerId', '==', partnerId)
            .where('status', '==', 'COMPLETED')
            .where('createdAt', '>=', weekAgo)
            .get();
        const totalEarnings = paymentsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        if (totalEarnings > 0) {
            const partnerUserSnap = await db.collection('users').where('partnerId', '==', partnerId).get();
            partnerUserSnap.docs.forEach(userDoc => {
                const ref = db.collection('notifications').doc();
                ref.set({
                    userId: userDoc.id,
                    title: 'Weekly Summary',
                    message: `Your earnings this week: ₹${totalEarnings.toFixed(2)}`,
                    type: 'INFO',
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            });
        }
    }
    return null;
});
// ===== PUBLIC REST API FOR EXTERNAL CUSTOMER APP & OPS ENGINE =====
const API_KEY = 'amaze-fab-super-admin-key-2026';
function parseCoordinates(geo) {
    if (!geo)
        return null;
    const lat = typeof geo.latitude === 'number' ? geo.latitude :
        typeof geo.lat === 'number' ? geo.lat :
            parseFloat(String(geo.latitude || geo.lat || ''));
    const lng = typeof geo.longitude === 'number' ? geo.longitude :
        typeof geo.lng === 'number' ? geo.lng :
            typeof geo.log === 'number' ? geo.log :
                parseFloat(String(geo.longitude || geo.lng || geo.log || ''));
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0))
        return null;
    return { lat, lng };
}
function getPartnerCoordinates(p) {
    return parseCoordinates(p.geoLocation) || parseCoordinates({ latitude: p.latitude, longitude: p.longitude });
}
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
}
function normalizeCat(c) {
    const s = String(c || '').toUpperCase();
    if (s === 'SIGNATURE' || s === 'GOLD')
        return 'SIGNATURE';
    if (s === 'PRISTINE' || s === 'ORANGE' || s === 'YELLOW')
        return 'PRISTINE';
    if (s === 'PREMIUM' || s === 'BLUE')
        return 'PREMIUM';
    return s || 'PREMIUM';
}
exports.api = (0, https_1.onRequest)({ cors: true, region: 'us-central1' }, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const rawPath = (req.path || '').replace(/^\/api(?:\/v1)?/, '');
    const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    // Health check
    if (cleanPath === '/health' || cleanPath === '/test-connection' || cleanPath === '/verify') {
        res.status(200).json({
            status: 'ok',
            success: true,
            message: 'Amaze Ops Serverless API is online and healthy',
            timestamp: new Date().toISOString()
        });
        return;
    }
    // API Key authentication
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== API_KEY) {
        res.status(401).json({ error: 'Unauthorized: Invalid or missing x-api-key header' });
        return;
    }
    // GET /services
    if (req.method === 'GET' && cleanPath === '/services') {
        try {
            const snap = await db.collection('services').get();
            const services = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            res.status(200).json({
                success: true,
                count: services.length,
                services,
                data: services
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch services', details: err.message });
            return;
        }
    }
    // POST /services/sync — Sync service catalog pushed by Customer App
    if (req.method === 'POST' && (cleanPath === '/services/sync' || cleanPath === '/services')) {
        try {
            const incomingList = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.services) ? req.body.services : null);
            if (!incomingList || incomingList.length === 0) {
                res.status(400).json({ error: 'Invalid payload: Expected an array or { services: [...] }' });
                return;
            }
            let syncedCount = 0;
            for (const cs of incomingList) {
                if (!cs.name)
                    continue;
                const cleanName = String(cs.name).trim();
                const code = cs.code || cs.service_code || cs.id || cleanName.toUpperCase().replace(/\s+/g, '-');
                const desc = cs.description || '';
                const isActive = cs.active !== false;
                let docRef = null;
                let existingData = {};
                const snapName = await db.collection('services').where('name', '==', cleanName).get();
                if (!snapName.empty) {
                    docRef = snapName.docs[0].ref;
                    existingData = snapName.docs[0].data();
                }
                else if (code) {
                    const snapCode = await db.collection('services').where('code', '==', code).get();
                    if (!snapCode.empty) {
                        docRef = snapCode.docs[0].ref;
                        existingData = snapCode.docs[0].data();
                    }
                }
                const targetDoc = docRef || db.collection('services').doc();
                const serviceRecord = {
                    id: targetDoc.id,
                    name: cleanName,
                    code,
                    amazeFabServiceId: cs.amazeFabServiceId || cs.code || `AMF-${cleanName.slice(0, 4).toUpperCase().replace(/\s+/g, '')}`,
                    description: desc,
                    goldRate: existingData?.goldRate !== undefined ? Number(existingData.goldRate) : 100,
                    yellowRate: existingData?.yellowRate !== undefined ? Number(existingData.yellowRate) : 80,
                    blueRate: existingData?.blueRate !== undefined ? Number(existingData.blueRate) : 60,
                    active: isActive,
                    updatedAt: new Date().toISOString()
                };
                await targetDoc.set(serviceRecord, { merge: true });
                syncedCount++;
            }
            res.status(200).json({
                success: true,
                count: syncedCount,
                message: 'Services catalog synced successfully. Partner pricing preserved.'
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to sync services', details: err.message });
            return;
        }
    }
    // POST /orders
    if (req.method === 'POST' && (cleanPath === '/orders' || cleanPath === '/' || cleanPath === '')) {
        try {
            const data = req.body || {};
            const orderId = String(data.order_no || data.orderNo || data.orderId || `ORD-${Date.now()}`);
            const city = data.city || data.customer_city || data.customerCity || (data.customer && data.customer.city) || '';
            const pincode = data.pincode || data.pin_code || data.pinCode || data.postal_code || (data.customer && data.customer.pincode) || '';
            // Safely parse Hub details with multiple format support
            const rawHub = data.hub || {};
            const hubCoords = parseCoordinates(rawHub.geoLocation) ||
                parseCoordinates(rawHub) ||
                parseCoordinates({ latitude: data.hub_latitude || data.hubLatitude || data.hub_lat || data.hubLat, longitude: data.hub_longitude || data.hubLongitude || data.hub_lng || data.hubLng }) ||
                { lat: 12.9352, lng: 77.6245 }; // Default to Bangalore Hub if missing
            const hubName = rawHub.name || rawHub.hubName || data.hub_name || data.hubName || 'Koramangala Central Hub';
            const hubCode = rawHub.code || rawHub.hubCode || data.hub_code || data.hubCode || 'HUB-BLR-01';
            const hubLocation = rawHub.location || rawHub.hubLocation || data.hub_location || data.hubLocation || 'Koramangala, Bangalore';
            const hubAddress = rawHub.address || data.hub_address || data.hubAddress || 'No. 42, 80 Feet Road, 4th Block, Koramangala, Bengaluru - 560034';
            const hubPhone = rawHub.phone || data.hub_phone || data.hubPhone || '+91 98450 12345';
            const hubObj = {
                name: hubName,
                code: hubCode,
                location: hubLocation,
                address: hubAddress,
                phone: hubPhone,
                latitude: hubCoords.lat,
                longitude: hubCoords.lng,
                geoLocation: {
                    latitude: hubCoords.lat,
                    longitude: hubCoords.lng,
                }
            };
            const garmentsList = Array.isArray(data.garments) ? data.garments.map((g, i) => {
                const rawCat = g.garment_category || g.garmentCategory || g.category || 'GOLD';
                return {
                    garmentId: g.garment_id_code || g.garment_id || g.garmentId || `GAR-${orderId}-${i + 1}`,
                    garment_id_code: g.garment_id_code || g.garment_id || g.garmentId || `GAR-${orderId}-${i + 1}`,
                    qrCode: g.qr_code || g.qrCode || `QR-${orderId}-${i + 1}`,
                    qr_code: g.qr_code || g.qrCode || `QR-${orderId}-${i + 1}`,
                    garmentType: g.garment_type || g.garmentType || 'Garment',
                    garment_type: g.garment_type || g.garmentType || 'Garment',
                    category: rawCat,
                    garmentCategory: rawCat,
                    serviceType: g.service_type || g.serviceType || 'Dry clean',
                    service_type: g.service_type || g.serviceType || 'Dry clean',
                    brand: g.brand || '',
                    color: g.color || '',
                    pieces: g.pieces || 1,
                    price: g.price || 0,
                    special_instructions: g.special_instructions || g.specialInstructions || '',
                    defects_noted: g.defects_noted || g.defectsNoted || '',
                    status: 'PENDING',
                };
            }) : [];
            const now = new Date().toISOString();
            // Auto-split garments into sub-orders based on Care Category and nearest partner
            const partnersSnap = await db.collection('partners').get();
            const allPartners = partnersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p) => p.active !== false);
            // Group garments by Care Category
            const catGroups = new Map();
            for (const g of garmentsList) {
                const catStr = String(g.garmentCategory || g.category || 'GOLD');
                if (!catGroups.has(catStr))
                    catGroups.set(catStr, []);
                catGroups.get(catStr).push(g);
            }
            const partnerAssignments = [];
            let subNum = 1;
            for (const [cat, group] of catGroups) {
                const normCat = normalizeCat(cat);
                const eligible = allPartners.filter((p) => {
                    const pCats = (p.categoryArray || [p.category].filter(Boolean)).map((c) => normalizeCat(c));
                    return pCats.indexOf(normCat) !== -1;
                });
                if (eligible.length === 0)
                    continue;
                // Sort by proximity to Hub (nearest partner wins)
                const sorted = [...eligible].sort((a, b) => {
                    const coordsA = getPartnerCoordinates(a);
                    const coordsB = getPartnerCoordinates(b);
                    const distA = coordsA ? getDistanceKm(hubCoords.lat, hubCoords.lng, coordsA.lat, coordsA.lng) : 999999;
                    const distB = coordsB ? getDistanceKm(hubCoords.lat, hubCoords.lng, coordsB.lat, coordsB.lng) : 999999;
                    if (Math.abs(distA - distB) >= 0.1) {
                        return distA - distB;
                    }
                    const pa = a.priority || 99;
                    const pb = b.priority || 99;
                    return pa - pb;
                });
                const best = sorted[0];
                const bestCoords = getPartnerCoordinates(best);
                const dist = bestCoords ? getDistanceKm(hubCoords.lat, hubCoords.lng, bestCoords.lat, bestCoords.lng) : null;
                partnerAssignments.push({
                    partnerId: best.id,
                    partnerCode: best.partnerCode || 'P',
                    partnerName: best.companyName || best.name || 'Partner',
                    partnerPhone: best.phone || best.contactPhone || '',
                    partnerAddress: best.address || '',
                    partnerGeoLocation: bestCoords ? { latitude: bestCoords.lat, longitude: bestCoords.lng } : null,
                    careCategory: cat,
                    garments: group,
                    garmentIds: group.map(g => g.garmentId || g.garment_id_code),
                    garmentCount: group.length,
                    distanceKm: dist,
                    distance: dist != null ? `${dist} km` : '',
                });
            }
            // Merge by partnerId — one sub-order per partner
            const partnerMap = new Map();
            for (const a of partnerAssignments) {
                const list = partnerMap.get(a.partnerId) || [];
                list.push(a);
                partnerMap.set(a.partnerId, list);
            }
            const generatedSubOrders = [];
            const formattedAssignments = [];
            const batch = db.batch();
            for (const [, group] of partnerMap) {
                const first = group[0];
                const allGarments = group.flatMap(a => a.garments || []);
                const allGarmentIds = group.flatMap(a => a.garmentIds);
                const subOrderCode = `${orderId}-${first.partnerCode}-${subNum}`;
                const subRef = db.collection('subOrders').doc(subOrderCode);
                const soData = {
                    id: subOrderCode,
                    orderId,
                    mainOrderNumber: orderId,
                    subOrderCode,
                    subOrderNumber: subOrderCode,
                    partnerId: first.partnerId,
                    partnerCode: first.partnerCode,
                    partnerName: first.partnerName,
                    partnerPhone: first.partnerPhone,
                    partnerAddress: first.partnerAddress,
                    partnerGeoLocation: first.partnerGeoLocation,
                    garmentCategory: group.map(g => g.careCategory).join(','),
                    careCategory: group.map(g => g.careCategory).join(','),
                    garmentIds: allGarmentIds,
                    garments: allGarments,
                    garmentCount: allGarmentIds.length,
                    distanceKm: first.distanceKm,
                    distance: first.distance,
                    distanceFromHub: first.distance,
                    status: 'ASSIGNED',
                    createdAt: now,
                    updatedAt: now,
                };
                batch.set(subRef, soData, { merge: true });
                generatedSubOrders.push(soData);
                formattedAssignments.push({
                    sub_order_no: subOrderCode,
                    category: group.map(g => g.careCategory).join(','),
                    garment_count: allGarments.length,
                    partner: {
                        id: first.partnerId,
                        name: first.partnerName,
                        phone: first.partnerPhone || '',
                        address: first.partnerAddress || '',
                        geo_location: first.partnerGeoLocation || null,
                        distance_from_hub_km: first.distanceKm != null ? Math.round(first.distanceKm * 10) / 10 : null,
                    },
                    garments: allGarments.map((g) => ({
                        garment_id_code: g.garment_id_code || g.garmentId,
                        qr_code: g.qr_code || g.qrCode,
                        garment_type: g.garment_type || g.garmentType,
                        category: g.category || g.garmentCategory,
                        service_type: g.service_type || g.serviceType,
                    })),
                });
                subNum++;
            }
            const orderStatus = generatedSubOrders.length > 0 ? 'ASSIGNED' : 'RECEIVED';
            const orderPayload = {
                id: orderId,
                orderId,
                orderNumber: orderId,
                order_no: orderId,
                customer_name: data.customer_name || data.customerName || (data.customer && data.customer.name) || 'Unknown',
                customer_phone: data.customer_phone || data.customerPhone || (data.customer && data.customer.phone) || '—',
                customer_category: data.customer_category || data.customerCategory || (data.customer && data.customer.category) || 'RETAIL',
                city,
                pincode,
                customer: {
                    name: data.customer_name || data.customerName || (data.customer && data.customer.name) || 'Unknown',
                    phone: data.customer_phone || data.customerPhone || (data.customer && data.customer.phone) || '—',
                    category: data.customer_category || data.customerCategory || (data.customer && data.customer.category) || 'RETAIL',
                    city,
                    pincode,
                },
                hub: hubObj,
                hubName: hubObj.name,
                hubCode: hubObj.code,
                hubLocation: hubObj.location,
                hubLatitude: hubObj.latitude,
                hubLongitude: hubObj.longitude,
                hubAddress: hubObj.address,
                hubPhone: hubObj.phone,
                careCategory: data.care_category || data.careCategory || 'Normal',
                care_category: data.care_category || data.careCategory || 'Normal',
                status: orderStatus,
                deliveryStatus: 'PENDING',
                garments: garmentsList,
                subOrders: generatedSubOrders,
                createdAt: data.created_at || now,
                updatedAt: now,
            };
            batch.set(db.collection('orders').doc(orderId), orderPayload, { merge: true });
            await batch.commit();
            // Push outbound webhook notification to external Customer App if sub-orders were generated
            const custUrl = process.env.CUSTOMER_APP_URL || 'http://localhost:5000';
            let notifySuccess = false;
            if (generatedSubOrders.length > 0) {
                try {
                    const resp = await fetch(`${custUrl}/api/orders/${encodeURIComponent(orderId)}/split`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': API_KEY,
                        },
                        body: JSON.stringify({
                            mainOrderNumber: orderId,
                            status: 'ASSIGNED',
                            totalSubOrders: generatedSubOrders.length,
                            subOrders: generatedSubOrders,
                            timestamp: now,
                        }),
                    });
                    notifySuccess = resp.ok;
                }
                catch (e) {
                    // Non-fatal if customer app is async
                }
            }
            res.status(201).json({
                success: true,
                order_no: orderId,
                status: orderStatus,
                total_sub_orders: generatedSubOrders.length,
                partner_assignments: formattedAssignments,
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to create order', details: err.message });
            return;
        }
    }
    // GET /orders (list all)
    if (req.method === 'GET' && cleanPath === '/orders') {
        try {
            const snap = await db.collection('orders').limit(100).get();
            const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            res.status(200).json({
                success: true,
                count: orders.length,
                orders,
                data: orders
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to list orders', details: err.message });
            return;
        }
    }
    // GET /orders/:id (track order with partner live statuses)
    const orderMatch = cleanPath.match(/^\/orders\/([^/]+)$/);
    if (req.method === 'GET' && orderMatch) {
        try {
            const targetId = orderMatch[1];
            let orderDoc = await db.collection('orders').doc(targetId).get();
            if (!orderDoc.exists) {
                let querySnap = await db.collection('orders').where('orderNumber', '==', targetId).limit(1).get();
                if (querySnap.empty) {
                    querySnap = await db.collection('orders').where('order_no', '==', targetId).limit(1).get();
                }
                if (querySnap.empty) {
                    querySnap = await db.collection('orders').where('orderId', '==', targetId).limit(1).get();
                }
                if (!querySnap.empty) {
                    orderDoc = querySnap.docs[0];
                }
            }
            if (!orderDoc.exists) {
                res.status(404).json({ error: 'Order not found' });
                return;
            }
            const orderData = { id: orderDoc.id, ...orderDoc.data() };
            const curStatus = orderData.status || 'RECEIVED';
            // Fetch subOrders from Firestore if available
            let subsSnap = await db.collection('subOrders').where('orderId', '==', orderDoc.id).get();
            if (subsSnap.empty && orderData.orderNumber) {
                subsSnap = await db.collection('subOrders').where('mainOrderNumber', '==', orderData.orderNumber).get();
            }
            if (subsSnap.empty && orderData.order_no) {
                subsSnap = await db.collection('subOrders').where('mainOrderNumber', '==', orderData.order_no).get();
            }
            const rawSubs = !subsSnap.empty
                ? subsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                : (orderData.subOrders || []);
            // Fetch partners lookup map for full partner details (phone, address, geo)
            const partnersMap = new Map();
            try {
                const pSnap = await db.collection('partners').get();
                pSnap.docs.forEach(pDoc => {
                    partnersMap.set(pDoc.id, { id: pDoc.id, ...pDoc.data() });
                });
            }
            catch (e) { }
            // 5-Step Lifecycle Calculator
            const getPartnerStep = (soStatus, qcStatus) => {
                const st = (soStatus || '').toUpperCase();
                const qc = (qcStatus || '').toUpperCase();
                if (st === 'PICKUP_ARRANGED') {
                    return { step: 5, label: 'Pickup Arranged', pct: 100 };
                }
                if (st === 'COMPLETED' || st === 'DELIVERED') {
                    return { step: 5, label: 'Completed', pct: 100 };
                }
                if (st === 'QC_APPROVED' || st === 'QC_VERIFIED' || qc === 'QC_APPROVED' || qc === 'QC_VERIFIED' || qc === 'PASSED') {
                    return { step: 4, label: 'QC Verified', pct: 80 };
                }
                if (st === 'QC_REJECTED' || qc === 'QC_REJECTED' || qc === 'FAILED') {
                    return { step: 4, label: 'QC Rejected (Rework)', pct: 80 };
                }
                if (st === 'QC_PENDING' || st === 'QC_SENT' || qc === 'SUBMITTED' || qc === 'PENDING') {
                    return { step: 3, label: 'QC Submitted', pct: 60 };
                }
                if (st === 'IN_PROCESS' || st === 'ACCEPTED' || st === 'PROCESSING') {
                    return { step: 2, label: 'Accepted & Processing', pct: 40 };
                }
                return { step: 1, label: 'Assigned', pct: 20 };
            };
            const allOrderGarments = orderData.garments || [];
            const partnerStatuses = rawSubs.map((so) => {
                const pInfo = partnersMap.get(so.partnerId) || {};
                const pGeo = so.partnerGeoLocation || (pInfo.latitude && pInfo.longitude ? { latitude: pInfo.latitude, longitude: pInfo.longitude } : null) || pInfo.geoLocation || null;
                const stepInfo = getPartnerStep(so.status, so.qcStatus);
                const assignedGarmentIds = so.garmentIds || [];
                const matchedGarments = allOrderGarments.filter((g) => {
                    const gId = g.garment_id_code || g.garmentId;
                    return assignedGarmentIds.length === 0 || assignedGarmentIds.includes(gId);
                });
                const fiveSteps = [
                    { step: 1, name: 'Assigned', status: stepInfo.step >= 1 ? (stepInfo.step > 1 ? 'COMPLETED' : 'CURRENT') : 'PENDING', progress_pct: 20 },
                    { step: 2, name: 'Accepted & Processing', status: stepInfo.step >= 2 ? (stepInfo.step > 2 ? 'COMPLETED' : 'CURRENT') : 'PENDING', progress_pct: 40 },
                    { step: 3, name: 'QC Submitted', status: stepInfo.step >= 3 ? (stepInfo.step > 3 ? 'COMPLETED' : 'CURRENT') : 'PENDING', progress_pct: 60 },
                    { step: 4, name: 'QC Verified', status: stepInfo.step >= 4 ? (stepInfo.step > 4 ? 'COMPLETED' : 'CURRENT') : 'PENDING', progress_pct: 80 },
                    { step: 5, name: 'Completed', status: stepInfo.step === 5 ? 'COMPLETED' : 'PENDING', progress_pct: 100 }
                ];
                return {
                    sub_order_no: so.subOrderCode || so.subOrderNumber || so.id,
                    category: so.careCategory || so.garmentCategory || 'STANDARD',
                    garment_count: matchedGarments.length || so.garmentCount || assignedGarmentIds.length || 0,
                    status: so.status || 'ASSIGNED',
                    status_label: stepInfo.label,
                    current_step: stepInfo.step,
                    progress_pct: stepInfo.pct,
                    lifecycle: fiveSteps,
                    partner: {
                        id: so.partnerId || pInfo.id || '',
                        name: so.partnerName || pInfo.companyName || pInfo.contactPerson || pInfo.name || 'Partner',
                        phone: so.partnerPhone || pInfo.phone || '',
                        address: so.partnerAddress || pInfo.address || '',
                        geo_location: pGeo,
                        distance_from_hub_km: so.distanceKm != null ? Math.round(Number(so.distanceKm) * 10) / 10 : null,
                    },
                    garments: matchedGarments.map((g) => ({
                        garment_id_code: g.garment_id_code || g.garmentId,
                        qr_code: g.qr_code || g.qrCode,
                        garment_type: g.garment_type || g.garmentType,
                        category: g.category || g.garmentCategory,
                        service_type: g.service_type || g.serviceType,
                        status: g.status || so.status || 'PENDING',
                    })),
                };
            });
            // Calculate overall order status based on partner sub-orders
            let overallStatus = curStatus;
            if (curStatus === 'PICKUP_ARRANGED' || orderData.pickupStatus === 'PICKUP_ARRANGED' || orderData.pickupArranged) {
                overallStatus = 'PICKUP_ARRANGED';
            }
            else if (partnerStatuses.length > 0) {
                if (partnerStatuses.some((p) => p.status === 'PICKUP_ARRANGED')) {
                    overallStatus = 'PICKUP_ARRANGED';
                }
                else if (partnerStatuses.every((p) => p.status === 'COMPLETED')) {
                    overallStatus = 'COMPLETED';
                }
                else if (partnerStatuses.some((p) => p.status === 'QC_REJECTED')) {
                    overallStatus = 'QC_REJECTED';
                }
                else if (partnerStatuses.every((p) => p.status === 'QC_APPROVED')) {
                    overallStatus = 'QC_APPROVED';
                }
                else if (partnerStatuses.some((p) => p.status === 'QC_PENDING' || p.current_step >= 3)) {
                    overallStatus = 'QC_PENDING';
                }
                else if (partnerStatuses.some((p) => p.status === 'IN_PROCESS' || p.current_step >= 2)) {
                    overallStatus = 'IN_PROCESS';
                }
                else {
                    overallStatus = 'ASSIGNED';
                }
            }
            const stages = [
                { key: 'ASSIGNED', name: 'Assigned', step: 1, pct: 20 },
                { key: 'IN_PROCESS', name: 'Accepted & Processing', step: 2, pct: 40 },
                { key: 'QC_PENDING', name: 'QC Submitted', step: 3, pct: 60 },
                { key: 'QC_APPROVED', name: 'QC Verified', step: 4, pct: 80 },
                { key: 'COMPLETED', name: 'Completed', step: 5, pct: 100 },
                { key: 'PICKUP_ARRANGED', name: 'Pickup Arranged', step: 5, pct: 100 }
            ];
            const stageKeys = stages.map(s => s.key);
            const curIdx = stageKeys.indexOf(overallStatus) !== -1 ? stageKeys.indexOf(overallStatus) : 0;
            const timeline = stages.map((st, idx) => ({
                stage: st.key,
                name: st.name,
                step: st.step,
                progress_pct: st.pct,
                completed: idx <= curIdx,
                current: idx === curIdx,
                timestamp: idx <= curIdx ? (orderData.updatedAt || orderData.createdAt) : null
            }));
            res.status(200).json({
                success: true,
                order_no: orderData.order_no || orderData.orderNumber || orderData.id,
                overall_status: overallStatus,
                status: overallStatus,
                total_sub_orders: partnerStatuses.length,
                partner_statuses: partnerStatuses,
                timeline,
                // Backward compatibility keys
                orderId: orderData.order_no || orderData.orderNumber || orderData.id,
                mainOrderNumber: orderData.orderNumber || orderData.id,
                totalSubOrders: partnerStatuses.length,
                subOrders: rawSubs,
                order: orderData,
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch order', details: err.message });
            return;
        }
    }
    // POST /orders/:id/split (push grouped split sub-orders)
    const splitMatch = cleanPath.match(/^\/orders\/([^/]+)\/split$/);
    if (req.method === 'POST' && (splitMatch || cleanPath === '/orders/split')) {
        try {
            const mainOrderNo = splitMatch ? splitMatch[1] : (req.body.mainOrderNumber || req.body.orderId || req.body.id);
            const { subOrders, splitOrders, status } = req.body;
            const rawOrders = subOrders || splitOrders || [];
            const ordersToPush = rawOrders.map((so) => {
                const subCode = so.subOrderNumber || so.subOrderCode || `${mainOrderNo}-${so.partnerCode || 'P'}`;
                const distKm = so.distanceKm != null ? Number(so.distanceKm) : (so.distance ? parseFloat(so.distance) : null);
                return {
                    subOrderNumber: subCode,
                    subOrderCode: subCode,
                    partnerName: so.partnerName || '',
                    partnerCode: so.partnerCode || '',
                    partnerId: so.partnerId || '',
                    status: so.status || 'ASSIGNED',
                    partnerGeoLocation: so.partnerGeoLocation || so.geoLocation || null,
                    distance: so.distance || (distKm != null ? `${distKm} km` : ''),
                    distanceKm: distKm,
                    careCategory: so.careCategory || so.garmentCategory || '',
                    garmentCount: so.garmentCount || (Array.isArray(so.garmentIds) ? so.garmentIds.length : 0),
                    garmentIds: so.garmentIds || [],
                };
            });
            const now = new Date().toISOString();
            const batch = db.batch();
            for (const so of ordersToPush) {
                const docId = so.subOrderCode;
                const ref = db.collection('subOrders').doc(docId);
                batch.set(ref, {
                    id: docId,
                    orderId: mainOrderNo,
                    mainOrderNumber: mainOrderNo,
                    subOrderCode: so.subOrderCode,
                    subOrderNumber: so.subOrderNumber,
                    partnerName: so.partnerName,
                    partnerCode: so.partnerCode,
                    partnerId: so.partnerId,
                    status: so.status,
                    partnerGeoLocation: so.partnerGeoLocation,
                    distance: so.distance,
                    distanceKm: so.distanceKm,
                    distanceFromHub: so.distance,
                    careCategory: so.careCategory,
                    garmentCount: so.garmentCount,
                    garmentIds: so.garmentIds,
                    updatedAt: now,
                }, { merge: true });
            }
            const mainOrderRef = db.collection('orders').doc(mainOrderNo);
            batch.set(mainOrderRef, {
                status: status || 'ASSIGNED',
                subOrders: ordersToPush,
                updatedAt: now,
            }, { merge: true });
            await batch.commit();
            // Outbound webhook to Customer App
            const custUrl = process.env.CUSTOMER_APP_URL || 'http://localhost:5000';
            let notifySuccess = false;
            try {
                const resp = await fetch(`${custUrl}/api/orders/${encodeURIComponent(mainOrderNo)}/split`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': API_KEY
                    },
                    body: JSON.stringify({
                        mainOrderNumber: mainOrderNo,
                        status: status || 'ASSIGNED',
                        totalSubOrders: ordersToPush.length,
                        subOrders: ordersToPush,
                        timestamp: now,
                    })
                });
                notifySuccess = resp.ok;
            }
            catch (e) {
                // Non-fatal if customer app is offline
            }
            res.status(200).json({
                success: true,
                mainOrderNumber: mainOrderNo,
                status: status || 'ASSIGNED',
                totalSubOrders: ordersToPush.length,
                customerAppNotified: notifySuccess,
                subOrders: ordersToPush,
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to split order', details: err.message });
            return;
        }
    }
    // POST /orders/:id/accept (partner accept sub-order or main order)
    const acceptMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)\/accept$/);
    if (req.method === 'POST' && acceptMatch) {
        try {
            const targetId = acceptMatch[1];
            const result = await (0, orderService_1.syncSubOrderStatusAndNotify)(targetId, 'IN_PROCESS');
            res.status(200).json({
                success: true,
                orderId: result.mainOrderId || targetId,
                mainOrderNumber: result.mainOrderId || targetId,
                subOrderId: result.subOrderId,
                status: result.overallStatus,
                overallStatus: result.overallStatus,
                updatedSubOrder: result.updatedSubOrder,
                totalSubOrders: result.subOrders.length,
                subOrders: result.subOrders,
                customerAppNotified: result.customerAppNotified,
                message: 'Order accepted by partner'
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to accept order', details: err.message });
            return;
        }
    }
    // POST /orders/:id/qc/submit (sub-order or main order QC submit)
    const qcSubmitMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)\/qc\/submit$/);
    if (req.method === 'POST' && qcSubmitMatch) {
        try {
            const targetId = qcSubmitMatch[1];
            const result = await (0, orderService_1.syncSubOrderStatusAndNotify)(targetId, 'QC_PENDING', {
                qcSubmission: req.body,
                qcStatus: 'QC_PENDING',
            });
            res.status(200).json({
                success: true,
                orderId: result.mainOrderId || targetId,
                mainOrderNumber: result.mainOrderId || targetId,
                subOrderId: result.subOrderId,
                status: result.overallStatus,
                overallStatus: result.overallStatus,
                updatedSubOrder: result.updatedSubOrder,
                totalSubOrders: result.subOrders.length,
                subOrders: result.subOrders,
                customerAppNotified: result.customerAppNotified,
                message: 'QC submitted'
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to submit QC', details: err.message });
            return;
        }
    }
    // POST /orders/:id/qc/approve
    const qcApproveMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)\/qc\/approve$/);
    if (req.method === 'POST' && qcApproveMatch) {
        try {
            const targetId = qcApproveMatch[1];
            const result = await (0, orderService_1.syncSubOrderStatusAndNotify)(targetId, 'COMPLETED', {
                qcApproved: true,
                qcStatus: 'APPROVED',
                completedAt: new Date().toISOString(),
            });
            res.status(200).json({
                success: true,
                orderId: result.mainOrderId || targetId,
                mainOrderNumber: result.mainOrderId || targetId,
                subOrderId: result.subOrderId,
                status: result.overallStatus,
                overallStatus: result.overallStatus,
                updatedSubOrder: result.updatedSubOrder,
                totalSubOrders: result.subOrders.length,
                subOrders: result.subOrders,
                customerAppNotified: result.customerAppNotified,
                message: 'QC approved - Order completed'
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to approve QC', details: err.message });
            return;
        }
    }
    // POST /orders/:id/pickup-arranged (Customer app notifies that pickup has been scheduled)
    const pickupMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)\/(?:pickup-arranged|pickup)$/);
    if (req.method === 'POST' && pickupMatch) {
        try {
            const targetId = pickupMatch[1];
            const now = new Date().toISOString();
            const { rider_name, rider_phone, pickup_time, notes } = req.body || {};
            const pickupDetails = {
                status: 'PICKUP_ARRANGED',
                deliveryStatus: 'PICKUP_ARRANGED',
                pickupStatus: 'PICKUP_ARRANGED',
                pickupArranged: true,
                pickupArrangedAt: now,
                rider_name: rider_name || null,
                rider_phone: rider_phone || null,
                pickup_time: pickup_time || null,
                notes: notes || null,
                updatedAt: now,
            };
            // 1. Check if targetId is an order in orders collection
            let orderDoc = await db.collection('orders').doc(targetId).get();
            if (!orderDoc.exists) {
                let qSnap = await db.collection('orders').where('orderNumber', '==', targetId).limit(1).get();
                if (qSnap.empty) {
                    qSnap = await db.collection('orders').where('order_no', '==', targetId).limit(1).get();
                }
                if (qSnap.empty) {
                    qSnap = await db.collection('orders').where('orderId', '==', targetId).limit(1).get();
                }
                if (!qSnap.empty) {
                    orderDoc = qSnap.docs[0];
                }
            }
            if (orderDoc.exists) {
                const orderId = orderDoc.id;
                await db.collection('orders').doc(orderId).set(pickupDetails, { merge: true });
                // Also update all sub-orders under this order so partners see the badge
                let subsSnap = await db.collection('subOrders').where('orderId', '==', orderId).get();
                if (subsSnap.empty) {
                    const ordNum = orderDoc.data()?.orderNumber || orderDoc.data()?.order_no;
                    if (ordNum) {
                        subsSnap = await db.collection('subOrders').where('mainOrderNumber', '==', ordNum).get();
                    }
                }
                if (!subsSnap.empty) {
                    const batch = db.batch();
                    subsSnap.docs.forEach(docSnap => {
                        batch.set(docSnap.ref, pickupDetails, { merge: true });
                    });
                    await batch.commit();
                }
                res.status(200).json({
                    success: true,
                    order_no: orderDoc.data()?.order_no || orderDoc.data()?.orderNumber || orderId,
                    status: 'PICKUP_ARRANGED',
                    badge: 'PICKUP ARRANGED',
                    pickup_arranged_at: now,
                    rider_name: rider_name || null,
                    rider_phone: rider_phone || null,
                    pickup_time: pickup_time || null,
                    sub_orders_updated: subsSnap.size,
                    message: 'Pickup arranged successfully. Status badge updated to PICKUP ARRANGED across Admin and Partner apps.'
                });
                return;
            }
            // 2. Otherwise check if targetId is a sub-order
            let subDoc = await db.collection('subOrders').doc(targetId).get();
            if (!subDoc.exists) {
                let qSub = await db.collection('subOrders').where('subOrderCode', '==', targetId).limit(1).get();
                if (qSub.empty) {
                    qSub = await db.collection('subOrders').where('subOrderNumber', '==', targetId).limit(1).get();
                }
                if (!qSub.empty) {
                    subDoc = qSub.docs[0];
                }
            }
            if (subDoc.exists) {
                await subDoc.ref.set(pickupDetails, { merge: true });
                const sData = subDoc.data() || {};
                const parentId = sData.orderId || sData.mainOrderNumber;
                if (parentId) {
                    await db.collection('orders').doc(parentId).set(pickupDetails, { merge: true });
                }
                res.status(200).json({
                    success: true,
                    sub_order_no: sData.subOrderCode || sData.subOrderNumber || subDoc.id,
                    status: 'PICKUP_ARRANGED',
                    badge: 'PICKUP ARRANGED',
                    pickup_arranged_at: now,
                    rider_name: rider_name || null,
                    message: 'Sub-order pickup arranged successfully.'
                });
                return;
            }
            res.status(404).json({ error: 'Order or Sub-order not found', targetId });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to arrange pickup', details: err.message });
            return;
        }
    }
    // POST /orders/:id/delivery/initiate
    const deliveryMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)\/delivery\/initiate$/);
    if (req.method === 'POST' && deliveryMatch) {
        try {
            const targetId = deliveryMatch[1];
            const result = await (0, orderService_1.syncSubOrderStatusAndNotify)(targetId, 'COMPLETED', {
                deliveryStatus: 'COMPLETED',
                completedAt: new Date().toISOString()
            });
            res.status(200).json({
                success: true,
                orderId: result.mainOrderId || targetId,
                mainOrderNumber: result.mainOrderId || targetId,
                subOrderId: result.subOrderId,
                status: result.overallStatus,
                overallStatus: result.overallStatus,
                updatedSubOrder: result.updatedSubOrder,
                totalSubOrders: result.subOrders.length,
                subOrders: result.subOrders,
                customerAppNotified: result.customerAppNotified,
                message: 'Delivery initiated and completed'
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to initiate delivery', details: err.message });
            return;
        }
    }
    // GET /partners/:partnerId/sub-orders
    const partnerSubsMatch = cleanPath.match(/^\/partners\/([^/]+)\/sub-orders$/);
    if (req.method === 'GET' && partnerSubsMatch) {
        try {
            const partnerId = partnerSubsMatch[1];
            const snap = await db.collection('subOrders').where('partnerId', '==', partnerId).get();
            let subs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (subs.length === 0) {
                const snap2 = await db.collection('subOrders').where('partnerCode', '==', partnerId).get();
                subs = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            res.status(200).json({ success: true, partnerId, count: subs.length, subOrders: subs });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch partner sub-orders', details: err.message });
            return;
        }
    }
    // PATCH or PUT /orders/:id/status or /sub-orders/:id/status
    const statusMatch = cleanPath.match(/^\/(?:orders|sub-orders)\/([^/]+)(?:\/status)?$/);
    if ((req.method === 'PATCH' || req.method === 'PUT') && statusMatch) {
        try {
            const targetId = statusMatch[1];
            const newStatus = req.body.status;
            if (!newStatus) {
                res.status(400).json({ error: 'Status is required' });
                return;
            }
            const result = await (0, orderService_1.syncSubOrderStatusAndNotify)(targetId, newStatus, req.body);
            res.status(200).json({
                success: true,
                orderId: result.mainOrderId || targetId,
                mainOrderNumber: result.mainOrderId || targetId,
                subOrderId: result.subOrderId,
                status: result.overallStatus,
                overallStatus: result.overallStatus,
                updatedSubOrder: result.updatedSubOrder,
                totalSubOrders: result.subOrders.length,
                subOrders: result.subOrders,
                customerAppNotified: result.customerAppNotified,
                message: `Status updated to ${newStatus}`
            });
            return;
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to update status', details: err.message });
            return;
        }
    }
    res.status(404).json({ error: 'Endpoint not found', path: cleanPath });
});
// ===== EXPORTS =====
exports.db_instance = db;
exports.admin_instance = admin;
