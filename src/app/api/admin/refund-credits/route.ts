import { NextRequest, NextResponse } from 'next/server';
import { refundCredits } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';

export const runtime = 'nodejs';

/**
 * 管理员API：手动补偿积分
 *
 * 使用方法：
 * POST /api/admin/refund-credits
 * Body: {
 *   "userId": "用户ID",
 *   "credits": 6,
 *   "description": "补偿原因"
 * }
 *
 * 或者批量补偿：
 * POST /api/admin/refund-credits
 * Body: {
 *   "refunds": [
 *     { "userId": "user1", "credits": 6, "description": "任务失败补偿" },
 *     { "userId": "user2", "credits": 12, "description": "任务失败补偿" }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const currentUser = await getUserInfo();
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    // TODO: 添加管理员权限检查
    // 暂时允许所有登录用户执行（仅用于紧急补偿）

    const body = await request.json();

    // 单个补偿
    if (body.userId && body.credits) {
      const { userId, credits, description = 'Manual refund by admin' } = body;

      console.log(`[Admin Refund] 补偿 ${credits} 积分给用户 ${userId}`);

      await refundCredits({
        userId,
        credits,
        description,
      });

      return NextResponse.json({
        success: true,
        message: `成功补偿 ${credits} 积分给用户 ${userId}`,
      });
    }

    // 批量补偿
    if (body.refunds && Array.isArray(body.refunds)) {
      const results = [];

      for (const refund of body.refunds) {
        try {
          console.log(`[Admin Refund] 补偿 ${refund.credits} 积分给用户 ${refund.userId}`);

          await refundCredits({
            userId: refund.userId,
            credits: refund.credits,
            description: refund.description || 'Manual refund by admin',
          });

          results.push({
            userId: refund.userId,
            success: true,
            credits: refund.credits,
          });
        } catch (error: any) {
          console.error(`[Admin Refund] 失败:`, error);
          results.push({
            userId: refund.userId,
            success: false,
            error: error.message,
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const totalCredits = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.credits, 0);

      return NextResponse.json({
        success: true,
        message: `成功补偿 ${successCount}/${body.refunds.length} 个用户，总计 ${totalCredits} 积分`,
        results,
      });
    }

    return NextResponse.json(
      { success: false, error: '缺少必要参数' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('[Admin Refund] 错误:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
