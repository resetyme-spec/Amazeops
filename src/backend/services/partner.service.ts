import { prisma } from '../db/prisma';
import { CustomerCategory, PartnerCategory } from '@prisma/client';

export class PartnerService {
  /**
   * Enforces Section 4.1 Partner Eligibility Matrix:
   * Gold Customer   -> Gold Partner YES, Orange Partner NO, Blue Partner NO
   * Yellow Customer -> Gold Partner YES, Orange Partner YES, Blue Partner NO
   * Blue Customer   -> Gold Partner YES, Orange Partner YES, Blue Partner YES
   */
  static isCustomerCategoryEligible(
    customerCat: CustomerCategory,
    partnerCat: PartnerCategory
  ): boolean {
    if (customerCat === CustomerCategory.GOLD) {
      return partnerCat === PartnerCategory.GOLD;
    }
    if (customerCat === CustomerCategory.YELLOW) {
      return partnerCat === PartnerCategory.GOLD || partnerCat === PartnerCategory.ORANGE;
    }
    if (customerCat === CustomerCategory.BLUE) {
      return (
        partnerCat === PartnerCategory.GOLD ||
        partnerCat === PartnerCategory.ORANGE ||
        partnerCat === PartnerCategory.BLUE
      );
    }
    return false;
  }

  /**
   * Enforces Section 7 Pricing Priority:
   * Specific Partner Price -> Partner Category Price -> Default Marketplace Price
   */
  static async getEffectivePrice(
    partnerId: string,
    serviceId: string,
    date: Date = new Date()
  ): Promise<number | null> {
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new Error(`Partner not found: ${partnerId}`);
    }

    // 1. Check Specific Partner Price
    const specificPrice = await prisma.partnerPricing.findFirst({
      where: {
        partnerId,
        serviceId,
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      orderBy: { startDate: 'desc' },
    });

    if (specificPrice) {
      return specificPrice.price;
    }

    // 2. Check Partner Category Price
    const categoryPrice = await prisma.partnerPricing.findFirst({
      where: {
        partnerCategory: partner.category,
        serviceId,
        partnerId: null,
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      orderBy: { startDate: 'desc' },
    });

    if (categoryPrice) {
      return categoryPrice.price;
    }

    // 3. Check Default Marketplace Price
    const defaultPrice = await prisma.partnerPricing.findFirst({
      where: {
        partnerId: null,
        partnerCategory: null,
        serviceId,
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      orderBy: { startDate: 'desc' },
    });

    if (defaultPrice) {
      return defaultPrice.price;
    }

    return null;
  }

  /**
   * Section 17 Partner Assignment Validation
   */
  static async validatePartnerAssignment(params: {
    partnerId: string;
    customerCategory: CustomerCategory;
    serviceId: string;
    date?: Date;
  }): Promise<{ valid: boolean; reason?: string; price?: number }> {
    const partner = await prisma.partner.findUnique({
      where: { id: params.partnerId },
      include: { partnerServices: true },
    });

    if (!partner) {
      return { valid: false, reason: 'Partner does not exist' };
    }

    // Rule 1: Active
    if (!partner.active) {
      return { valid: false, reason: 'Partner profile is inactive' };
    }

    // Rule 2: Customer Category Eligibility
    if (!this.isCustomerCategoryEligible(params.customerCategory, partner.category)) {
      return {
        valid: false,
        reason: `Partner category ${partner.category} is ineligible for Customer category ${params.customerCategory}`,
      };
    }

    // Rule 3: Required Service Available
    const serviceAvailable = partner.partnerServices.some((ps) => ps.serviceId === params.serviceId);
    if (!serviceAvailable) {
      return { valid: false, reason: 'Partner does not offer the required service' };
    }

    // Rule 4: Price exists
    const price = await this.getEffectivePrice(params.partnerId, params.serviceId, params.date);
    if (price === null) {
      return { valid: false, reason: 'No effective price configuration found for partner and service' };
    }

    return { valid: true, price };
  }
}
