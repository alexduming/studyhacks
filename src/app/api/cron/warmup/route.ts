import { NextRequest, NextResponse } from 'next/server';

import { getAllConfigs } from '@/shared/models/config';

/**
 * 函数预热 Cron Job
 *
 * 非程序员解释：
 * - 这个 API 用于保持 Vercel 函数实例活跃，避免冷启动
 * - 冷启动是指：长时间无人访问后，Vercel 会销毁函数实例
 * - 下次有人访问时，需要重新创建实例、建立数据库连接，可能导致超时
 * - 通过定期调用此接口，可以保持函数"热"状态，用户访问时响应更快
 *
 * 执行频率：每5分钟一次（由 vercel.json 中的 cron 配置）
 * 预计消耗：每月约 8,640 次函数调用（在 Vercel 免费额度内）
 */

// 强制使用 Node.js 运行时
export const runtime = 'nodejs';
// 设置较短的执行时间（预热不需要太长）
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 执行一次数据库查询，预热数据库连接池
    // 这会触发 getAllConfigs 内部的缓存机制，后续请求会更快
    const configs = await getAllConfigs();
    const configCount = Object.keys(configs).length;

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: 'Warmup completed',
      stats: {
        duration: `${duration}ms`,
        configsLoaded: configCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // 即使预热失败也返回 200，避免 Vercel 重试
    // 预热失败不是致命错误，只是意味着下次用户请求可能稍慢
    return NextResponse.json({
      success: false,
      message: 'Warmup failed (non-critical)',
      stats: {
        duration: `${duration}ms`,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
