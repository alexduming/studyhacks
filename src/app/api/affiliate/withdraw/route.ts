import { NextRequest, NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';
import { createWithdrawal, WithdrawalStatus, getUserWithdrawalStats } from '@/shared/models/withdrawal';
import { getUserCommissionStats } from '@/shared/models/commission';
import { getUuid } from '@/shared/lib/hash';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { amount, method, account } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid amount' },
        { status: 400 }
      );
    }

    if (!method || !account) {
      return NextResponse.json(
        { success: false, error: 'Missing withdrawal method or account' },
        { status: 400 }
      );
    }

    // Check balance
    const { paidAmount } = await getUserCommissionStats(user.id);
    const { totalWithdrawn, pendingWithdrawal } = await getUserWithdrawalStats(user.id);
    const availableBalance = paidAmount - totalWithdrawn - pendingWithdrawal;

    if (amount > availableBalance) {
      return NextResponse.json(
        { success: false, error: 'Insufficient balance' },
        { status: 400 }
      );
    }

    // Create withdrawal request
    const withdrawal = await createWithdrawal({
      id: getUuid(),
      userId: user.id,
      amount,
      currency: 'USD', // Default currency, consider getting from config or user preference
      status: WithdrawalStatus.PENDING,
      method,
      account,
    });

    return NextResponse.json({
      success: true,
      data: withdrawal,
    });
  } catch (error: any) {
    console.error('Failed to create withdrawal:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}





