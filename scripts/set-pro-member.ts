/**
 * 设置用户为 Pro 会员脚本
 *
 * 功能说明：
 * 这个脚本用于手动将指定用户设置为 Pro 会员身份
 * 它会自动创建必要的订单和订阅记录，并可选地发放初始积分
 *
 * 使用方法：
 *   npx tsx scripts/set-pro-member.ts --email=duming243@hotmail.com
 *   npx tsx scripts/set-pro-member.ts --email=user@example.com --plan=pro-yearly
 *   npx tsx scripts/set-pro-member.ts --email=user@example.com --plan=pro-monthly --grant-credits
 *
 * 参数说明：
 *   --email=xxx         用户邮箱（必需）
 *   --plan=xxx         订阅计划，可选值：pro-monthly（月付）或 pro-yearly（年付），默认为 pro-monthly
 *   --grant-credits     是否发放初始积分，默认不发放（因为订阅系统会自动通过 cron 发放）
 *   --months=12         订阅时长（月数），默认为 1 个月（月付）或 12 个月（年付）
 */

import { eq, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { order, user } from '@/config/db/schema';
import { PaymentType } from '@/extensions/payment';
import { getCanonicalPlanInfo } from '@/shared/config/pricing-guard';
import { getSnowId, getUuid } from '@/shared/lib/hash';
import {
  calculateCreditExpirationTime,
  createCredit,
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
} from '@/shared/models/credit';
import { createOrder, OrderStatus } from '@/shared/models/order';
import { SubscriptionStatus } from '@/shared/models/subscription';

// Pro 会员计划配置
const PRO_PLANS = {
  'pro-monthly': {
    productId: 'pro-monthly',
    productName: 'StudyHacks Pro Monthly',
    planName: 'Pro',
    interval: 'month',
    intervalCount: 1,
    amount: 1999, // $19.99 in cents
    currency: 'USD',
  },
  'pro-yearly': {
    productId: 'pro-yearly',
    productName: 'StudyHacks Pro Yearly',
    planName: 'Pro',
    interval: 'year',
    intervalCount: 12,
    amount: 1399, // $13.99/month in cents (年付总价需要计算)
    currency: 'USD',
  },
} as const;

async function setProMember() {
  const args = process.argv.slice(2);
  const emailArg = args.find((arg) => arg.startsWith('--email='));
  const planArg = args.find((arg) => arg.startsWith('--plan='));
  const grantCreditsArg = args.find((arg) => arg === '--grant-credits');
  const monthsArg = args.find((arg) => arg.startsWith('--months='));

  // 验证必需参数
  if (!emailArg) {
    console.error('❌ 错误：请提供用户邮箱');
    console.log('\n使用方法：');
    console.log('  npx tsx scripts/set-pro-member.ts --email=user@example.com');
    console.log(
      '  npx tsx scripts/set-pro-member.ts --email=user@example.com --plan=pro-yearly'
    );
    console.log(
      '  npx tsx scripts/set-pro-member.ts --email=user@example.com --plan=pro-monthly --grant-credits'
    );
    console.log('\n参数说明：');
    console.log('  --email=xxx         用户邮箱（必需）');
    console.log(
      '  --plan=xxx         订阅计划：pro-monthly（月付）或 pro-yearly（年付），默认 pro-monthly'
    );
    console.log('  --grant-credits     是否发放初始积分，默认不发放');
    console.log(
      '  --months=12         订阅时长（月数），默认根据计划类型自动设置'
    );
    process.exit(1);
  }

  try {
    // 1. 查找用户
    const email = emailArg.split('=')[1];
    console.log(`🔍 正在查找用户：${email}`);

    const [targetUser] = await db()
      .select()
      .from(user)
      .where(eq(user.email, email));

    if (!targetUser) {
      console.error('❌ 用户不存在');
      process.exit(1);
    }

    console.log(
      `✓ 找到用户：${targetUser.name || '未设置名称'} (${targetUser.email})\n`
    );

    // 2. 确定订阅计划
    const planType = planArg ? planArg.split('=')[1] : 'pro-monthly';

    if (planType !== 'pro-monthly' && planType !== 'pro-yearly') {
      console.error(`❌ 无效的订阅计划：${planType}`);
      console.log('可用计划：');
      console.log('  - pro-monthly（月付）');
      console.log('  - pro-yearly（年付）');
      process.exit(1);
    }

    const planConfig = PRO_PLANS[planType];
    const planInfo = getCanonicalPlanInfo(planConfig.productId);

    if (!planInfo) {
      console.error(`❌ 无法获取计划配置信息：${planConfig.productId}`);
      process.exit(1);
    }

    console.log(`📦 订阅计划：${planConfig.productName}`);
    console.log(`   产品ID：${planConfig.productId}`);
    console.log(`   积分：${planInfo.credits} / 月`);
    console.log(`   有效期：${planInfo.valid_days} 天\n`);

    // 3. 检查用户是否已有活跃订阅（使用安全的查询方式）
    let activeSubscription = null;
    try {
      const { getCurrentSubscription } = await import(
        '@/shared/models/subscription'
      );
      activeSubscription = await getCurrentSubscription(targetUser.id);

      if (activeSubscription) {
        console.log(`⚠️  用户已有活跃订阅：`);
        console.log(`   订阅号：${activeSubscription.subscriptionNo}`);
        console.log(`   状态：${activeSubscription.status}`);
        console.log(
          `   产品：${activeSubscription.productName || activeSubscription.productId}`
        );
        console.log(
          `   到期时间：${activeSubscription.currentPeriodEnd?.toISOString()}`
        );
        console.log('\n是否要继续创建新订阅？(这可能会造成冲突)');
        console.log('提示：建议先取消或等待现有订阅到期');
        // 这里可以选择继续或退出，为了安全起见，我们继续执行
      }
    } catch (error) {
      // 如果查询失败（可能是数据库结构问题），跳过检查继续执行
      console.log(
        `ℹ️  无法检查现有订阅（可能是数据库结构问题），继续执行...\n`
      );
    }

    // 4. 计算订阅时长
    let subscriptionMonths = planType === 'pro-yearly' ? 12 : 1;
    if (monthsArg) {
      const months = parseInt(monthsArg.split('=')[1]);
      if (months > 0) {
        subscriptionMonths = months;
      }
    }

    const now = new Date();
    const currentPeriodStart = new Date(now);
    const currentPeriodEnd = new Date(now);

    // 根据订阅类型设置结束时间
    if (planType === 'pro-yearly') {
      currentPeriodEnd.setMonth(
        currentPeriodEnd.getMonth() + subscriptionMonths
      );
    } else {
      currentPeriodEnd.setMonth(
        currentPeriodEnd.getMonth() + subscriptionMonths
      );
    }

    console.log(`⏰ 订阅周期：`);
    console.log(`   开始时间：${currentPeriodStart.toISOString()}`);
    console.log(`   结束时间：${currentPeriodEnd.toISOString()}`);
    console.log(`   时长：${subscriptionMonths} 个月\n`);

    // 5. 创建虚拟订单（用于关联订阅）
    console.log(`🔄 正在创建订单...`);

    const orderId = getUuid();
    const orderNo = getSnowId();

    const newOrder = await createOrder({
      id: orderId,
      orderNo,
      userId: targetUser.id,
      userEmail: targetUser.email || '',
      status: OrderStatus.PAID, // 标记为已支付
      amount: planConfig.amount,
      currency: planConfig.currency,
      productId: planConfig.productId,
      productName: planConfig.productName,
      planName: planConfig.planName,
      paymentType: PaymentType.SUBSCRIPTION,
      paymentInterval: planConfig.interval,
      paymentProvider: 'manual', // 手动创建的标记
      checkoutInfo: JSON.stringify({
        source: 'manual_script',
        createdBy: 'admin',
        createdAt: now.toISOString(),
      }),
      checkoutResult: JSON.stringify({
        success: true,
        message: 'Manually created by admin script',
      }),
      paymentResult: JSON.stringify({
        success: true,
        message: 'Manually created by admin script',
      }),
      paidAt: now,
      creditsAmount: planInfo.credits,
      creditsValidDays: planInfo.valid_days,
      description: `Manual Pro membership assignment - ${planConfig.productName}`,
    });

    console.log(`✓ 订单创建成功：${orderNo}\n`);

    // 6. 创建订阅记录（使用原始 SQL，因为数据库表结构可能与 schema 不一致）
    console.log(`🔄 正在创建订阅...`);

    const subscriptionId = getUuid();
    const subscriptionNo = getSnowId();

    // 使用原始 SQL 插入，只包含实际存在的字段
    // 注意：根据实际数据库结构，order_id 字段可能不存在
    try {
      // 先尝试使用标准的 createSubscription（如果表结构正确）
      const { createSubscription } = await import(
        '@/shared/models/subscription'
      );
      const newSubscription = await createSubscription({
        id: subscriptionId,
        subscriptionNo,
        userId: targetUser.id,
        userEmail: targetUser.email || '',
        orderId: orderId,
        status: SubscriptionStatus.ACTIVE,
        planId: planConfig.productId,
        planName: planConfig.planName,
        productId: planConfig.productId,
        productName: planConfig.productName,
        amount: planConfig.amount,
        currency: planConfig.currency,
        interval: planConfig.interval,
        intervalCount: planConfig.intervalCount,
        paymentProvider: 'manual',
        subscriptionId: `manual_${subscriptionNo}`,
        subscriptionResult: JSON.stringify({
          source: 'manual_script',
          createdBy: 'admin',
          createdAt: now.toISOString(),
        }),
        creditsAmount: planInfo.credits,
        creditsValidDays: planInfo.valid_days,
        currentPeriodStart,
        currentPeriodEnd,
        description: `Manual Pro membership - ${planConfig.productName}`,
      });
      console.log(`✓ 订阅创建成功：${subscriptionNo}\n`);
    } catch (error: any) {
      // 如果标准方法失败（可能是缺少 order_id 字段），使用原始 SQL
      if (
        error?.cause?.code === '42703' ||
        error?.message?.includes('order_id')
      ) {
        console.log(`⚠️  检测到表结构差异，使用原始 SQL 插入...`);

        // 根据实际数据库表结构，只插入存在的字段
        // 注意：实际表中没有 plan_id 和 order_id 字段
        // 将 Date 对象转换为 ISO 字符串
        await db().execute(sql`
          INSERT INTO subscription (
            id, subscription_no, user_id, user_email, status,
            plan_name, product_id, product_name,
            amount, currency, interval, interval_count,
            payment_provider, subscription_id, subscription_result,
            credits_amount, credits_valid_days,
            current_period_start, current_period_end,
            description, created_at, updated_at
          ) VALUES (
            ${subscriptionId}, ${subscriptionNo}, ${targetUser.id}, ${targetUser.email || ''}, ${SubscriptionStatus.ACTIVE},
            ${planConfig.planName}, ${planConfig.productId}, ${planConfig.productName},
            ${planConfig.amount}, ${planConfig.currency}, ${planConfig.interval}, ${planConfig.intervalCount},
            ${'manual'}, ${`manual_${subscriptionNo}`}, ${JSON.stringify({
              source: 'manual_script',
              createdBy: 'admin',
              createdAt: now.toISOString(),
            })},
            ${planInfo.credits}, ${planInfo.valid_days},
            ${currentPeriodStart.toISOString()}::timestamp, ${currentPeriodEnd.toISOString()}::timestamp,
            ${`Manual Pro membership - ${planConfig.productName}`}, ${now.toISOString()}::timestamp, ${now.toISOString()}::timestamp
          )
        `);

        console.log(`✓ 订阅创建成功（使用原始 SQL）：${subscriptionNo}\n`);
      } else {
        throw error;
      }
    }

    // 7. 可选：发放初始积分
    if (grantCreditsArg) {
      console.log(`🔄 正在发放初始积分...`);

      const expiresAt = calculateCreditExpirationTime({
        creditsValidDays: planInfo.valid_days,
        currentPeriodEnd,
      });

      await createCredit({
        id: getUuid(),
        transactionNo: getSnowId(),
        userId: targetUser.id,
        userEmail: targetUser.email || '',
        subscriptionNo,
        transactionType: CreditTransactionType.GRANT,
        transactionScene: CreditTransactionScene.SUBSCRIPTION,
        credits: planInfo.credits,
        remainingCredits: planInfo.credits,
        description: `Pro membership initial credits - ${planConfig.productName}`,
        expiresAt,
        status: CreditStatus.ACTIVE,
      });

      console.log(`✓ 积分发放成功：${planInfo.credits} 积分`);
      if (expiresAt) {
        console.log(`   过期时间：${expiresAt.toISOString()}`);
      } else {
        console.log(`   过期时间：永不过期`);
      }
      console.log('');
    } else {
      console.log(`ℹ️  跳过积分发放（订阅系统会通过 cron 自动发放）`);
      console.log(`   如需手动发放，请使用 --grant-credits 参数\n`);
    }

    // 8. 输出总结
    console.log(`\n✅ Pro 会员设置成功！\n`);
    console.log(`📊 设置总结：`);
    console.log(
      `   用户：${targetUser.name || '未设置名称'} (${targetUser.email})`
    );
    console.log(`   订阅计划：${planConfig.productName}`);
    console.log(`   订阅号：${subscriptionNo}`);
    console.log(`   订单号：${orderNo}`);
    console.log(`   状态：${SubscriptionStatus.ACTIVE}`);
    console.log(`   开始时间：${currentPeriodStart.toISOString()}`);
    console.log(`   结束时间：${currentPeriodEnd.toISOString()}`);
    console.log(`   月积分：${planInfo.credits}`);
    console.log(`   积分有效期：${planInfo.valid_days} 天`);
    console.log('');

    console.log('💡 后续说明：');
    console.log('   - 用户现在拥有 Pro 会员权限');
    console.log('   - 订阅系统会通过 cron 任务自动发放每月积分');
    console.log('   - 如需延长订阅，可以更新 currentPeriodEnd 字段');
    console.log('   - 如需取消订阅，可以将 status 设置为 canceled');
    console.log('');
  } catch (error) {
    console.error('\n❌ 设置 Pro 会员时出错：', error);
    if (error instanceof Error) {
      console.error('错误详情：', error.message);
      console.error('错误堆栈：', error.stack);
    }
    process.exit(1);
  }
}

// 运行脚本
setProMember()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
