import { prisma } from '../db/prisma';
import { CustomerCategory, OrderStatus, GarmentStatus, SubOrderStatus } from '@prisma/client';
import { PartnerService } from './partner.service';
import { AuditService } from './audit.service';

export interface AmazeFabOrderIngestPayload {
  externalOrderId: string;
  originalOrderNumber: string;
  customerName: string;
  customerPhone: string;
  customerCategory: CustomerCategory;
  garments: Array<{
    amazeFabGarmentId: string;
    garmentCode: string;
    qrCode: string;
    serviceId: string;
    instruction?: string;
  }>;
}

export class OrderService {
  /**
   * Ingest order from AmazeFab API with Idempotency & Duplicate Prevention (Section 9)
   */
  static async ingestAmazeFabOrder(payload: AmazeFabOrderIngestPayload) {
    const existingOrder = await prisma.order.findUnique({
      where: {
        sourceSystem_externalOrderId: {
          sourceSystem: 'AMAZEFAB',
          externalOrderId: payload.externalOrderId,
        },
      },
      include: { garments: true },
    });

    if (existingOrder) {
      // Return existing order without creating duplicates
      return { order: existingOrder, created: false };
    }

    const order = await prisma.order.create({
      data: {
        externalOrderId: payload.externalOrderId,
        originalOrderNumber: payload.originalOrderNumber,
        sourceSystem: 'AMAZEFAB',
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        customerCategory: payload.customerCategory,
        status: OrderStatus.PENDING_SORTING,
        totalGarments: payload.garments.length,
        garments: {
          create: payload.garments.map((g) => ({
            amazeFabGarmentId: g.amazeFabGarmentId,
            garmentCode: g.garmentCode,
            qrCode: g.qrCode,
            serviceId: g.serviceId,
            instruction: g.instruction || null,
            status: GarmentStatus.RECEIVED,
          })),
        },
      },
      include: { garments: true },
    });

    await AuditService.logAudit({
      actorUserId: 'SYSTEM_API',
      action: 'ORDER_INGESTED',
      entityName: 'Order',
      entityId: order.id,
      afterJson: { externalOrderId: payload.externalOrderId, totalGarments: order.totalGarments },
    });

    return { order, created: true };
  }

  /**
   * Section 15 Sorting & Section 16 Review Popup & Section 17 Partner Assignment Validation
   */
  static async sortGarments(params: {
    orderId: string;
    assignments: Array<{
      garmentId: string;
      partnerId: string;
      instruction?: string;
      photoUrl?: string;
    }>;
    actorUserId: string;
  }) {
    const order = await prisma.order.findUnique({
      where: { id: params.orderId },
      include: { garments: true },
    });

    if (!order) {
      throw new Error(`Order not found: ${params.orderId}`);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new Error(`Cannot sort cancelled order`);
    }

    // Map of partnerId -> garment list
    const partnerGarmentMap = new Map<string, typeof params.assignments>();

    for (const assignment of params.assignments) {
      const garment = order.garments.find((g) => g.id === assignment.garmentId);
      if (!garment) {
        throw new Error(`Garment ${assignment.garmentId} does not belong to Order ${order.id}`);
      }

      // Validate partner assignment
      const val = await PartnerService.validatePartnerAssignment({
        partnerId: assignment.partnerId,
        customerCategory: order.customerCategory,
        serviceId: garment.serviceId,
      });

      if (!val.valid) {
        throw new Error(`Assignment validation failed for Garment ${garment.garmentCode}: ${val.reason}`);
      }

      const list = partnerGarmentMap.get(assignment.partnerId) || [];
      list.push(assignment);
      partnerGarmentMap.set(assignment.partnerId, list);
    }

    // Process assignments partner by partner
    for (const [partnerId, assignments] of partnerGarmentMap.entries()) {
      const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
      if (!partner) continue;

      const subOrderNumber = `${order.originalOrderNumber}-${partner.partnerCode}`;

      // Upsert PartnerSubOrder
      const subOrder = await prisma.partnerSubOrder.upsert({
        where: { subOrderNumber },
        create: {
          subOrderNumber,
          orderId: order.id,
          partnerId,
          totalGarments: assignments.length,
          status: SubOrderStatus.ASSIGNED,
        },
        update: {
          totalGarments: { increment: assignments.length },
        },
      });

      // Update Garments
      for (const assign of assignments) {
        await prisma.garment.update({
          where: { id: assign.garmentId },
          data: {
            partnerId,
            partnerSubOrderId: subOrder.id,
            status: GarmentStatus.ASSIGNED,
            instruction: assign.instruction || undefined,
            photoUrl: assign.photoUrl || undefined,
          },
        });
      }
    }

    // Update parent order status
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.SORTED },
    });

    await AuditService.logAudit({
      actorUserId: params.actorUserId,
      action: 'ORDER_SORTED',
      entityName: 'Order',
      entityId: order.id,
      afterJson: { totalAssigned: params.assignments.length },
    });

    return this.getOrderProgress(order.id);
  }

  /**
   * Section 23 Parent Order Progress Aggregation
   */
  static async getOrderProgress(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        garments: {
          include: { partner: true, service: true },
        },
        subOrders: {
          include: { partner: true },
        },
      },
    });

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const totalGarments = order.garments.length;
    const completedGarments = order.garments.filter(
      (g) => g.status === GarmentStatus.QC_PASSED || g.status === GarmentStatus.READY_FOR_DELIVERY
    ).length;

    const progressPercentage = totalGarments > 0 ? Math.round((completedGarments / totalGarments) * 100) : 0;

    const partnerProgress = order.subOrders.map((so) => {
      const subOrderGarments = order.garments.filter((g) => g.partnerSubOrderId === so.id);
      const subTotal = subOrderGarments.length;
      const subCompleted = subOrderGarments.filter(
        (g) => g.status === GarmentStatus.QC_PASSED || g.status === GarmentStatus.READY_FOR_DELIVERY
      ).length;
      return {
        subOrderNumber: so.subOrderNumber,
        partnerCode: so.partner.partnerCode,
        companyName: so.partner.companyName,
        total: subTotal,
        completed: subCompleted,
        percentage: subTotal > 0 ? Math.round((subCompleted / subTotal) * 100) : 0,
        status: so.status,
      };
    });

    return {
      orderId: order.id,
      originalOrderNumber: order.originalOrderNumber,
      externalOrderId: order.externalOrderId,
      customerName: order.customerName,
      customerCategory: order.customerCategory,
      status: order.status,
      totalGarments,
      completedGarments,
      progressPercentage,
      partnerProgress,
      garments: order.garments,
    };
  }

  /**
   * Section 12 Operational Order Cancellation
   */
  static async cancelOrder(orderId: string, cancelledReason: string, actorUserId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledReason,
        cancelledBy: actorUserId,
        cancelledAt: new Date(),
      },
    });

    await AuditService.logAudit({
      actorUserId,
      action: 'ORDER_CANCELLED',
      entityName: 'Order',
      entityId: orderId,
      beforeJson: { status: order.status },
      afterJson: { status: OrderStatus.CANCELLED, cancelledReason },
      reason: cancelledReason,
    });

    return updated;
  }
}
