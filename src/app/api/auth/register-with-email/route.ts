import { NextRequest, NextResponse } from 'next/server';
import { EmailVerificationService } from '@/shared/services/email-verification-service';
import { signUp } from '@/core/auth/client';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, token } = await request.json();

    if (!email || !password || !name || !token) {
      return NextResponse.json(
        { error: '所有字段都是必填项' },
        { status: 400 }
      );
    }

    // 首先验证邮箱令牌
    const verificationResult = await EmailVerificationService.verifyToken(token, email);

    if (!verificationResult.success) {
      return NextResponse.json(
        { error: verificationResult.message },
        { status: 400 }
      );
    }

    // 邮箱验证通过，进行注册
    try {
      const user = await signUp.email({
        email,
        password,
        name,
      });

      // 发送欢迎邮件
      const { EmailService } = await import('@/shared/services/email-service');
      await EmailService.sendWelcomeEmail(email, name);

      return NextResponse.json({
        success: true,
        message: '注册成功！',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      });

    } catch (authError: any) {
      console.error('注册错误:', authError);

      // 处理Better Auth的错误
      if (authError.code === 'EMAIL_ALREADY_EXISTS') {
        return NextResponse.json(
          { error: '该邮箱已被注册' },
          { status: 400 }
        );
      } else if (authError.code === 'INVALID_PASSWORD') {
        return NextResponse.json(
          { error: '密码格式不正确' },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { error: authError.message || '注册失败，请稍后重试' },
          { status: 500 }
        );
      }
    }

  } catch (error) {
    console.error('注册 API 错误:', error);
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}