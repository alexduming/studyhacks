import { desc, count } from 'drizzle-orm';

import { db } from '@/core/db';
import { redemptionCode } from '@/config/db/schema';

export type RedemptionCode = typeof redemptionCode.$inferSelect;

export async function getRedemptionCodes({
  page = 1,
  limit = 20,
}: {
  page?: number;
  limit?: number;
} = {}) {
  const result = await db()
    .select()
    .from(redemptionCode)
    .orderBy(desc(redemptionCode.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return result;
}

export async function getRedemptionCodesCount() {
  const [result] = await db()
    .select({ count: count() })
    .from(redemptionCode);
    
  return result?.count || 0;
}

