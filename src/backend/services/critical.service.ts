import { prisma } from '../db/prisma';
import { GarmentStatus, CriticalStatus, AdminCriticalResolution, SubOrderStatus } from '@prisma/client';
import { PartnerService } from './partner.service';
import { AuditService } from './audit.service';

export class CriticalService {
  /**
   * Section 29 Critical Garment Flagging by Partner
   */
  static async markGarmentCritical(params: {
    garmentId: string;
    partnerId: string;
    issueDescription: string;
    photoUrl?: string;
    actorUserId: string;
  }) {
    const garment = await prisma.garment.findUnique({
      where: { id: params.garmentId },
      include: { order: true },
    });

    if (!garment) {
      throw new Error(`Garment not found: ${params.garmentId}`);
    }

    if (garment.partnerId !== params.partnerId) {
      throw new Error(`Garment does not belong to partner ${params.partnerId}`);
    }

    // Set garment status to CRITICAL
    await prisma.garment.update({
      where: { id: params.garmentId },
      data: { status: GarmentStatus.CRITICAL },
    });

    // Create CriticalCase
    const criticalCase = await prisma.criticalCase.create({
      data: {
        garmentId: params.garmentId,
        partnerId: params.partnerId,
        issueDescription: params.issueDescription,
        photoUrl: params.photoUrl || null,
        status: CriticalStatus.OPEN,
        createdByUserId: params.actorUserId,
      },
    });

    await AuditService.logAudit({
      actorUserId: params.actorUserId,
      action: 'GARMENT_MARKED_CRITICAL',
      entityName: 'Garment',
      entityId: params.garmentId,
      afterJson: { issueDescription: params.issueDescription, criticalCaseId: criticalCase.id },
    });

    return criticalCase;
  }

  /**
   * Section 30 Critical Resolution (Option A: Reassign, Option B: Retain)
   * Section 31 Reassignment Financial Rule (Original partner earns ₹0)
   */
  static async resolveCriticalCase(params: {
    criticalCaseId: string;
    adminResolution: AdminCriticalResolution;
    newPartnerId?: string;
    newInstruction?: string;
    actorUserId: string;
  }) {
    const criticalCase = await prisma.criticalCase.findUnique({
      where: { id: params.criticalCaseId },
      include: { garment: { include: { order: true } } },
    });

    if (!criticalCase) {
      throw new Error(`Critical case not found: ${params.criticalCaseId}`);
    }

    const garment = criticalCase.garment;

    if (params.adminResolution === AdminCriticalResolution.REASSIGN) {
      if (!params.newPartnerId) {
        throw new Error('newPartnerId is required for REASSIGN resolution');
      }

      // Validate new partner
      const val = await PartnerService.validatePartnerAssignment({
        partnerId: params.newPartnerId,
        customerCategory: garment.order.customerCategory,
        serviceId: garment.serviceId,
      });

      if (!val.valid) {
        throw new Error(`Cannot reassign: ${val.reason}`);
      }

      const newPartner = await prisma.partner.findUnique({ where: { id: params.newPartnerId } });
      if (!newPartner) throw new Error('New partner not found');

      const newSubOrderNumber = `${garment.order.originalOrderNumber}-${newPartner.partnerCode}`;

      // Create/Find new PartnerSubOrder
      const newSubOrder = await prisma.partnerSubOrder.upsert({
        where: { subOrderNumber: newSubOrderNumber },
        create: {
          subOrderNumber: newSubOrderNumber,
          orderId: garment.orderId,
          partnerId: params.newPartnerId,
          totalGarments: 1,
          status: SubOrderStatus.ASSIGNED,
        },
        update: {
          totalGarments: { increment: 1 },
        },
      });

      // Update old sub-order garment count
      if (garment.partnerSubOrderId) {
        await prisma.partnerSubOrder.update({
          where: { id: garment.partnerSubOrderId },
          data: { totalGarments: { decrement: 1 } },
        });
      }

      // Reassign Garment: Partner A gets ₹0 because service was incomplete.
      await prisma.garment.update({
        where: { id: garment.id },
        data: {
          partnerId: params.newPartnerId,
          partnerSubOrderId: newSubOrder.id,
          status: GarmentStatus.ASSIGNED,
          instruction: params.newInstruction || garment.instruction,
          appliedPrice: null, // Reset price, will snapshot new partner's price on QC pass
        },
      });

      // Update CriticalCase
      await prisma.criticalCase.update({
        where: { id: params.criticalCaseId },
        data: {
          status: CriticalStatus.RESOLVED,
          adminResolution: AdminCriticalResolution.REASSIGN,
          newPartnerId: params.newPartnerId,
          newInstruction: params.newInstruction || null,
          resolvedByUserId: params.actorUserId,
          resolvedAt: new Date(),
        },
      });

      await AuditService.logAudit({
        actorUserId: params.actorUserId,
        action: 'CRITICAL_REASSIGNED',
        entityName: 'Garment',
        entityId: garment.id,
        beforeJson: { partnerId: criticalCase.partnerId },
        afterJson: { partnerId: params.newPartnerId },
      });
    } else {
      // Option B — RETAIN WITH SAME PARTNER
      await prisma.garment.update({
        where: { id: garment.id },
        data: {
          status: GarmentStatus.ACCEPTED,
          instruction: params.newInstruction
            ? `${garment.instruction || ''}\nAdmin Instruction: ${params.newInstruction}`
            : garment.instruction,
        },
      });

      await prisma.criticalCase.update({
        where: { id: params.criticalCaseId },
        data: {
          status: CriticalStatus.RESOLVED,
          adminResolution: AdminCriticalResolution.RETAIN,
          newInstruction: params.newInstruction || null,
          resolvedByUserId: params.actorUserId,
          resolvedAt: new Date(),
        },
      });

      await AuditService.logAudit({
        actorUserId: params.actorUserId,
        action: 'CRITICAL_RETAINED',
        entityName: 'Garment',
        entityId: garment.id,
        reason: params.newInstruction,
      });
    }

    return prisma.criticalCase.findUnique({
      where: { id: params.criticalCaseId },
    });
  }
}
