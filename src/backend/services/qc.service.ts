import { prisma } from '../db/prisma';
import { GarmentStatus, QCResult } from '@prisma/client';
import { WalletService } from './wallet.service';
import { AuditService } from './audit.service';

export class QCService {
  /**
   * Section 34 QC Process & Section 36 QC Wallet Rule
   */
  static async performQC(params: {
    garmentId: string;
    reviewerUserId: string;
    result: QCResult;
    reason?: string;
    instruction?: string;
    photoUrl?: string;
  }) {
    const garment = await prisma.garment.findUnique({
      where: { id: params.garmentId },
      include: { partnerSubOrder: true },
    });

    if (!garment) {
      throw new Error(`Garment not found: ${params.garmentId}`);
    }

    if (!garment.partnerId) {
      throw new Error(`Garment ${params.garmentId} has no assigned partner`);
    }

    // Record QC decision
    const qcRecord = await prisma.qcRecord.create({
      data: {
        garmentId: params.garmentId,
        partnerId: garment.partnerId,
        reviewerUserId: params.reviewerUserId,
        result: params.result,
        reason: params.reason || null,
        instruction: params.instruction || null,
        photoUrl: params.photoUrl || null,
        reworkRequired: params.result === QCResult.FAIL,
      },
    });

    if (params.result === QCResult.PASS) {
      // Move garment to READY_FOR_DELIVERY
      await prisma.garment.update({
        where: { id: params.garmentId },
        data: { status: GarmentStatus.READY_FOR_DELIVERY },
      });

      // Update SubOrder completed count if needed
      if (garment.partnerSubOrderId) {
        await prisma.partnerSubOrder.update({
          where: { id: garment.partnerSubOrderId },
          data: { completedCount: { increment: 1 } },
        });
      }

      // Credit Partner Wallet (Rule 36: Only after QC Passed)
      await WalletService.creditWalletForQC(params.garmentId);

      await AuditService.logAudit({
        actorUserId: params.reviewerUserId,
        action: 'QC_PASSED',
        entityName: 'Garment',
        entityId: params.garmentId,
        afterJson: { status: GarmentStatus.READY_FOR_DELIVERY },
      });
    } else {
      // QC Failed -> REWORK loop
      await prisma.garment.update({
        where: { id: params.garmentId },
        data: {
          status: GarmentStatus.REWORK,
          instruction: params.instruction
            ? `${garment.instruction || ''}\nQC Rework Note: ${params.instruction}`
            : garment.instruction,
        },
      });

      await AuditService.logAudit({
        actorUserId: params.reviewerUserId,
        action: 'QC_FAILED',
        entityName: 'Garment',
        entityId: params.garmentId,
        reason: params.reason,
        afterJson: { status: GarmentStatus.REWORK },
      });
    }

    return {
      qcRecord,
      updatedGarment: await prisma.garment.findUnique({ where: { id: params.garmentId } }),
    };
  }
}
