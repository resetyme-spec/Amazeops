import type { Partner, GarmentInfo } from '../types';

export interface AssignmentResult {
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  garmentCategory: string;
  garmentIds: string[];
  subOrderCode: string;
}

/**
 * Auto-assign garments from an order to the best-fit partners.
 *
 * Rules:
 * 1. Group garments by garmentCategory (GOLD / ORANGE / BLUE)
 * 2. For each group, pick the partner who supports that category
 * 3. If multiple partners support it, prefer the one with lower priority number (1 > 2 > 3)
 * 4. If a partner supports multiple categories present in the order, assign all to that partner
 *    (fewer handoffs = more capable partner wins)
 * 5. Each group gets its own sub-order with format: {orderCode}-{partnerCode}-{subNumber}
 */
export function assignGarmentsToPartners(
  orderCode: string,
  garments: GarmentInfo[],
  partners: Partner[]
): AssignmentResult[] {
  if (!garments.length || !partners.length) return [];

  console.log('[assign] partners=', partners.map(p => `${p.companyName}[${p.partnerCode}] cats=${JSON.stringify(p.categoryArray || p.category)} active=${p.active} priority=${p.priority}`));
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

  // Normalize: treat YELLOW and ORANGE as the same category
  const normalizeCat = (c: any) => {
   const s = String(c || '');
   return s === 'YELLOW' || s === 'ORANGE' ? 'ORANGE' : s;
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

    // Sort by priority (lower number = higher priority), then pick the best
    // Among same priority, prefer the partner who supports the most garment categories
    // present in THIS order (fewer handoffs)
    const sorted = [...eligible].sort((a, b) => {
      const pa = a.priority || 99;
      const pb = b.priority || 99;
      if (pa !== pb) return pa - pb;

      // Same priority: count how many of this order's categories each partner supports
      const catsInOrder = [...groups.keys()].map(normalizeCat);
      const aCats = (a.categoryArray || [a.category].filter(Boolean)).map(normalizeCat);
      const bCats = (b.categoryArray || [b.category].filter(Boolean)).map(normalizeCat);
      const aCount = catsInOrder.filter(c => aCats.includes(c)).length;
      const bCount = catsInOrder.filter(c => bCats.includes(c)).length;
      return bCount - aCount; // higher count first
    });

    const best = sorted[0];
    console.log(`[assign] PICKED for ${cat}: ${best.companyName}[${best.partnerCode}] from`, eligible.map(p => p.companyName));
    results.push({
      partnerId: best.id,
      partnerCode: best.partnerCode,
      partnerName: best.companyName,
      garmentCategory: cat,
      garmentIds: group.garments.map(g => g.garmentId),
      subOrderCode: `${orderCode}-${best.partnerCode}-${subNum}`,
    });
    subNum++;
  }

  return results;
}
