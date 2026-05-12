import 'dotenv/config';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/core/db';
import { credit } from '@/config/db/schema';
import { CreditTransactionType } from '@/shared/models/credit';

async function main() {
  const userId = '8c7b6d34-b9a7-422b-b15b-195f00bec8cb';
  const subscriptionNo = '81053732684006987';
  
  console.log('=== 验证积分发放 ===\n');
  
  // 查所有 GRANT 记录
  const grants = await db()
    .select()
    .from(credit)
    .where(
      and(
        eq(credit.userId, userId),
        eq(credit.transactionType, CreditTransactionType.GRANT)
      )
    )
    .orderBy(desc(credit.createdAt));
  
  console.log('用户所有 GRANT 记录:', grants.length, '条\n');
  for (const g of grants) {
    console.log('时间:', g.createdAt);
    console.log('积分:', g.credits);
    console.log('描述:', g.description);
    console.log('subscriptionNo:', g.subscriptionNo);
    console.log('过期:', g.expiresAt);
    console.log('---');
  }
}

main().catch(console.error);
