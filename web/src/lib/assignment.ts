import type { Partner, GarmentInfo } from '../types';

export interface AssignmentResult {
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  garmentCategory: string;
  garmentIds: string[];
  subOrderCode: string;
  distanceKm?: number;
}

/**
 * Calculate geographical distance in kilometers between two GPS coordinates using the Haversine formula.
 */
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Safely parse coordinates from a partner object (supports nested geoLocation, flat latitude/longitude, or lat/lng/logi).
 */
export function getPartnerCoordinates(p: Partner): { lat: number; lng: number } | null {
  const rawLat = p.geoLocation?.latitude ?? (p as any).latitude ?? (p as any).lat;
  const rawLng = p.geoLocation?.longitude ?? (p as any).longitude ?? (p as any).lng ?? (p as any).logi;
  if (rawLat == null || rawLng == null || rawLat === '' || rawLng === '') return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
    return null;
  }
  return { lat, lng };
}

/**
 * Safely parse coordinates from a Hub object or flat coordinates.
 */
export function parseCoordinates(geo: any): { lat: number; lng: number } | null {
  if (!geo) return null;
  const rawLat = geo.latitude ?? geo.lat ?? geo.hubLatitude;
  const rawLng = geo.longitude ?? geo.lng ?? geo.log ?? geo.hubLongitude;
  if (rawLat == null || rawLng == null || rawLat === '' || rawLng === '') return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
    return null;
  }
  return { lat, lng };
}

/**
 * Auto-assign garments from an order to the best-fit partners.
 *
 * Rules:
 * 1. Filter active partners who support the garment category (Signature/Gold, Pristine/Orange, Premium/Blue)
 * 2. Primary Rule: Proximity — Pick the nearest partner to the Order's Hub location (lowest distance in km)
 * 3. Secondary Rule: Priority level (1 > 2 > 3) when distances are equal or coordinates are unavailable
 * 4. Tertiary Rule: If a partner supports multiple categories present in the order, assign all to that partner
 *    (fewer handoffs = more capable partner wins)
 * 5. Format subOrderCode: {orderCode}-{partnerCode}-{subNumber}
 */
export function assignGarmentsToPartners(
  orderCode: string,
  garments: GarmentInfo[],
  partners: Partner[],
  hubGeo?: any
): AssignmentResult[] {
  if (!garments.length || !partners.length) return [];

  const hubCoords = parseCoordinates(hubGeo);

  console.log('[assign] hubCoords=', hubCoords);
  console.log('[assign] partners=', partners.map(p => {
    const coords = getPartnerCoordinates(p);
    const dist = hubCoords && coords ? getDistanceKm(hubCoords.lat, hubCoords.lng, coords.lat, coords.lng) : null;
    return `${p.companyName}[${p.partnerCode}] cats=${JSON.stringify(p.categoryArray || p.category)} active=${p.active} prio=${p.priority} dist=${dist != null ? dist + 'km' : 'N/A'}`;
  }));
  console.log('[assign] garments=', garments.map(g => `${g.garmentId} cat=${g.garmentCategory}`));

  // Group garments by category
  const groups = new Map<string, { category: string; garments: GarmentInfo[] }>();
  for (const g of garments) {
    let cat: any = g.garmentCategory;
    if (cat && typeof cat === 'object') cat = cat.name || cat.code || 'GOLD';
    const catStr = String(cat || 'GOLD');
    if (!groups.has(catStr)) groups.set(catStr, { category: catStr, garments: [] });
    groups.get(catStr)!.garments.push(g);
  }

  const activePartners = partners.filter(p => p.active);
  const results: AssignmentResult[] = [];
  let subNum = 1;

  // Normalize: Signature (Gold), Pristine (Orange), Premium (Blue)
  const normalizeCat = (c: any) => {
    const s = String(c || '').toUpperCase();
    if (s === 'SIGNATURE' || s === 'GOLD') return 'SIGNATURE';
    if (s === 'PRISTINE' || s === 'ORANGE' || s === 'YELLOW') return 'PRISTINE';
    if (s === 'PREMIUM' || s === 'BLUE') return 'PREMIUM';
    return s || 'PREMIUM';
  };

  for (const [cat, group] of groups) {
    const normCat = normalizeCat(cat);
    // Find partners who support this category (check both original and normalized)
    const eligible = activePartners.filter(p => {
      const pCats: string[] = (p.categoryArray || [p.category].filter(Boolean)).map((c: any) => normalizeCat(c));
      return pCats.indexOf(normCat) !== -1;
    });

    console.log(`[assign] cat=${cat} normCat=${normCat} eligible=`, eligible.map(p => `${p.companyName}[${p.partnerCode}] cats=${JSON.stringify(p.categoryArray || [p.category])} priority=${p.priority}`));

    if (eligible.length === 0) {
      // No partner supports this category — still create a sub-order with no partner
      results.push({
        partnerId: '',
        partnerCode: 'UNASSIGNED',
        partnerName: 'Unassigned',
        garmentCategory: cat,
        garmentIds: group.garments.map(g => g.garmentId),
        subOrderCode: `${orderCode}-UNASSIGNED-${subNum}`,
      });
      subNum++;
      continue;
    }

    // Sort eligible partners:
    // 1. Proximity to Hub (Nearest partner with valid coordinates wins)
    // 2. Priority level (1 > 2 > 3) when distances are equal (within 100 meters) or missing
    // 3. Multi-category capability (fewer handoffs)
    const sorted = [...eligible].sort((a, b) => {
      if (hubCoords) {
        const coordsA = getPartnerCoordinates(a);
        const coordsB = getPartnerCoordinates(b);
        const distA = coordsA ? getDistanceKm(hubCoords.lat, hubCoords.lng, coordsA.lat, coordsA.lng) : 999999;
        const distB = coordsB ? getDistanceKm(hubCoords.lat, hubCoords.lng, coordsB.lat, coordsB.lng) : 999999;

        // If distance difference is meaningful (> 100 meters), nearest partner wins
        if (Math.abs(distA - distB) >= 0.1) {
          return distA - distB;
        }
      }

      // Priority Level (lower number = higher priority: 1 > 2 > 3)
      const pa = a.priority || 99;
      const pb = b.priority || 99;
      if (pa !== pb) return pa - pb;

      // Multi-category support (count how many categories of this order each partner supports)
      const catsInOrder = [...groups.keys()].map(normalizeCat);
      const aCats = (a.categoryArray || [a.category].filter(Boolean)).map(normalizeCat);
      const bCats = (b.categoryArray || [b.category].filter(Boolean)).map(normalizeCat);
      const aCount = catsInOrder.filter(c => aCats.includes(c)).length;
      const bCount = catsInOrder.filter(c => bCats.includes(c)).length;
      return bCount - aCount; // higher count first
    });

    const best = sorted[0];
    const bestCoords = getPartnerCoordinates(best);
    const distanceKm = hubCoords && bestCoords ? getDistanceKm(hubCoords.lat, hubCoords.lng, bestCoords.lat, bestCoords.lng) : undefined;

    console.log(`[assign] PICKED for ${cat}: ${best.companyName}[${best.partnerCode}] distance=${distanceKm != null ? distanceKm + 'km' : 'N/A'}`);
    results.push({
      partnerId: best.id,
      partnerCode: best.partnerCode,
      partnerName: best.companyName,
      garmentCategory: cat,
      garmentIds: group.garments.map(g => g.garmentId),
      subOrderCode: `${orderCode}-${best.partnerCode}-${subNum}`,
      distanceKm,
    });
    subNum++;
  }

  return results;
}
