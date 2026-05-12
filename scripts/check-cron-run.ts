import 'dotenv/config';
import { and, eq, desc, gte } from 'drizzle-orm';
import { db } from '@/core/db';
import { credit } from '@/config/db/schema';
import { CreditTransactionType } from '@/shared/models/credit';

async function main() {
  const database = db();
  const subscriptionNo = '81053732684006987';
  const subStartDate = new Date('2026-04-09');
  
  // 查这个 subscriptionNo 所有的 GRANT
  const grants = await database
    .select()
    .from(credit)
    .where(
      and(
        eq(credit.subscriptionNo, subscriptionNo),
        eq(credit.transactionType, CreditTransactionType.GRANT)
      )
    )
    .orderBy(desc(credit.createdAt));
  
  console.log('=== subscriptionNo=', subscriptionNo, '的 GRANT 记录 ===');
  console.log('共', grants.length, '条\n');
  for (const g of grants) {
    console.log('- 时间:', g.createdAt);
    console.log('  积分:', g.credits);
    console.log('  描述:', g.description);
    console.log('  metadata:', g.metadata);
    console.log('');
  }
  
  // 分析
  console.log('=== 分析 ===');
  if (grants.length === 0) {
    console.log('❌ 0条 - cron 从未执行或手动开通没走 cron');
  } else if (grants.length === 1) {
    const m = grants[0].metadata ? JSON.parse(grants[0].metadata) : {};
    console.log('❌ 只有1条 - 第1月发放后，第2月未发放');
    console.log('   第1月:', m.monthNumber);
    console.log('   应发第2月但没发 → cron BUG');
  } else {
    console.log('✅ 已发放', grants.length, '个月');
  }
}

main().catch(console.error);
