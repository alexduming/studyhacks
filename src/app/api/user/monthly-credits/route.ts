import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/db';
import { user } from '@/config/db/schema';
import { createCredit, CreditTransactionType, CreditStatus, CreditTransactionScene } from '@/shared/models/credit';
import { getUuid, getSnowId } from '@/shared/lib/hash';

/**
 * 月度积分重置API
 * 
 * 非程序员解释：
 * - 这个API用于在每月第一天为所有用户发放10个免费积分
 * - 积分有效期到当月最后一天
 * - 可以通过Vercel Cron定时任务自动调用
 * 
 * 使用方法：
 * 1. 在vercel.json中配置cron任务
 * 2. 或者手动调用此接口（需要验证授权）
 * 
 * 安全措施：
 * - 使用环境变量CRON_SECRET来验证请求
 * - 防止未授权的调用
 */

// 强制使用 Node.js 运行时
export const runtime = 'nodejs';
// 设置最大执行时间（对于大量用户可能需要更长时间）
export const maxDuration = 300; // 5分钟

export async function POST(request: NextRequest) {
  try {
    // 验证授权（防止未授权调用）
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'your-secret-key-change-in-production';
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('🎁 开始月度积分发放...');

    // 获取所有用户
    const database = db();
    const allUsers = await database.select().from(user);

    console.log(`📊 找到 ${allUsers.length} 个用户`);

    // 计算当月最后一天的23:59:59
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    // 为每个用户创建月度积分
    for (const u of allUsers) {
      try {
        await createCredit({
          id: getUuid(),
          userId: u.id,
          userEmail: u.email,
          transactionNo: getSnowId(),
          transactionType: CreditTransactionType.GRANT,
          transactionScene: CreditTransactionScene.GIFT,
          credits: 10, // 每月10个免费积分
          remainingCredits: 10,
          description: `Monthly free credits for ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
          expiresAt: lastDayOfMonth,
          status: CreditStatus.ACTIVE,
        });

        successCount++;
        console.log(`✅ 已为用户 ${u.email} 发放10积分`);
      } catch (error: any) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ userId: u.id, error: errorMessage });
        console.error(`❌ 为用户 ${u.email} 发放积分失败:`, errorMessage);
      }
    }

    console.log(`🎉 月度积分发放完成！成功: ${successCount}, 失败: ${errorCount}`);

    return NextResponse.json({
      success: true,
      message: 'Monthly credits distribution completed',
      stats: {
        totalUsers: allUsers.length,
        successCount,
        errorCount,
        creditsPerUser: 10,
        expiresAt: lastDayOfMonth.toISOString(),
      },
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('❌ 月度积分发放失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to distribute monthly credits',
      },
      { status: 500 }
    );
  }
}

/**
 * GET方法：用于健康检查和测试
 */
export async function GET(request: NextRequest) {
  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  
  return NextResponse.json({
    message: 'Monthly credits API is ready',
    currentDate: now.toISOString(),
    nextExpiration: lastDayOfMonth.toISOString(),
    info: 'Use POST method with Authorization header to distribute credits',
  });
}




