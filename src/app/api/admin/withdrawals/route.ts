import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc, count } from 'drizzle-orm';

import { db } from '@/core/db';
import { withdrawal, user } from '@/config/db/schema';
import { getUserInfo } from '@/shared/models/user';

/**
 * 管理后台：获取所有提现申请
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getUserInfo();
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // TODO: 添加管理员权限检查

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');

    // 构建查询条件
    const conditions = status && status !== 'all' ? eq(withdrawal.status, status) : undefined;

    // 查询提现申请
    const withdrawals = await db()
      .select({
        id: withdrawal.id,
        userId: withdrawal.userId,
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        status: withdrawal.status,
        method: withdrawal.method,
        account: withdrawal.account,
        note: withdrawal.note,
        createdAt: withdrawal.createdAt,
        processedAt: withdrawal.processedAt,
        userEmail: user.email,
        userName: user.name,
      })
      .from(withdrawal)
      .leftJoin(user, eq(withdrawal.userId, user.id))
      .where(conditions)
      .orderBy(desc(withdrawal.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // 统计总数
    const [totalCount] = await db()
      .select({ count: count() })
      .from(withdrawal)
      .where(conditions);

    return NextResponse.json({
      success: true,
      data: {
        withdrawals,
        total: totalCount?.count || 0,
        page,
        limit,
      },
    });
  } catch (error: any) {
    console.error('Failed to get withdrawals:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * 管理后台：审批提现申请
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getUserInfo();
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // TODO: 添加管理员权限检查

    const { id, action, note } = await request.json();

    if (!id || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 验证 action
    if (!['approve', 'reject', 'pay'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }

    // 获取提现申请
    const [wd] = await db()
      .select()
      .from(withdrawal)
      .where(eq(withdrawal.id, id));

    if (!wd) {
      return NextResponse.json(
        { success: false, error: 'Withdrawal not found' },
        { status: 404 }
      );
    }

    // 根据 action 更新状态
    let newStatus = wd.status;
    if (action === 'approve') {
      newStatus = 'approved';
    } else if (action === 'reject') {
      newStatus = 'rejected';
    } else if (action === 'pay') {
      newStatus = 'paid';
    }

    // 更新提现申请
    const [updated] = await db()
      .update(withdrawal)
      .set({
        status: newStatus,
        note: note || wd.note,
        processedAt: new Date(),
      })
      .where(eq(withdrawal.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    console.error('Failed to process withdrawal:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
