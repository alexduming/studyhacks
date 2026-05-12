import 'dotenv/config';
import { and, eq, gte, desc, like } from 'drizzle-orm';
import { db } from '@/core/db';
import { user, subscription, credit } from '@/config/db/schema';
import { CreditTransactionType } from '@/shared/models/credit';

async function main() {
  const database = db();
  const targetEmail = 'm15316000028@163.com';
  
  console.log('=== 查询:', targetEmail, '===\n');
  
  // 用 LIKE 查询可能匹配的用户
  const users = await database
    .select()
    .from(user)
    .where(like(user.email, '%15316000028%'));
  
  console.log('模糊匹配用户:', users.length);
  for (const u of users) {
    console.log(' -', u.email, u.id);
  }
  
  if (users.length === 0) {
    console.log('\n❌ 用户不存在，尝试完整匹配');
    const exactUser = await database.select().from(user).where(eq(user.email, targetEmail));
    console.log('精确匹配:', exactUser.length);
    return;
  }
  
  const u = users[0];
  
  // 查订阅
  const subs = await database.select().from(subscription).where(eq(subscription.userId, u.id));
  console.log('\n订阅:', subs.length);
  for (const s of subs) {
    console.log(' -', s.subscriptionNo, s.productId, s.status, s.interval);
    console.log('   period:', s.currentPeriodStart, '~', s.currentPeriodEnd);
  }
  
  if (!subs[0]) return;
  
  // 查积分
  const grants = await database.select().from(credit).where(
    and(eq(credit.userId, u.id), eq(credit.transactionType, CreditTransactionType.GRANT))
  ).orderBy(desc(credit.createdAt));
  
  console.log('\n积分:', grants.length, '条');
  for (const g of grants) {
    console.log(' -', g.credits, g.description);
    console.log('   createdAt:', g.createdAt);
    console.log('   metadata:', g.metadata);
  }
}

main().catch(console.error);
