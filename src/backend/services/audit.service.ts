import { prisma } from '../db/prisma';

export class AuditService {
  static async logAudit(params: {
    actorUserId: string;
    action: string;
    entityName: string;
    entityId: string;
    beforeJson?: any;
    afterJson?: any;
    reason?: string;
  }) {
    return prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: params.action,
        entityName: params.entityName,
        entityId: params.entityId,
        beforeJson: params.beforeJson ? JSON.stringify(params.beforeJson) : null,
        afterJson: params.afterJson ? JSON.stringify(params.afterJson) : null,
        reason: params.reason || null,
      },
    });
  }
}
