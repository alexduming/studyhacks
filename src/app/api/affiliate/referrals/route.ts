import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc, count, sum } from 'drizzle-orm';

import { db } from '@/core/db';
import { order, user, invitation } from '@/config/db/schema';
import { getUserInfo } from '@/shared/models/user';
import { OrderStatus } from '@/shared/models/order';

/**
 * 获取分销员带来的付费用户列表
 *
 * 返回：
 * - 通过该分销员邀请码注册并付费的用户列表
 * - 每个用户的付费金额和订单数
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

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // 查询该分销员带来的付费订单
    // 通过 order.referrerId 关联
    const paidOrders = await db()
      .select({
        id: order.id,
        orderNo: order.orderNo,
        userId: order.userId,
        userEmail: order.userEmail,
        amount: order.amount,
        currency: order.currency,
        productName: order.productName,
        paidAt: order.paidAt,
        createdAt: order.createdAt,
      })
      .from(order)
      .where(
        and(
          eq(order.referrerId, currentUser.id),
          eq(order.status, OrderStatus.PAID)
        )
      )
      .orderBy(desc(order.paidAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // 统计总数
    const [countResult] = await db()
      .select({ count: count() })
      .from(order)
      .where(
        and(
          eq(order.referrerId, currentUser.id),
          eq(order.status, OrderStatus.PAID)
        )
      );

    // 统计总金额（按货币分组）
    const amountStats = await db()
      .select({
        currency: order.currency,
        totalAmount: sum(order.amount),
        orderCount: count(),
      })
      .from(order)
      .where(
        and(
          eq(order.referrerId, currentUser.id),
          eq(order.status, OrderStatus.PAID)
        )
      )
      .groupBy(order.currency);

    // 统计付费用户数（去重）
    const [uniqueUsersResult] = await db()
      .selectDistinct({ userId: order.userId })
      .from(order)
      .where(
        and(
          eq(order.referrerId, currentUser.id),
          eq(order.status, OrderStatus.PAID)
        )
      );

    // 获取唯一付费用户数
    const uniquePaidUsers = await db()
      .selectDistinctOn([order.userId], { userId: order.userId })
      .from(order)
      .where(
        and(
          eq(order.referrerId, currentUser.id),
          eq(order.status, OrderStatus.PAID)
        )
      );

    return NextResponse.json({
      success: true,
      data: {
        orders: paidOrders,
        total: countResult?.count || 0,
        uniquePaidUsers: uniquePaidUsers.length,
        amountStats,
        page,
        limit,
      },
    });
  } catch (error: any) {
    console.error('Failed to get referral stats:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
