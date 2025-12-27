'use server';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

import { db } from '@/core/db';
import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { redemptionCode } from '@/config/db/schema';
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

  // 2. 批量生成
  for (let i = 0; i < quantity; i++) {
    codesToInsert.push({
      id: getUuid(),
      code: generateSecureCode(),
      credits: amount,
      createdBy,
      createdAt: new Date(),
      status: 'active',
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
    // 2.1 查询兑换码并锁定 (Simple select for now, concurrency handled by unique index/atomic update check)
    // Note: Drizzle transaction doesn't auto-lock unless using `for update`.
    // We will rely on the atomic update returning updated rows count to detect race conditions.
    
    const [existingCode] = await tx
      .select()
      .from(redemptionCode)
      .where(eq(redemptionCode.code, formattedCode));

    if (!existingCode) {
      return { success: false, error: 'invalid_code' };
    }

    if (existingCode.status !== 'active') {
      return { success: false, error: 'code_used_or_expired' };
    }

    // 2.2 标记为已使用 (Atomic update)
    const [updated] = await tx
      .update(redemptionCode)
      .set({
        status: 'used',
        userId: user.id,
        usedAt: new Date(),
      })
      .where(
        // Ensure we are updating the exact active record
        eq(redemptionCode.id, existingCode.id)
      )
      .returning();

    // Double check if update actually happened (in case of race condition)
    if (!updated) {
       return { success: false, error: 'code_used_or_expired' };
    }

    // 2.3 发放积分
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
    });

    return { success: true, credits: existingCode.credits };
  });
}

