import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { db } from '@/core/db';
import { subscription, credit } from '@/config/db/schema';
import { CreditTransactionType } from '@/shared/models/credit';

(async () => {
  console.log('=== 验证 m15316000028@163.com ===\n');
  
  // 查订阅状态
  const subs = await db().select().from(subscription).where(eq(subscription.subscriptionNo, '81053737789926972'));
  console.log('订阅状态:', subs[0]?.status);
  console.log('周期:', subs[0]?.currentPeriodStart, '~', subs[0]?.currentPeriodEnd);
  
  // 查积分
  const grants = await db().select().from(credit).where(
    and(eq(credit.userId, '4457cd5e-5629-4f79-b094-ada6862f9f7a'), eq(credit.transactionType, CreditTransactionType.GRANT))
  );
  console.log('\n积分记录:', grants.length, '条');
  for (const g of grants) {
    console.log(' +' + g.credits, g.description?.slice(0,50));
  }
})();
