import { NextResponse } from 'next/server';
import { toNextJsHandler } from 'better-auth/next-js';

import { getAuth } from '@/core/auth';

export async function POST(request: Request) {
  try {
    const auth = await getAuth();
    const handler = toNextJsHandler(auth.handler);
    return handler.POST(request);
  } catch (error) {
    // 静默处理 auth 初始化错误（通常是数据库连接问题）
    // 只在开发环境显示详细错误
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (isDevelopment) {
      const shouldLog = Math.random() < 0.1; // 10% 的概率打印
      if (shouldLog) {
        console.warn('[Auth] 初始化失败（已抑制部分重复日志）:', error);
      }
    }

    // 返回 500 错误，但不暴露详细错误信息
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getAuth();
    const handler = toNextJsHandler(auth.handler);
    return handler.GET(request);
  } catch (error) {
    // 静默处理 auth 初始化错误（通常是数据库连接问题）
    // 只在开发环境显示详细错误
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (isDevelopment) {
      const shouldLog = Math.random() < 0.1; // 10% 的概率打印
      if (shouldLog) {
        console.warn('[Auth] 初始化失败（已抑制部分重复日志）:', error);
      }
    }

    // 返回 500 错误，但不暴露详细错误信息
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 }
    );
  }
}
