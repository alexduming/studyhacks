import 'dotenv/config';
import { and, eq, gte, desc } from 'drizzle-orm';
import { db } from '@/core/db';
import { subscription, credit } from '@/config/db/schema';
import { CreditTransactionType as CT, CreditTransactionScene, CreditStatus } from '@/shared/models/credit';
import { getCanonicalPlanInfo } from '@/shared/config/pricing-guard';
import { getUuid, getSnowId } from '@/shared/lib/hash';

async function main() {
  const database = db();
  const now = new Date();
  
  // 查询问题用户
  const yearlySubs = await database
    .select()
    .from(subscription)
    .where(and(eq(subscription.interval, 'year'), eq(subscription.status, 'active')));
  
  let totalFixed = 0;
  
  for (const sub of yearlySubs) {
    const subscriptionStart = new Date(sub.currentPeriodStart);
    const subscriptionEnd = new Date(sub.currentPeriodEnd);
    const planInfo = getCanonicalPlanInfo(sub.productId || '');
    const monthlyCredits = planInfo?.credits || 600;
    
    // 计算应发放月份
    let monthsPassed = 0;
    let nextDate = new Date(subscriptionStart);
    while (nextDate <= now) {
      const temp = new Date(nextDate);
      temp.setMonth(temp.getMonth() + 1);
      if (temp <= now) { monthsPassed++; nextDate = temp; }
      else break;
    }
    
    // 查现有发放
    const grants = await database.select().from(credit).where(
      and(eq(credit.subscriptionNo, sub.subscriptionNo || ''), eq(credit.transactionType, CT.GRANT))
    ).orderBy(desc(credit.createdAt));
    
    let lastMonth = 0;
    if (grants[0]?.metadata) {
      try { lastMonth = JSON.parse(grants[0].metadata).monthNumber || 0; } catch {}
    }
    
    // 补发所有缺失月份
    let userFixed = 0;
    for (let m = lastMonth + 1; m <= monthsPassed; m++) {
      console.log(`补发: ${sub.userEmail} 第${m}月`);
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 30);
      const finalExpiresAt = expiresAt > subscriptionEnd ? subscriptionEnd : expiresAt;
      
      await db().insert(credit).values({
        id: getUuid(),
        userId: sub.userId,
        userEmail: sub.userEmail || '',
        subscriptionNo: sub.subscriptionNo || '',
        transactionNo: getSnowId(),
        transactionType: CT.GRANT,
        transactionScene: CreditTransactionScene.SUBSCRIPTION,
        credits: monthlyCredits,
        remainingCredits: monthlyCredits,
        description: `Subscription credits - month ${m} of subscription (${sub.productName || sub.productId})`,
        metadata: JSON.stringify({ monthNumber: m, cycleStart: subscriptionStart.toISOString() }),
        expiresAt: finalExpiresAt,
        status: CreditStatus.ACTIVE,
      });
      userFixed++;
      totalFixed++;
    }
    if (userFixed > 0) console.log(`  ✅ ${sub.userEmail} 补发 ${userFixed} 个月\n`);
  }
  
  console.log(`=== 共补发 ${totalFixed} 个月 ===`);
}

main().catch(console.error);
