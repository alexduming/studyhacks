import { NextRequest, NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';
import { getInvitations, getInvitationsCount, InvitationStatus } from '@/shared/models/invitation';

/**
 * 获取用户的邀请记录 API
 * 
 * 非程序员解释：
 * - 用户可以查看自己邀请了多少人
 * - 可以看到哪些邀请已被接受（有人注册了）
 * - 支持分页查询
 * 
 * 使用方法：
 * GET /api/invitation/list?page=1&limit=20&status=accepted
 * 需要用户登录
 */
export async function GET(request: NextRequest) {
  try {
    // 获取当前登录用户信息
    const user = await getUserInfo();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Please sign in first' },
        { status: 401 }
      );
    }

    // 获取查询参数
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const statusParam = searchParams.get('status');
    
    // 验证状态参数
    let status: InvitationStatus | undefined;
    if (statusParam) {
      if (Object.values(InvitationStatus).includes(statusParam as InvitationStatus)) {
        status = statusParam as InvitationStatus;
      }
    }

    // 查询邀请记录
    const invitations = await getInvitations({
      inviterId: user.id,
      status,
      page,
      limit,
    });

    // 查询总数
    const total = await getInvitationsCount({
      inviterId: user.id,
      status,
    });

    // 统计数据
    const acceptedCount = await getInvitationsCount({
      inviterId: user.id,
      status: InvitationStatus.ACCEPTED,
    });

    return NextResponse.json({
      success: true,
      data: {
        invitations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        stats: {
          total,
          accepted: acceptedCount,
        },
      },
    });
  } catch (error: any) {
    console.error('获取邀请记录失败:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get invitation list' },
      { status: 500 }
    );
  }
}

