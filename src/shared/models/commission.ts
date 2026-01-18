import { and, desc, eq, sql, sum } from 'drizzle-orm';

import { db } from '@/core/db';
import { commission, user } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';

export type Commission = typeof commission.$inferSelect;
export type NewCommission = typeof commission.$inferInsert;

export enum CommissionStatus {
  PENDING = 'pending',
  PAID = 'paid', // Available for withdrawal
  CANCELLED = 'cancelled',
}

// Create commission record
export async function createCommission(data: NewCommission) {
  const [record] = await db().insert(commission).values(data).returning();
  return record;
}

// Get user commissions
export async function getUserCommissions(
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

  const conditions = [eq(commission.userId, userId)];
  if (options?.status) {
    conditions.push(eq(commission.status, options.status));
  }

  const records = await db()
    .select()
    .from(commission)
    .where(and(...conditions))
    .orderBy(desc(commission.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(commission)
    .where(and(...conditions));

  return {
    records,
    total: Number(total?.count || 0),
    page,
    limit,
    totalPages: Math.ceil(Number(total?.count || 0) / limit),
  };
}

// Get user commission stats
export async function getUserCommissionStats(userId: string) {
  const [totalAmount] = await db()
    .select({ amount: sum(commission.amount) })
    .from(commission)
    .where(eq(commission.userId, userId));

  const [pendingAmount] = await db()
    .select({ amount: sum(commission.amount) })
    .from(commission)
    .where(
      and(
        eq(commission.userId, userId),
        eq(commission.status, CommissionStatus.PENDING)
      )
    );

  const [paidAmount] = await db()
    .select({ amount: sum(commission.amount) })
    .from(commission)
    .where(
      and(
        eq(commission.userId, userId),
        eq(commission.status, CommissionStatus.PAID)
      )
    );

  return {
    totalAmount: Number(totalAmount?.amount || 0),
    pendingAmount: Number(pendingAmount?.amount || 0),
    paidAmount: Number(paidAmount?.amount || 0),
  };
}


