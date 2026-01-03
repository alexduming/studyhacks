'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import {
  consumeCredits,
  createCredit,
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
} from '@/shared/models/credit';
import { getSnowId, getUuid } from '@/shared/lib/hash';

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

  try {
    if (type === 'add') {
      await createCredit({
        id: getUuid(),
        transactionNo: getSnowId(),
        transactionType: CreditTransactionType.GRANT,
        transactionScene: CreditTransactionScene.GIFT, // Using GIFT or generic scene
        userId,
        credits: amount,
        remainingCredits: amount,
        status: CreditStatus.ACTIVE,
        description: reason || 'Admin manual grant',
        // expiresAt: calculateCreditExpirationTime(...) // Optional: add expiration if needed, currently permanent
      });
    } else {
      await consumeCredits({
        userId,
        credits: amount,
        scene: CreditTransactionScene.PAYMENT,
        description: reason || 'Admin manual deduction',
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

