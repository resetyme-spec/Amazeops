import { prisma } from '../db/prisma';
import { ExceptionPriority, ExceptionStatus } from '@prisma/client';

export class ExceptionService {
  static async createException(params: {
    type: string;
    priority?: ExceptionPriority;
    orderId?: string;
    garmentId?: string;
    partnerId?: string;
    description: string;
    createdByUserId: string;
  }) {
    return prisma.exception.create({
      data: {
        type: params.type,
        priority: params.priority || ExceptionPriority.MEDIUM,
        orderId: params.orderId,
        garmentId: params.garmentId,
        partnerId: params.partnerId,
        description: params.description,
        status: ExceptionStatus.OPEN,
        createdByUserId: params.createdByUserId,
      },
    });
  }

  static async resolveException(exceptionId: string, resolution: string, resolvedByUserId: string) {
    return prisma.exception.update({
      where: { id: exceptionId },
      data: {
        status: ExceptionStatus.RESOLVED,
        resolution,
        resolvedByUserId,
        resolvedAt: new Date(),
      },
    });
  }
}
