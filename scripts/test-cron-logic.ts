import 'dotenv/config';
import { and, eq, desc, gte } from 'drizzle-orm';
import { db } from '@/core/db';
import { credit, subscription } from '@/config/db/schema';
import { CreditTransactionType } from '@/shared/models/credit';

async function main() {
  const database = db();
  const userId = '8c7b6d34-b9a7-422b-b15b-195f00bec8cb';
  const subscriptionNo = '81053732684006987';
  const subStartDate = new Date('2026-04-09');
  const now = new Date();
  
  console.log('=== 模拟 Cron 逻辑 ===\n');
  
  // Cron 查询条件（第 150-165 行）
  console.log('1. Cron 查询历史发放记录：');
  console.log('   subscriptionNo:', subscriptionNo);
  console.log('   subStartDate:', subStartDate);
  
  const latestCredits = await database
    .select({
      metadata: credit.metadata,
      description: credit.description,
    })
    .from(credit)
    .where(
      and(
        eq(credit.subscriptionNo, subscriptionNo),  // 这里是 BUG 点！
        eq(credit.transactionType, CreditTransactionType.GRANT),
        gte(credit.createdAt, subStartDate)
      )
    )
    .orderBy(desc(credit.createdAt))
    .limit(1);
  
  console.log('\n   查询结果:', latestCredits.length, '条');
  console.log('   (0 条 = 未发放过，应该发放)\n');
  
  // 尝试用 userId 查询
  console.log('2. 改用 userId 查询：');
  const userCredits = await database
    .select({
      metadata: credit.metadata,
      description: credit.description,
    })
    .from(credit)
    .where(
      and(
        eq(credit.userId, userId),
        eq(credit.transactionType, CreditTransactionType.GRANT)
      )
    )
    .orderBy(desc(credit.createdAt))
    .limit(5);
  
  console.log('   查询结果:', userCredits.length, '条');
  for (const c of userCredits) {
    console.log('   -', c.description);
  }
  
  // 计算当前应该发第几个月
  console.log('\n3. 计算应发放月份：');
  let monthsPassed = 0;
  let nextDate = new Date(subStartDate);
  while (nextDate <= now) {
    const temp = new Date(nextDate);
    temp.setMonth(temp.getMonth() + 1);
    if (temp <= now) {
      monthsPassed++;
      nextDate = temp;
    } else break;
  }
  console.log('   订阅开始:', subStartDate);
  console.log('   当前时间:', now);
  console.log('   已过月数:', monthsPassed);
  console.log('   应发放月份: 第', monthsPassed + 1, '月');
}

main().catch(console.error);
