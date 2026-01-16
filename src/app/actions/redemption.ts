'use server';

import { eq, and, gt, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { redemptionCode, redemptionRecord, order, subscription } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';
import {
  createCredit,
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
} from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { getSnowId } from '@/shared/lib/hash';
import { OrderStatus } from '@/shared/models/order';
import { SubscriptionStatus } from '@/shared/models/subscription';
import { PaymentType } from '@/extensions/payment';
import { getCanonicalPlanInfo } from '@/shared/config/pricing-guard';
import { revalidatePath } from 'next/cache';

// 生成易读的随机码 (大写字母+数字，排除易混淆字符)
function generateSecureCode(length = 16) {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Remove I, 1, O, 0
  let code = '';
  for (let i = 0; i < length; i++) {
    code += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  // Format as XXXX-XXXX-XXXX-XXXX
  return code.match(/.{1,4}/g)?.join('-') || code;
}

/**
 * 批量生成兑换码 (管理员)
 */
export async function generateCodesAction(
  amount: number,
  quantity: number,
  maxUses: number = 1,
  creditValidityDays: number = 30,
  expiresAt?: string, // ISO Date string from form
  locale: string = 'en'
) {
  // 1. 权限检查
  await requirePermission({
    code: PERMISSIONS.CREDITS_WRITE,
    redirectUrl: '', // Action call, just throw error
    locale,
  });

  const codesToInsert = [];
  const createdBy = (await getUserInfo())?.id;
  const codeExpiresAt = expiresAt ? new Date(expiresAt) : null;

  // 2. 批量生成
  for (let i = 0; i < quantity; i++) {
    codesToInsert.push({
      id: getUuid(),
      code: generateSecureCode(),
      credits: amount ?? 0,
      createdBy,
      createdAt: new Date(),
      status: 'active',
      maxUses,
      usedCount: 0,
      creditValidityDays: creditValidityDays ?? 30,
      expiresAt: codeExpiresAt,
    });
  }

  // 3. 插入数据库
  if (codesToInsert.length > 0) {
    await db().insert(redemptionCode).values(codesToInsert);
  }

  return {
    success: true,
    data: codesToInsert.map((c) => c.code),
  };
}

/**
 * 批量生成会员兑换码 (管理员)
 */
export async function generateMembershipCodesAction(
  planId: string,
  quantity: number,
  membershipDays: number = 30,
  expiresAt?: string,
  locale: string = 'en'
) {
  // 1. 权限检查
  await requirePermission({
    code: PERMISSIONS.CREDITS_WRITE, // 借用权限
    redirectUrl: '',
    locale,
  });

  const planInfo = getCanonicalPlanInfo(planId);
  if (!planInfo) {
    throw new Error('Invalid plan');
  }

  const codesToInsert = [];
  const createdBy = (await getUserInfo())?.id;
  const codeExpiresAt = expiresAt ? new Date(expiresAt) : null;

  for (let i = 0; i < quantity; i++) {
    codesToInsert.push({
      id: getUuid(),
      code: generateSecureCode(),
      credits: planInfo.credits ?? 0,
      type: 'membership',
      planId,
      membershipDays,
      createdBy,
      createdAt: new Date(),
      status: 'active',
      maxUses: 1,
      usedCount: 0,
      expiresAt: codeExpiresAt,
    });
  }

  if (codesToInsert.length > 0) {
    await db().insert(redemptionCode).values(codesToInsert);
  }

  return {
    success: true,
    data: codesToInsert.map((c) => c.code),
  };
}

/**
 * 用户兑换 (积分或会员)
 */
export async function redeemCodeAction(code: string) {
  const user = await getUserInfo();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // 1. 格式化输入 (移除空格，大写)
  const formattedCode = code.trim().toUpperCase();

  // 2. 开启事务处理
  return await db().transaction(async (tx) => {
    // 2.1 查询兑换码并锁定
    const result = await tx
      .select()
      .from(redemptionCode)
      .where(eq(redemptionCode.code, formattedCode))
      .for('update');

    const existingCode = result[0];

    if (!existingCode) {
      return { success: false, error: 'invalid_code' };
    }

    if (existingCode.status !== 'active') {
      return { success: false, error: 'code_used_or_expired' };
    }

    if (existingCode.expiresAt && new Date() > existingCode.expiresAt) {
      return { success: false, error: 'code_expired' };
    }

    if (existingCode.usedCount >= existingCode.maxUses) {
      return { success: false, error: 'code_usage_limit_reached' };
    }

    const recordResult = await tx
      .select()
      .from(redemptionRecord)
      .where(
        and(
          eq(redemptionRecord.codeId, existingCode.id),
          eq(redemptionRecord.userId, user.id)
        )
      );
    
    if (recordResult.length > 0) {
      return { success: false, error: 'already_redeemed' };
    }

    // 2.4 更新兑换码使用状态
    const newUsedCount = existingCode.usedCount + 1;
    const isFullyUsed = newUsedCount >= existingCode.maxUses;

    await tx
      .update(redemptionCode)
      .set({
        usedCount: newUsedCount,
        status: isFullyUsed ? 'used' : 'active',
      })
      .where(eq(redemptionCode.id, existingCode.id));

    // 2.5 插入兑换记录
    await tx.insert(redemptionRecord).values({
      id: getUuid(),
      codeId: existingCode.id,
      userId: user.id,
      redeemedAt: new Date(),
    });

    // 2.6 处理会员兑换
    if (existingCode.type === 'membership' && existingCode.planId) {
      const planId = existingCode.planId;
      const days = existingCode.membershipDays || 30;
      const planName = planId.includes('pro') ? 'Pro' : 'Plus';
      const isYearly = planId.includes('yearly');
      const interval = isYearly ? 'year' : 'month';
      const productName = planId.includes('pro') 
        ? `StudyHacks Pro ${isYearly ? 'Yearly' : 'Monthly'}`
        : `StudyHacks Plus ${isYearly ? 'Yearly' : 'Monthly'}`;

      const now = new Date();
      const currentPeriodStart = new Date(now);
      const currentPeriodEnd = new Date(now);
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + days);

      // 创建订单
      const orderId = getUuid();
      await tx.insert(order).values({
        id: orderId,
        orderNo: getSnowId(),
        userId: user.id,
        userEmail: user.email || '',
        status: OrderStatus.PAID,
        amount: 0, // 兑换码是 0 元
        currency: 'USD',
        productId: planId,
        productName,
        planName,
        paymentType: PaymentType.SUBSCRIPTION,
        paymentInterval: interval,
        paymentProvider: 'redemption',
        checkoutInfo: JSON.stringify({ source: 'redemption_code', code: formattedCode }),
        paidAt: now,
        creditsAmount: existingCode.credits,
        creditsValidDays: days,
        description: `Membership redemption - ${formattedCode}`,
      });

      // 失效旧订阅
      await tx
        .update(subscription)
        .set({ status: SubscriptionStatus.EXPIRED, updatedAt: now })
        .where(eq(subscription.userId, user.id));

      // 创建新订阅 (原始 SQL 绕过缺失字段)
      const subscriptionNo = getSnowId();
      const subscriptionId = getUuid();
      await tx.execute(sql`
        INSERT INTO subscription (
          id, subscription_no, user_id, user_email, status,
          plan_name, product_id, product_name,
          amount, currency, interval, interval_count,
          payment_provider, subscription_id, subscription_result,
          credits_amount, credits_valid_days,
          current_period_start, current_period_end,
          description, created_at, updated_at
        ) VALUES (
          ${subscriptionId}, ${subscriptionNo}, ${user.id}, ${user.email || ''}, ${SubscriptionStatus.ACTIVE},
          ${planName}, ${planId}, ${productName},
          0, ${'USD'}, ${interval}, 1,
          'redemption', ${`redemption_${formattedCode}`}, ${JSON.stringify({ source: 'redemption_code' })},
          ${existingCode.credits}, ${days},
          ${currentPeriodStart.toISOString()}::timestamp, ${currentPeriodEnd.toISOString()}::timestamp,
          ${`Membership redemption - ${formattedCode}`}, ${now.toISOString()}::timestamp, ${now.toISOString()}::timestamp
        )
      `);
    }

    // 2.7 发放积分 (对于会员兑换，这相当于是初始积分)
    let creditExpiresAt = null;
    if (existingCode.type === 'membership') {
      const days = existingCode.membershipDays || 30;
      creditExpiresAt = new Date();
      creditExpiresAt.setDate(creditExpiresAt.getDate() + days);
    } else if (existingCode.creditValidityDays && existingCode.creditValidityDays > 0) {
      creditExpiresAt = new Date();
      creditExpiresAt.setDate(creditExpiresAt.getDate() + existingCode.creditValidityDays);
    }

    await createCredit({
      id: getUuid(),
      userId: user.id,
      transactionNo: getSnowId(),
      transactionType: CreditTransactionType.GRANT,
      transactionScene: CreditTransactionScene.REDEMPTION,
      credits: existingCode.credits,
      remainingCredits: existingCode.credits,
      status: CreditStatus.ACTIVE,
      description: `Redeemed code: ${formattedCode}${existingCode.type === 'membership' ? ' (Membership)' : ''}`,
      expiresAt: creditExpiresAt,
    });

    revalidatePath('/[locale]/(landing)/settings/credits', 'page');
    return { 
      success: true, 
      credits: existingCode.credits, 
      type: existingCode.type,
      planId: existingCode.planId 
    };
  });
}
