import { NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';
import { getOrCreateUserInviteCode } from '@/shared/models/invitation';

/**
 * 生成或获取用户的邀请码 API
 * 
 * 非程序员解释：
 * - 用户登录后可以获取自己的专属邀请码
 * - 如果用户还没有邀请码，系统会自动生成一个
 * - 邀请码是永久有效的，可以分享给朋友
 * 
 * 使用方法：
 * POST /api/invitation/generate
 * 需要用户登录
 */
export async function POST() {
  try {
    // 获取当前登录用户信息
    const user = await getUserInfo();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Please sign in first' },
        { status: 401 }
      );
    }

    // 获取或创建用户的邀请码
    const inviteCode = await getOrCreateUserInviteCode(user.id, user.email);

    return NextResponse.json({
      success: true,
      data: {
        code: inviteCode,
        inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/sign-up?invite=${inviteCode}`,
      },
    });
  } catch (error: any) {
    console.error('生成邀请码失败:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate invite code' },
      { status: 500 }
    );
  }
}

/**
 * 获取用户的邀请码（GET方法）
 */
export async function GET() {
  return POST();
}

