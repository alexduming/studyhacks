import { NextResponse } from 'next/server';
import { and, eq, like, sum } from 'drizzle-orm';

import { db } from '@/core/db';
import { credit } from '@/config/db/schema';
import { CreditTransactionScene } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { getInvitationsCount } from '@/shared/models/invitation';
import { getUserCommissionStats } from '@/shared/models/commission';
import { getUserWithdrawalStats } from '@/shared/models/withdrawal';

/**
 * Get affiliate stats
 * 
 * Returns:
 * - total invitations
 * - total commissions (paid + pending)
 * - available balance (paid commissions - total withdrawn)
 * - total withdrawn
 * - earned credits (from registration rewards)
 */
export async function GET() {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 1. Invitation stats
    const totalInvitations = await getInvitationsCount({ inviterId: user.id });

    // 2. Commission stats
    const { totalAmount, pendingAmount, paidAmount } = await getUserCommissionStats(user.id);

    // 3. Withdrawal stats
    const { totalWithdrawn, pendingWithdrawal } = await getUserWithdrawalStats(user.id);

    // 4. Calculate balance
    const availableBalance = paidAmount - totalWithdrawn - pendingWithdrawal;

    // 5. Earned Credits stats (from registration rewards)
    const [creditStats] = await db()
      .select({ total: sum(credit.credits) })
      .from(credit)
      .where(
        and(
          eq(credit.userId, user.id),
          eq(credit.transactionScene, CreditTransactionScene.AWARD),
          like(credit.description, '%Invitation%')
        )
      );
    const earnedCredits = Number(creditStats?.total) || 0;

    return NextResponse.json({
      success: true,
      data: {
        totalInvitations,
        totalCommissions: totalAmount,
        pendingCommissions: pendingAmount,
        availableBalance: Math.max(0, availableBalance), // Ensure non-negative
        totalWithdrawn,
        pendingWithdrawal,
        earnedCredits, // Added earned credits
      },
    });
  } catch (error: any) {
    console.error('Failed to get affiliate stats:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
