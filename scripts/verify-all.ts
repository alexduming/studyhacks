import 'dotenv/config';
import { and, eq, gte, desc } from 'drizzle-orm';
import { db } from '@/core/db';
import { subscription, credit } from '@/config/db/schema';
import { CreditTransactionType as CT } from '@/shared/models/credit';

async function main() {
  const database = db();
  const now = new Date();
  
  const subs = await database.select().from(subscription).where(
    and(eq(subscription.interval, 'year'), eq(subscription.status, 'active'), gte(subscription.currentPeriodEnd, now))
  );
  
  console.log('=== 年度订阅用户积分状态 ===\n');
  
  for (const sub of subs) {
    const start = new Date(sub.currentPeriodStart);
    
    // 计算应发放月份
    let monthsPassed = 0, next = new Date(start);
    while (next <= now) { const t = new Date(next); t.setMonth(t.getMonth() + 1); if (t <= now) { monthsPassed++; next = t; } else break; }
    
    const grants = await database.select().from(credit).where(
      and(eq(credit.subscriptionNo, sub.subscriptionNo || ''), eq(credit.transactionType, CT.GRANT))
    ).orderBy(desc(credit.createdAt));
    
    let lastMonth = 0;
    if (grants[0]?.metadata) try { lastMonth = JSON.parse(grants[0].metadata).monthNumber || 0; } catch {}
    
    const status = lastMonth >= monthsPassed + 1 ? '✅' : '❌';
    console.log(`${status} ${sub.userEmail}`);
    console.log(`   订阅: ${sub.subscriptionNo} (${sub.productId})`);
    console.log(`   已发: ${grants.length}个月, 最新: 第${lastMonth}月, 应发: 第${monthsPassed+1}月\n`);
  }
}

main().catch(console.error);
