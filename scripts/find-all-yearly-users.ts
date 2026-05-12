import 'dotenv/config';
import { and, eq, gte, desc } from 'drizzle-orm';
import { db } from '@/core/db';
import { subscription, credit, user } from '@/config/db/schema';
import { CreditTransactionType } from '@/shared/models/credit';

async function main() {
  const database = db();
  const now = new Date();
  
  console.log('=== 查询所有年度订阅用户 ===\n');
  
  // 查所有活跃年度订阅
  const yearlySubs = await database
    .select()
    .from(subscription)
    .where(
      and(
        eq(subscription.interval, 'year'),
        eq(subscription.status, 'active'),
        gte(subscription.currentPeriodEnd, now)
      )
    );
  
  console.log(`活跃年度订阅: ${yearlySubs.length} 个\n`);
  
  // 对每个订阅检查积分发放状态
  const issues: Array<{
    subscriptionNo: string;
    userEmail: string;
    productId: string;
    startedAt: Date;
    monthsPassed: number;
    grantCount: number;
    lastMonth: number;
    issue: string;
  }> = [];
  
  for (const sub of yearlySubs) {
    const subscriptionStart = new Date(sub.currentPeriodStart);
    
    // 计算已过月数
    let monthsPassed = 0;
    let nextDate = new Date(subscriptionStart);
    while (nextDate <= now) {
      const temp = new Date(nextDate);
      temp.setMonth(temp.getMonth() + 1);
      if (temp <= now) {
        monthsPassed++;
        nextDate = temp;
      } else break;
    }
    
    // 查这个订阅的 GRANT 记录
    const grants = await database
      .select({
        metadata: credit.metadata,
        description: credit.description,
      })
      .from(credit)
      .where(
        and(
          eq(credit.subscriptionNo, sub.subscriptionNo || ''),
          eq(credit.transactionType, CreditTransactionType.GRANT),
          eq(credit.transactionScene, 'subscription'),
          gte(credit.createdAt, subscriptionStart)
        )
      )
      .orderBy(desc(credit.createdAt));
    
    const lastGrant = grants[0];
    let lastMonth = 0;
    if (lastGrant?.metadata) {
      try {
        const parsed = JSON.parse(lastGrant.metadata);
        lastMonth = parsed?.monthNumber || 0;
      } catch {}
    }
    
    const expectedMonth = monthsPassed + 1;
    const issue = lastMonth < expectedMonth ? `缺少第${expectedMonth}月积分` : null;
    
    if (issue || grants.length === 0) {
      issues.push({
        subscriptionNo: sub.subscriptionNo || '',
        userEmail: sub.userEmail || 'unknown',
        productId: sub.productId || '',
        startedAt: subscriptionStart,
        monthsPassed,
        grantCount: grants.length,
        lastMonth,
        issue: issue || '无发放记录'
      });
    }
  }
  
  console.log(`问题用户: ${issues.length} 个\n`);
  for (const i of issues) {
    console.log(`- ${i.userEmail}`);
    console.log(`  订阅: ${i.subscriptionNo} (${i.productId})`);
    console.log(`  开始: ${i.startedAt.toISOString().slice(0,10)}`);
    console.log(`  已过月: ${i.monthsPassed}, 已发放: ${i.lastMonth}月`);
    console.log(`  问题: ${i.issue}`);
    console.log('');
  }
}

main().catch(console.error);
