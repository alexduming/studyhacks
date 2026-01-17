import { NextRequest, NextResponse } from 'next/server';
import { EmailVerificationService } from '@/shared/services/email-verification-service';

export async function POST(request: NextRequest) {
  try {
    const { email, type = 'registration', inviteCode } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: '邮箱地址是必填项' },
        { status: 400 }
      );
    }

    const result = await EmailVerificationService.sendVerificationLink(email, type, inviteCode);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        expiresIn: result.data?.expiresIn,
        // 开发环境下返回验证链接，方便测试
        ...(process.env.NODE_ENV === 'development' && {
          debugUrl: result.data?.verificationUrl
        })
      });
    } else {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('发送验证链接 API 错误:', error);
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}