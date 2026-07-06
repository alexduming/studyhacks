import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';

import { db } from '@/core/db';
import { user, account } from '@/config/db/schema';
import { EmailVerificationService } from '@/shared/services/email-verification-service';
import { getUuid } from '@/shared/lib/hash';

// 使用 Node.js 运行时，保证可以安全调用外部 API 并使用环境变量
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { token, email, password } = await request.json();

    if (!token || !email || !password) {
      return NextResponse.json(
        { error: '令牌、邮箱和密码都是必填项' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: '密码长度至少为 6 位' },
        { status: 400 }
      );
    }

    // 先验证重置密码链接是否有效
    const verifyResult = await EmailVerificationService.verifyToken(
      token,
      email
    );

    if (!verifyResult.success) {
      return NextResponse.json(
        { error: verifyResult.message },
        { status: 400 }
      );
    }

    const database = db();

    // 查找用户
    const existingUsers = await database
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existingUsers.length === 0) {
      return NextResponse.json(
        { error: '该邮箱尚未注册账户' },
        { status: 400 }
      );
    }

    const existingUser = existingUsers[0];

    // 生成新密码哈希（使用 better-auth 的 hashPassword，保持兼容）
    const hashedPassword = await hashPassword(password);

    // 查找是否已有 credential 类型的 account
    const existingAccounts = await database
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, existingUser.id),
          eq(account.providerId, 'credential')
        )
      )
      .limit(1);

    if (existingAccounts.length > 0) {
      // 更新现有 account 的密码
      await database
        .update(account)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(account.id, existingAccounts[0].id));
    } else {
      // 没有 credential account，则创建一个新的
      const accountId = getUuid();
      await database.insert(account).values({
        id: accountId,
        accountId: email,
        providerId: 'credential',
        userId: existingUser.id,
        password: hashedPassword,
      });
    }

    return NextResponse.json({
      success: true,
      message: '密码重置成功，现在可以使用新密码登录了',
    });
  } catch (error) {
    console.error('重置密码 API 错误:', error);
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}


