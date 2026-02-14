import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc, count, sum, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { order, user, commission, withdrawal } from '@/config/db/schema';
import { getUserInfo } from '@/shared/models/user';
import { OrderStatus } from '@/shared/models/order';

/**
 * 管理后台：获取所有分销员业绩统计
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

    // 查询所有有推荐订单的用户（分销员）
    const affiliates = await db()
      .select({
        referrerId: order.referrerId,
        totalOrders: count(),
        totalAmount: sum(order.amount),
      })
      .from(order)
      .where(
        and(
          sql`${order.referrerId} IS NOT NULL`,
          eq(order.status, OrderStatus.PAID)
        )
      )
      .groupBy(order.referrerId)
      .orderBy(desc(sum(order.amount)))
      .limit(limit)
      .offset((page - 1) * limit);

    // 获取分销员详细信息
    const affiliateDetails = await Promise.all(
      affiliates.map(async (aff) => {
        if (!aff.referrerId) return null;

        // 获取用户信息
        const [userInfo] = await db()
          .select({ id: user.id, email: user.email, name: user.name })
          .from(user)
          .where(eq(user.id, aff.referrerId));

        // 获取佣金统计
        const [commStats] = await db()
          .select({
            totalCommission: sum(commission.amount),
            paidCommission: sql<number>`SUM(CASE WHEN ${commission.status} = 'paid' THEN ${commission.amount} ELSE 0 END)`,
          })
          .from(commission)
          .where(eq(commission.userId, aff.referrerId));

        // 获取提现统计
        const [wdStats] = await db()
          .select({
            totalWithdrawn: sql<number>`SUM(CASE WHEN ${withdrawal.status} = 'paid' THEN ${withdrawal.amount} ELSE 0 END)`,
            pendingWithdrawal: sql<number>`SUM(CASE WHEN ${withdrawal.status} = 'pending' THEN ${withdrawal.amount} ELSE 0 END)`,
          })
          .from(withdrawal)
          .where(eq(withdrawal.userId, aff.referrerId));

        // 获取唯一付费用户数
        const uniqueUsers = await db()
          .selectDistinctOn([order.userId], { userId: order.userId })
          .from(order)
          .where(
            and(
              eq(order.referrerId, aff.referrerId),
              eq(order.status, OrderStatus.PAID)
            )
          );

        return {
          user: userInfo,
          totalOrders: Number(aff.totalOrders) || 0,
          totalAmount: Number(aff.totalAmount) || 0,
          uniquePaidUsers: uniqueUsers.length,
          totalCommission: Number(commStats?.totalCommission) || 0,
          paidCommission: Number(commStats?.paidCommission) || 0,
          totalWithdrawn: Number(wdStats?.totalWithdrawn) || 0,
          pendingWithdrawal: Number(wdStats?.pendingWithdrawal) || 0,
        };
      })
    );

    // 过滤掉 null 值
    const validAffiliates = affiliateDetails.filter((a) => a !== null);

    // 统计总数
    const [totalCount] = await db()
      .select({ count: sql<number>`COUNT(DISTINCT ${order.referrerId})` })
      .from(order)
      .where(
        and(
          sql`${order.referrerId} IS NOT NULL`,
          eq(order.status, OrderStatus.PAID)
        )
      );

    return NextResponse.json({
      success: true,
      data: {
        affiliates: validAffiliates,
        total: Number(totalCount?.count) || 0,
        page,
        limit,
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
