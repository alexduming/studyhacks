import 'dotenv/config';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/core/db';
import { credit } from '@/config/db/schema';
import { CreditTransactionType } from '@/shared/models/credit';

async function main() {
  const database = db();
  const userId = '8c7b6d34-b9a7-422b-b15b-195f00bec8cb';
  const subscriptionNo = '81053732684006987';
  
  // 查所有 GRANT 记录
  const grants = await database
    .select()
    .from(credit)
    .where(
      and(
        eq(credit.userId, userId),
        eq(credit.transactionType, CreditTransactionType.GRANT)
      )
    )
    .orderBy(desc(credit.createdAt));
  
  console.log('=== 所有 GRANT 记录 ===');
  for (const g of grants) {
    console.log('\nID:', g.id);
    console.log('描述:', g.description);
    console.log('时间:', g.createdAt);
    console.log('积分:', g.credits);
    console.log('metadata:', g.metadata);
    console.log('subscriptionNo:', g.subscriptionNo);
  }
}

main().catch(console.error);
