import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { credit, subscription } from '@/config/db/schema';
import { getUuid, getSnowId } from '@/shared/lib/hash';
import { createCredit, CreditStatus, CreditTransactionScene, CreditTransactionType } from '@/shared/models/credit';

async function main() {
  const userId = '8c7b6d34-b9a7-422b-b15b-195f00bec8cb';
  const userEmail = '2131604349@qq.com';
  const subscriptionNo = '81053732684006987';
  const monthlyCredits = 2000;
  
  console.log('=== 手动发放第2月积分 ===');
  console.log('user:', userEmail);
  console.log('subscriptionNo:', subscriptionNo);
  console.log('积分:', monthlyCredits);
  
  // 创建积分发放
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30); // 30天有效期
  
  const results = await db().select().from(subscription).where(eq(subscription.subscriptionNo, subscriptionNo));
  const sub = results[0];
  const subscriptionStart = sub ? new Date(sub.currentPeriodStart) : new Date('2026-04-09');
  
  await createCredit({
    id: getUuid(),
    userId,
    userEmail,
    subscriptionNo,
    transactionNo: getSnowId(),
    transactionType: CreditTransactionType.GRANT,
    transactionScene: CreditTransactionScene.SUBSCRIPTION,
    credits: monthlyCredits,
    remainingCredits: monthlyCredits,
    description: `Subscription credits - month 2 of subscription (StudyHacks Pro Yearly)`,
    metadata: JSON.stringify({
      monthNumber: 2,
      cycleStart: subscriptionStart.toISOString(),
    }),
    expiresAt,
    status: CreditStatus.ACTIVE,
  });
  
  console.log('\n✅ 第2月积分已发放');
  console.log('过期时间:', expiresAt.toISOString());
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
