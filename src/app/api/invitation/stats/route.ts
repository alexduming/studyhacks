import { NextResponse } from 'next/server';
import { and, eq, like, sum } from 'drizzle-orm';

import { db } from '@/core/db';
import { credit } from '@/config/db/schema';
import { CreditTransactionScene } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { getInvitationsCount, InvitationStatus } from '@/shared/models/invitation';

/**
 * 获取用户的邀请统计信息 API
 * 
 * 非程序员解释：
 * - 显示用户邀请的总人数和成功邀请的人数
 * - 用于在前端页面显示邀请成果
 * 
 * 使用方法：
 * GET /api/invitation/stats
 * 需要用户登录
 */
export async function GET() {
  try {
    // 获取当前登录用户信息
    const user = await getUserInfo();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Please sign in first' },
        { status: 401 }
      );
    }

    // 统计各种状态的邀请数量
    const totalCount = await getInvitationsCount({
      inviterId: user.id,
    });

    const acceptedCount = await getInvitationsCount({
      inviterId: user.id,
      status: InvitationStatus.ACCEPTED,
    });

    const pendingCount = await getInvitationsCount({
      inviterId: user.id,
      status: InvitationStatus.PENDING,
    });

    // 统计获得的积分奖励（从积分表直接查询，以确保数据准确）
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
        total: totalCount,
        accepted: acceptedCount,
        pending: pendingCount,
        earnedCredits,
      },
    });
  } catch (error: any) {
    console.error('获取邀请统计失败:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get invitation stats' },
      { status: 500 }
    );
  }
}

