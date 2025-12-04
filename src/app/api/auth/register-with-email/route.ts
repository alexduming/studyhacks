import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';

import { EmailVerificationService } from '@/shared/services/email-verification-service';
import { db } from '@/core/db';
import { user, account } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';

// 强制使用 Node.js 运行时，因为需要使用 bcryptjs 和数据库操作
export const runtime = 'nodejs';

/**
 * 非程序员解释：
 * - 这个 API 路由用于处理邮箱验证后的用户注册
 * - 首先验证邮箱令牌，然后创建用户账户
 * - 使用服务端方法直接操作数据库，而不是使用客户端方法
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, name, token } = await request.json();

    // 验证必填字段
    if (!email || !password || !name || !token) {
      return NextResponse.json(
        { error: '所有字段都是必填项' },
        { status: 400 }
      );
    }

    // 验证密码长度
    if (password.length < 6) {
      return NextResponse.json(
        { error: '密码长度至少为 6 位' },
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
    const database = db();
    
    try {
      // 检查邮箱是否已存在
      const existingUser = await database
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        return NextResponse.json(
          { error: '该邮箱已被注册' },
          { status: 400 }
        );
      }

      // 生成用户 ID
      const userId = getUuid();
      
      // 哈希密码（使用 bcryptjs，与 better-auth 兼容）
      const hashedPassword = await hash(password, 10);

      // 创建用户记录
      const [newUser] = await database
        .insert(user)
        .values({
          id: userId,
          email,
          name: name.trim(),
          emailVerified: true, // 因为已经通过邮箱验证
        })
        .returning();

      // 创建账户记录（存储密码）
      const accountId = getUuid();
      await database.insert(account).values({
        id: accountId,
        accountId: email, // better-auth 使用邮箱作为 accountId
        providerId: 'credential', // better-auth 的邮箱密码提供者
        userId: userId,
        password: hashedPassword,
      });

      // 发送欢迎邮件
      const { EmailService } = await import('@/shared/services/email-service');
      await EmailService.sendWelcomeEmail(email, name.trim());

      return NextResponse.json({
        success: true,
        message: '注册成功！',
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
        }
      });

    } catch (dbError: any) {
      console.error('数据库错误:', dbError);

      // 处理数据库唯一约束错误（邮箱重复）
      if (dbError.code === '23505' || dbError.message?.includes('unique')) {
        return NextResponse.json(
          { error: '该邮箱已被注册' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: '注册失败，请稍后重试' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('注册 API 错误:', error);
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}