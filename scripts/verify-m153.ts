import 'dotenv/config';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/core/db';
import { subscription, credit } from '@/config/db/schema';
import { CreditTransactionType } from '@/shared/models/credit';

async function main() {
  const database = db();
  const subscriptionNo = '81053737789926972';
  
  console.log('=== 验证修复 ===\n');
  
  // 查订阅状态
  const subs = await database.select().from(subscription).where(eq(subscription.subscriptionNo, subscriptionNo));
  console.log('订阅状态:', subs[0]?.status);
  
  // 查积分
  const grants = await database.select().from(credit).where(
    and(eq(credit.subscriptionNo, subscriptionNo), eq(credit.transactionType, CreditTransactionType.GRANT))
  ).orderBy(desc(credit.createdAt));
  
  console.log('\n积分记录:', grants.length, '条');
  for (const g of grants) {
    console.log(' +' + g.credits, g.description);
  }
}

main().catch(console.error);
