import { prisma } from '../db/prisma';
import { GarmentStatus, SubOrderStatus } from '@prisma/client';
import { AuditService } from './audit.service';
import { ExceptionService } from './exception.service';

export class GarmentService {
  /**
   * Section 24 Partner Acceptance
   */
  static async acceptPartnerSubOrder(subOrderId: string, partnerId: string, actorUserId: string) {
    const subOrder = await prisma.partnerSubOrder.findUnique({
      where: { id: subOrderId },
      include: { garments: true },
    });

    if (!subOrder) {
      throw new Error(`Partner sub-order not found: ${subOrderId}`);
    }

    if (subOrder.partnerId !== partnerId) {
      throw new Error(`Unauthorized partner access to sub-order ${subOrderId}`);
    }

    // Update SubOrder status
    await prisma.partnerSubOrder.update({
      where: { id: subOrderId },
      data: { status: SubOrderStatus.ACCEPTED },
    });

    // Update assigned garments to ACCEPTED -> IN_PROCESSING
    await prisma.garment.updateMany({
      where: {
        partnerSubOrderId: subOrderId,
        status: GarmentStatus.ASSIGNED,
      },
      data: {
        status: GarmentStatus.ACCEPTED,
      },
    });

    await AuditService.logAudit({
      actorUserId,
      action: 'SUBORDER_ACCEPTED',
      entityName: 'PartnerSubOrder',
      entityId: subOrderId,
      afterJson: { partnerId, subOrderNumber: subOrder.subOrderNumber },
    });

    return prisma.partnerSubOrder.findUnique({
      where: { id: subOrderId },
      include: { garments: true },
    });
  }

  /**
   * Section 25 QR Scanning & Receiving Verification
   */
  static async scanAndReceiveGarment(params: {
    qrCode: string;
    partnerId: string;
    scannedByUserId: string;
    expectedSubOrderId?: string;
  }) {
    const garment = await prisma.garment.findUnique({
      where: { qrCode: params.qrCode },
      include: { partnerSubOrder: true, order: true },
    });

    if (!garment) {
      // Exception: Unknown QR
      await ExceptionService.createException({
        type: 'UNKNOWN_QR',
        description: `QR code ${params.qrCode} scanned by Partner ${params.partnerId} not found in database`,
        partnerId: params.partnerId,
        createdByUserId: params.scannedByUserId,
      });

      return {
        success: false,
        status: 'UNKNOWN_QR',
        message: `Unknown QR code: ${params.qrCode}`,
      };
    }

    // Check if garment belongs to another partner (Section 28)
    if (garment.partnerId && garment.partnerId !== params.partnerId) {
      await ExceptionService.createException({
        type: 'WRONG_PARTNER',
        orderId: garment.orderId,
        garmentId: garment.id,
        partnerId: params.partnerId,
        description: `Garment ${garment.garmentCode} belongs to Partner ${garment.partnerId}, but scanned by ${params.partnerId}`,
        createdByUserId: params.scannedByUserId,
      });

      return {
        success: false,
        status: 'WRONG_PARTNER',
        message: `Garment belongs to a different partner!`,
        garment,
      };
    }

    // Log valid scan record
    await prisma.garmentScan.create({
      data: {
        garmentId: garment.id,
        scannedByUserId: params.scannedByUserId,
        partnerId: params.partnerId,
        scanType: 'RECEIVING',
        status: 'VALID',
      },
    });

    // Move garment status to IN_PROCESSING if accepted/assigned
    if (garment.status === GarmentStatus.ACCEPTED || garment.status === GarmentStatus.ASSIGNED) {
      await prisma.garment.update({
        where: { id: garment.id },
        data: { status: GarmentStatus.IN_PROCESSING },
      });

      if (garment.partnerSubOrderId) {
        await prisma.partnerSubOrder.update({
          where: { id: garment.partnerSubOrderId },
          data: { status: SubOrderStatus.IN_PROCESSING },
        });
      }
    }

    return {
      success: true,
      status: 'VALID',
      message: `Garment ${garment.garmentCode} received and marked IN_PROCESSING`,
      garment: await prisma.garment.findUnique({ where: { id: garment.id } }),
    };
  }

  /**
   * Section 32 Service Completion
   */
  static async completeService(params: {
    garmentId: string;
    partnerId: string;
    photoUrl?: string;
    comment?: string;
    actorUserId: string;
  }) {
    const garment = await prisma.garment.findUnique({
      where: { id: params.garmentId },
    });

    if (!garment) {
      throw new Error(`Garment not found: ${params.garmentId}`);
    }

    if (garment.partnerId !== params.partnerId) {
      throw new Error(`Partner ${params.partnerId} is not assigned to Garment ${params.garmentId}`);
    }

    if (garment.status !== GarmentStatus.IN_PROCESSING && garment.status !== GarmentStatus.REWORK) {
      throw new Error(`Garment is not in IN_PROCESSING or REWORK state (current: ${garment.status})`);
    }

    // Move to SERVICE_COMPLETED -> SENT_FOR_QC -> QC_PENDING
    const updated = await prisma.garment.update({
      where: { id: params.garmentId },
      data: {
        status: GarmentStatus.QC_PENDING,
        photoUrl: params.photoUrl || garment.photoUrl,
        instruction: params.comment ? `${garment.instruction || ''}\nCompletion Note: ${params.comment}` : garment.instruction,
      },
    });

    await AuditService.logAudit({
      actorUserId: params.actorUserId,
      action: 'SERVICE_COMPLETED',
      entityName: 'Garment',
      entityId: params.garmentId,
      beforeJson: { status: garment.status },
      afterJson: { status: GarmentStatus.QC_PENDING },
    });

    return updated;
  }
}
