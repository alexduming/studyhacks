'use server';

import { eq, and, gt } from 'drizzle-orm';

import { db } from '@/core/db';
import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { redemptionCode, redemptionRecord } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';
import {
  createCredit,
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
} from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { getSnowId } from '@/shared/lib/hash';

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
      credits: amount,
      createdBy,
      createdAt: new Date(),
      status: 'active',
      maxUses,
      usedCount: 0,
      creditValidityDays,
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
 * 用户兑换积分
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
    // 使用 for('update') 防止并发超兑
    const result = await tx
      .select()
      .from(redemptionCode)
      .where(eq(redemptionCode.code, formattedCode))
      .for('update'); // Lock row for update

    const existingCode = result[0];

    if (!existingCode) {
      return { success: false, error: 'invalid_code' }; // 无效兑换码
    }

    // 2.2 基础校验
    if (existingCode.status !== 'active') {
      return { success: false, error: 'code_used_or_expired' }; // 已失效
    }

    // 检查是否过期
    if (existingCode.expiresAt && new Date() > existingCode.expiresAt) {
      return { success: false, error: 'code_expired' }; // 已过期
    }

    // 检查剩余次数
    if (existingCode.usedCount >= existingCode.maxUses) {
      return { success: false, error: 'code_usage_limit_reached' }; // 次数已用完
    }

    // 2.3 检查用户是否已兑换过此码 (每人限一次)
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
      return { success: false, error: 'already_redeemed' }; // 您已使用过此兑换码
    }

    // 2.4 更新兑换码使用状态
    const newUsedCount = existingCode.usedCount + 1;
    const isFullyUsed = newUsedCount >= existingCode.maxUses;

    await tx
      .update(redemptionCode)
      .set({
        usedCount: newUsedCount,
        status: isFullyUsed ? 'used' : 'active',
        // usedAt: new Date(), // 可选：更新最后使用时间
      })
      .where(eq(redemptionCode.id, existingCode.id));

    // 2.5 插入兑换记录
    await tx.insert(redemptionRecord).values({
      id: getUuid(),
      codeId: existingCode.id,
      userId: user.id,
      redeemedAt: new Date(),
    });

    // 2.6 计算积分有效期
    let creditExpiresAt = null;
    if (existingCode.creditValidityDays && existingCode.creditValidityDays > 0) {
      creditExpiresAt = new Date();
      creditExpiresAt.setDate(creditExpiresAt.getDate() + existingCode.creditValidityDays);
    }

    // 2.7 发放积分
    await createCredit({
      id: getUuid(),
      userId: user.id,
      transactionNo: getSnowId(),
      transactionType: CreditTransactionType.GRANT,
      transactionScene: CreditTransactionScene.REDEMPTION,
      credits: existingCode.credits,
      remainingCredits: existingCode.credits,
      status: CreditStatus.ACTIVE,
      description: `Redeemed code: ${formattedCode}`,
      expiresAt: creditExpiresAt,
    });

    return { success: true, credits: existingCode.credits };
  });
}
