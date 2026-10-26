import { prisma } from '../db/prisma';
import { TransactionType, WalletStatus } from '@prisma/client';
import { PartnerService } from './partner.service';
import { AuditService } from './audit.service';

export class WalletService {
  /**
   * Section 36 QC Wallet Rule & Section 50 Wallet Transaction Snapshot
   */
  static async creditWalletForQC(garmentId: string) {
    const garment = await prisma.garment.findUnique({
      where: { id: garmentId },
      include: { order: true, partner: true },
    });

    if (!garment) {
      throw new Error(`Garment not found: ${garmentId}`);
    }

    if (!garment.partnerId) {
      throw new Error(`Garment ${garmentId} has no assigned partner`);
    }

    // Check if wallet is already credited for this garment execution (Prevent duplicate credits)
    if (garment.walletCredited) {
      const existingTx = await prisma.walletTransaction.findFirst({
        where: { garmentId, partnerId: garment.partnerId, type: TransactionType.EARNING },
      });
      return existingTx;
    }

    // Resolve snapshot price at this moment
    const appliedPrice = await PartnerService.getEffectivePrice(garment.partnerId, garment.serviceId);
    if (appliedPrice === null) {
      throw new Error(`No effective price found for partner ${garment.partnerId} and service ${garment.serviceId}`);
    }

    // Create Wallet Transaction
    const transaction = await prisma.walletTransaction.create({
      data: {
        partnerId: garment.partnerId,
        garmentId: garment.id,
        orderId: garment.orderId,
        subOrderId: garment.partnerSubOrderId,
        serviceId: garment.serviceId,
        appliedPrice,
        taxAmount: 0,
        type: TransactionType.EARNING,
        status: WalletStatus.AVAILABLE,
      },
    });

    // Mark garment as walletCredited with snapshot price
    await prisma.garment.update({
      where: { id: garmentId },
      data: {
        walletCredited: true,
        appliedPrice,
      },
    });

    await AuditService.logAudit({
      actorUserId: 'SYSTEM_QC',
      action: 'WALLET_CREDITED',
      entityName: 'WalletTransaction',
      entityId: transaction.id,
      afterJson: { partnerId: garment.partnerId, garmentId, appliedPrice },
    });

    return transaction;
  }

  /**
   * Section 47 Wallet States & Balances
   */
  static async getPartnerWalletSummary(partnerId: string) {
    const transactions = await prisma.walletTransaction.findMany({
      where: { partnerId },
    });

    let availableUnbilled = 0;
    let pendingInvoiced = 0;
    let paidAmount = 0;

    for (const tx of transactions) {
      if (tx.status === WalletStatus.AVAILABLE) {
        if (tx.type === TransactionType.EARNING || tx.type === TransactionType.ADJUSTMENT_CREDIT) {
          availableUnbilled += tx.appliedPrice;
        } else if (tx.type === TransactionType.ADJUSTMENT_DEBIT) {
          availableUnbilled -= tx.appliedPrice;
        }
      } else if (tx.status === WalletStatus.INVOICED) {
        pendingInvoiced += tx.appliedPrice;
      } else if (tx.status === WalletStatus.PAID) {
        paidAmount += tx.appliedPrice;
      }
    }

    return {
      partnerId,
      availableUnbilled,
      pendingInvoiced,
      paidAmount,
      totalEarned: availableUnbilled + pendingInvoiced + paidAmount,
      transactions,
    };
  }
}
