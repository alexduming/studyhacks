import { NextResponse } from 'next/server';

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

    return NextResponse.json({
      success: true,
      data: {
        total: totalCount,
        accepted: acceptedCount,
        pending: pendingCount,
        // 计算获得的积分奖励（每成功邀请1人获得100积分）
        earnedCredits: acceptedCount * 100,
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

