import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { credit, subscription } from '@/config/db/schema';
import { getCanonicalPlanInfo } from '@/shared/config/pricing-guard';
import { getSnowId, getUuid } from '@/shared/lib/hash';
import {
  createCredit,
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
} from '@/shared/models/credit';
import { SubscriptionStatus } from '@/shared/models/subscription';

/**
 * 订阅用户月度积分发放 Cron Job
 *
 * 非程序员解释：
 * - 这个 API 专门给「年度订阅」用户按月发放积分
 * - 年度订阅用户一次性付了全年的费用，但积分是每月刷新的（类似 Cursor）
 * - 每天凌晨由 Vercel Cron 自动调用此接口
 * - 系统会检查每个年度订阅用户是否满一个月需要发放新积分
 *
 * 发放规则：
 * - 从用户订阅开始日期（currentPeriodStart）计算
 * - 例：1月28日购买 → 2月28日发放第2个月积分，3月28日发放第3个月积分
 * - plus-yearly: 每月 600 积分
 * - pro-yearly: 每月 2000 积分
 * - free-yearly: 每月 10 积分
 * - 积分有效期为发放日起30天
 *
 * 安全措施：
 * - 使用 CRON_SECRET 环境变量验证请求
 * - 防止重复发放：检查该订阅周期的积分是否已发放
 */

// 强制使用 Node.js 运行时
export const runtime = 'nodejs';
// 设置最大执行时间（处理大量订阅可能需要较长时间）
export const maxDuration = 300; // 5 分钟

