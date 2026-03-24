import { and, desc, eq, sql, sum } from 'drizzle-orm';

import { db } from '@/core/db';
import { withdrawal } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';

export type Withdrawal = typeof withdrawal.$inferSelect;
export type NewWithdrawal = typeof withdrawal.$inferInsert;

export enum WithdrawalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PAID = 'paid',
}

// Create withdrawal request
export async function createWithdrawal(data: NewWithdrawal) {
  const [record] = await db().insert(withdrawal).values(data).returning();
  return record;
}

// Get user withdrawals
export async function getUserWithdrawals(
  userId: string,
  options?: {
    page?: number;
    limit?: number;
    status?: string;
  }
) {
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [eq(withdrawal.userId, userId)];
  if (options?.status) {
    conditions.push(eq(withdrawal.status, options.status));
  }

  const records = await db()
    .select()
    .from(withdrawal)
    .where(and(...conditions))
    .orderBy(desc(withdrawal.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(withdrawal)
    .where(and(...conditions));

  return {
    records,
    total: Number(total?.count || 0),
    page,
    limit,
    totalPages: Math.ceil(Number(total?.count || 0) / limit),
  };
}

// Get user withdrawal stats
export async function getUserWithdrawalStats(userId: string) {
  const [totalWithdrawn] = await db()
    .select({ amount: sum(withdrawal.amount) })
    .from(withdrawal)
    .where(
      and(
        eq(withdrawal.userId, userId),
        eq(withdrawal.status, WithdrawalStatus.PAID)
      )
    );

  const [pendingWithdrawal] = await db()
    .select({ amount: sum(withdrawal.amount) })
    .from(withdrawal)
    .where(
      and(
        eq(withdrawal.userId, userId),
        eq(withdrawal.status, WithdrawalStatus.PENDING)
      )
    );

  return {
    totalWithdrawn: Number(totalWithdrawn?.amount || 0),
    pendingWithdrawal: Number(pendingWithdrawal?.amount || 0),
  };
}






