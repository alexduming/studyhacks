import { NextRequest, NextResponse } from 'next/server';

import { EmailVerificationService } from '@/shared/services/email-verification-service';

// 使用 Node.js 运行时，保证可以安全调用外部 API 并使用环境变量
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: '邮箱为必填项' },
        { status: 400 }
      );
    }

    // 发送密码重置类型的验证邮件
    const result = await EmailVerificationService.sendVerificationLink(
      email,
      'password_reset'
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('忘记密码 API 错误:', error);
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}