export async function POST(request: NextRequest) {
  try {
    // ========== 1. 验证授权 ==========
    const authHeader = request.headers.get('authorization');
    const cronSecret =
      process.env.CRON_SECRET || 'your-secret-key-change-in-production';

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 开始年度订阅用户月度积分发放...');

    // ========== 2. 获取所有活跃的年度订阅 ==========
    const database = db();
    const now = new Date();

    // 查询条件：
    // - interval = 'year'（年度订阅）
    // - status = 'active' 或 'pending_cancel' 或 'trialing'（仍在有效期内）
    // - currentPeriodEnd > now（订阅周期未结束）
    const activeYearlySubscriptions = await database
      .select()
      .from(subscription)
      .where(
        and(
          eq(subscription.interval, 'year'),
          inArray(subscription.status, [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PENDING_CANCEL,
            SubscriptionStatus.TRIALING,
          ]),
          gte(subscription.currentPeriodEnd, now)
        )
      );

    console.log(`📊 找到 ${activeYearlySubscriptions.length} 个活跃年度订阅`);

    if (activeYearlySubscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active yearly subscriptions found',
        stats: { totalSubscriptions: 0, successCount: 0, skippedCount: 0 },
      });
    }

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: Array<{ subscriptionNo: string; error: string }> = [];
    const processed: Array<{
      subscriptionNo: string;
      userId: string;
      credits: number;
      monthNumber: number;
    }> = [];

    // ========== 3. 遍历每个订阅，检查是否满月需要发放 ==========
    for (const sub of activeYearlySubscriptions) {
      try {
        const subscriptionStart = new Date(sub.currentPeriodStart);
        const subscriptionEnd = new Date(sub.currentPeriodEnd);

        // 3.1 计算从订阅开始到现在经过了多少个完整月
        // 例：1月28日购买，2月27日是0个完整月，2月28日是1个完整月
        let monthsPassed = 0;
        let nextBillingDate = new Date(subscriptionStart);

        while (nextBillingDate <= now && nextBillingDate < subscriptionEnd) {
          // 计算下一个账期日期（加1个月）
          const tempDate = new Date(nextBillingDate);
          tempDate.setMonth(tempDate.getMonth() + 1);

          if (tempDate <= now) {
            monthsPassed++;
            nextBillingDate = tempDate;
          } else {
            break;
          }
        }

        // 如果还没满1个月（首月已在购买时发放），跳过
        if (monthsPassed === 0) {
          skippedCount++;
          continue;
        }

        // 3.2 检查该月的积分是否已发放
        // 查询最近一次发放的积分记录
        const latestCredits = await database
          .select()
          .from(credit)
          .where(
            and(
              eq(credit.subscriptionNo, sub.subscriptionNo || ''),
              eq(credit.transactionType, CreditTransactionType.GRANT),
              eq(credit.transactionScene, CreditTransactionScene.SUBSCRIPTION)
            )
          )
          .orderBy(desc(credit.createdAt))
          .limit(1);

        // 从 description 中提取已发放的月数
        let lastMonthNumber = 0; // 首月是0（购买时发放）
        if (latestCredits.length > 0) {
          const match = latestCredits[0].description?.match(
            /month (\d+) of subscription/
          );
          if (match) {
            lastMonthNumber = parseInt(match[1]);
          }
        }

        // 如果已经发放到当前月份，跳过
        if (lastMonthNumber >= monthsPassed) {
          console.log(
            `⏭️ 订阅 ${sub.subscriptionNo} 已发放到第 ${lastMonthNumber} 月，跳过`
          );
          skippedCount++;
          continue;
        }

        // 3.3 获取该计划的月度积分额度
        const planInfo = getCanonicalPlanInfo(sub.productId || '');
        if (!planInfo) {
          console.warn(
            `⚠️ 订阅 ${sub.subscriptionNo} 的产品 ${sub.productId} 未找到对应积分配置，跳过`
          );
          skippedCount++;
          continue;
        }

        const monthlyCredits = planInfo.credits;

        // 3.4 计算积分过期时间（发放日起30天）
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + 30);

        // 确保不超过订阅结束时间
        const finalExpiresAt =
          expiresAt > subscriptionEnd ? subscriptionEnd : expiresAt;

        // 3.5 发放积分
        const currentMonthNumber = monthsPassed;
        await createCredit({
          id: getUuid(),
          userId: sub.userId,
          userEmail: sub.userEmail || '',
          subscriptionNo: sub.subscriptionNo || '',
          transactionNo: getSnowId(),
          transactionType: CreditTransactionType.GRANT,
          transactionScene: CreditTransactionScene.SUBSCRIPTION,
          credits: monthlyCredits,
          remainingCredits: monthlyCredits,
          description: `Subscription credits - month ${currentMonthNumber} of subscription (${sub.productName || sub.productId})`,
          expiresAt: finalExpiresAt,
          status: CreditStatus.ACTIVE,
        });

        successCount++;
        processed.push({
          subscriptionNo: sub.subscriptionNo || '',
          userId: sub.userId,
          credits: monthlyCredits,
          monthNumber: currentMonthNumber,
        });
        console.log(
          `✅ 订阅 ${sub.subscriptionNo} 用户 ${sub.userEmail} 发放第 ${currentMonthNumber} 月积分 ${monthlyCredits}`
        );
      } catch (error: any) {
        errorCount++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          subscriptionNo: sub.subscriptionNo || '',
          error: errorMessage,
        });
        console.error(
          `❌ 订阅 ${sub.subscriptionNo} 发放积分失败:`,
          errorMessage
        );
      }
    }

    console.log(
      `🎉 年度订阅积分发放完成！成功: ${successCount}, 跳过: ${skippedCount}, 失败: ${errorCount}`
    );

    return NextResponse.json({
      success: true,
      message: 'Subscription credits distribution completed',
      stats: {
        totalSubscriptions: activeYearlySubscriptions.length,
        successCount,
        skippedCount,
        errorCount,
        checkDate: now.toISOString(),
      },
      processed: processed.length > 0 ? processed : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('❌ 年度订阅积分发放失败:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to distribute subscription credits',
      },
      { status: 500 }
    );
  }
}

/**
 * GET 方法：用于健康检查和手动测试
 */
export async function GET(request: NextRequest) {
  const now = new Date();

  // 统计活跃年度订阅数量
  let activeCount = 0;
  try {
    const database = db();
    const result = await database
      .select()
      .from(subscription)
      .where(
        and(
          eq(subscription.interval, 'year'),
          inArray(subscription.status, [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PENDING_CANCEL,
            SubscriptionStatus.TRIALING,
          ]),
          gte(subscription.currentPeriodEnd, now)
        )
      );
    activeCount = result.length;
  } catch {
    // ignore
  }

  return NextResponse.json({
    message: 'Subscription credits Cron API is ready',
    currentDate: now.toISOString(),
    activeYearlySubscriptions: activeCount,
    info: 'Runs daily to check if any subscription has reached a monthly anniversary and needs credits',
    example: 'User subscribes on Jan 28 → Gets credits on Feb 28, Mar 28, etc.',
    creditsPerPlan: {
      'free-yearly': '10 credits/month',
      'plus-yearly': '600 credits/month',
      'pro-yearly': '2000 credits/month',
    },
    creditsValidity: '30 days from distribution date',
  });
}
