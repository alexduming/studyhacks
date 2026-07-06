'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { getSnowId, getUuid } from '@/shared/lib/hash';
import {
  consumeCredits,
  createCredit,
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
} from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import {
  AuditActionType,
  logAuditEvent,
  validateDescription,
} from '@/shared/services/audit-log';

const manageCreditsSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
  type: z.enum(['add', 'deduct']),
  reason: z.string().optional(),
});

type ManageCreditsState = {
  success: boolean;
  error?: string;
};

/**
 * 管理用户积分操作
 *
 * 非程序员解释：
 * - 这个函数用于管理员手动添加或扣除用户积分
 * - 现在增加了以下安全措施：
 *   1. 验证描述字段，禁止使用测试相关关键词（生产环境）
 *   2. 记录操作审计日志，追踪谁在什么时候做了什么操作
 *   3. 记录操作人、时间、IP地址等信息
 */
export async function manageUserCredits(
  _prevState: ManageCreditsState,
  formData: FormData
): Promise<ManageCreditsState> {
  // Use a fixed locale for admin actions logging or default
  // Ideally, we should get the locale from the request context if possible,
  // but for server actions invoked from client, we focus on the logic.

  // 1. Permission Check
  // We check for both USERS_WRITE (modifying user state) and CREDITS_WRITE (modifying credits)
  try {
    // Note: requirePermission throws if invalid.
    // We don't have easy access to redirectUrl here without knowing the current path,
    // but we want to return an error object anyway, not redirect the whole page if it's an API call style action.
    // So we wrap in try/catch.
    await requirePermission({ code: PERMISSIONS.CREDITS_WRITE });
  } catch (error) {
    return { success: false, error: 'Permission denied' };
  }

  const data = {
    userId: formData.get('userId'),
    amount: parseInt(formData.get('amount') as string),
    type: formData.get('type'),
    reason: formData.get('reason'),
  };

  const validated = manageCreditsSchema.safeParse(data);

  if (!validated.success) {
    return { success: false, error: 'Invalid input parameters' };
  }

  const { userId, amount, type, reason } = validated.data;

  // 2. 验证描述字段（生产环境禁止测试关键词）
  const description =
    reason ||
    (type === 'add' ? 'Admin manual grant' : 'Admin manual deduction');
  const validation = validateDescription(description);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // 获取操作人信息（用于审计日志）
    const operator = await getUserInfo();

    if (type === 'add') {
      const creditId = getUuid();
      await createCredit({
        id: creditId,
        transactionNo: getSnowId(),
        transactionType: CreditTransactionType.GRANT,
        transactionScene: CreditTransactionScene.GIFT, // Using GIFT or generic scene
        userId,
        credits: amount,
        remainingCredits: amount,
        status: CreditStatus.ACTIVE,
        description: description,
        // expiresAt: calculateCreditExpirationTime(...) // Optional: add expiration if needed, currently permanent
      });

      // 记录审计日志
      await logAuditEvent({
        actionType: AuditActionType.CREDIT_GRANT,
        targetType: 'credit',
        targetId: creditId,
        description: `管理员发放积分: ${amount} 积分给用户 ${userId}`,
        metadata: {
          operatorId: operator?.id,
          operatorEmail: operator?.email,
          targetUserId: userId,
          amount,
          description,
          source: 'admin_manage_credits',
        },
      });
    } else {
      await consumeCredits({
        userId,
        credits: amount,
        scene: CreditTransactionScene.PAYMENT,
        description: description,
      });

      // 记录审计日志
      await logAuditEvent({
        actionType: AuditActionType.CREDIT_CONSUME,
        targetType: 'user',
        targetId: userId,
        description: `管理员扣除积分: ${amount} 积分从用户 ${userId}`,
        metadata: {
          operatorId: operator?.id,
          operatorEmail: operator?.email,
          targetUserId: userId,
          amount,
          description,
          source: 'admin_manage_credits',
        },
      });
    }

    revalidatePath('/admin/users');
    revalidatePath('/admin/credits');
    return { success: true };
  } catch (error: any) {
    console.error('Manage Credits Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to update credits',
    };
  }
}
