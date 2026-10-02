import { eq } from 'drizzle-orm';

import type { db } from '@/core/db';
import { commission, order } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';

type PaymentTransaction = Parameters<
  Parameters<ReturnType<typeof db>['transaction']>[0]
>[0];

// The browser callback and webhook must share the same database lock.
export async function lockPaymentOrder(
  tx: PaymentTransaction,
  orderNo: string
) {
  const [current] = await tx
    .select()
    .from(order)
    .where(eq(order.orderNo, orderNo))
    .for('update');
  if (!current) throw new Error('order not found');
  return current;
}

// Called inside the transaction that marks the locked order paid.
export async function insertPaymentCommission(
  tx: PaymentTransaction,
  paidOrder: Pick<
    typeof order.$inferSelect,
    'id' | 'orderNo' | 'amount' | 'currency'
  > & { referrerId?: string | null },
  type: 'one_time' | 'recurring' | 'renewal' = 'one_time'
) {
  if (!paidOrder.referrerId) return;
  const amount = Math.floor(paidOrder.amount * 0.2);
  if (amount <= 0) return;
  const [existing] = await tx
    .select({ id: commission.id })
    .from(commission)
    .where(eq(commission.orderId, paidOrder.id));
  if (existing) return;
  await tx.insert(commission).values({
    id: getUuid(),
    userId: paidOrder.referrerId,
    orderId: paidOrder.id,
    amount,
    currency: paidOrder.currency,
    status: 'paid',
    type,
    rate: '20%',
    description: `Commission for order ${paidOrder.orderNo}`,
  });
}
