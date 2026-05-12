import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { db } from '@/core/db';
import { subscription, credit } from '@/config/db/schema';
import { CreditTransactionType } from '@/shared/models/credit';

(async () => {
  const r = await db().select().from(subscription).where(and(eq(subscription.userId, '4457cd5e-5629-4f79-b094-ada6862f9f7a'), eq(subscription.interval, 'year')));
  console.log('状态:', r[0]?.status);
  const c = await db().select().from(credit).where(and(eq(credit.userId, '4457cd5e-5629-4f79-b094-ada6862f9f7a'), eq(credit.transactionType, 'grant')));
  console.log('积分:', c.length, c.map(x => x.credits + '+' + x.description?.slice(0,30)));
})();
