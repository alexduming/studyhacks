import 'dotenv/config';
import { and, eq, gte, desc } from 'drizzle-orm';
import { db } from '@/core/db';
import { subscription, credit, user } from '@/config/db/schema';
import { CreditTransactionType } from '@/shared/models/credit';
import { getCanonicalPlanInfo } from '@/shared/config/pricing-guard';
import { getUuid, getSnowId } from '@/shared/lib/hash';
import { createCredit, CreditStatus, CreditTransactionScene, CreditTransactionType as CT } from '@/shared/models/credit';

async function main() {
  const database = db();
  const now = new Date();
  
  // 查询所有活跃年度订阅
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
  
  console.log(`=== 开始批量修复 (${yearlySubs.length} 个订阅) ===\n`);
  
  let fixed = 0;
  let skipped = 0;
  
  for (const sub of yearlySubs) {
    const subscriptionStart = new Date(sub.currentPeriodStart);
    const subscriptionEnd = new Date(sub.currentPeriodEnd);
    
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
    
    const expectedMonth = monthsPassed + 1;
    
    // 查这个订阅的 GRANT 记录
    const grants = await database
      .select({
        id: credit.id,
        metadata: credit.metadata,
        description: credit.description,
      })
      .from(credit)
      .where(
        and(
          eq(credit.subscriptionNo, sub.subscriptionNo || ''),
          eq(credit.transactionType, CreditTransactionType.GRANT),
          eq(credit.transactionScene, CreditTransactionScene.SUBSCRIPTION),
          gte(credit.createdAt, subscriptionStart)
        )
      )
      .orderBy(desc(credit.createdAt));
    
    let lastMonth = 0;
    if (grants[0]?.metadata) {
      try {
        const parsed = JSON.parse(grants[0].metadata);
        lastMonth = parsed?.monthNumber || 0;
      } catch {}
    }
    
    // 如果缺少积分，补发
    if (lastMonth < expectedMonth) {
      console.log(`修复: ${sub.userEmail}`);
      console.log(`  订阅: ${sub.subscriptionNo}`);
      console.log(`  需要: 第${expectedMonth}月, 已有: 第${lastMonth}月`);
      
      // 获取月度积分
      const planInfo = getCanonicalPlanInfo(sub.productId || '');
      const monthlyCredits = planInfo?.credits || 600;
      
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 30);
      const finalExpiresAt = expiresAt > subscriptionEnd ? subscriptionEnd : expiresAt;
      
      // 补发
      await createCredit({
        id: getUuid(),
        userId: sub.userId,
        userEmail: sub.userEmail || '',
        subscriptionNo: sub.subscriptionNo || '',
        transactionNo: getSnowId(),
        transactionType: CT.GRANT,
        transactionScene: CreditTransactionScene.SUBSCRIPTION,
        credits: monthlyCredits,
        remainingCredits: monthlyCredits,
        description: `Subscription credits - month ${expectedMonth} of subscription (${sub.productName || sub.productId})`,
        metadata: JSON.stringify({
          monthNumber: expectedMonth,
          cycleStart: subscriptionStart.toISOString(),
          source: 'cron_repair',
        }),
        expiresAt: finalExpiresAt,
        status: CreditStatus.ACTIVE,
      });
      
      console.log(`  ✅ 补发第${expectedMonth}月 ${monthlyCredits} 积分\n`);
      fixed++;
    } else {
      skipped++;
    }
  }
  
  console.log(`=== 完成: 修复 ${fixed} 个, 正常 ${skipped} 个 ===`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
