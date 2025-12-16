import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';

import { EmailVerificationService } from '@/shared/services/email-verification-service';
import { db } from '@/core/db';
import { user, account } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';
import { createCredit, CreditTransactionType, CreditStatus, CreditTransactionScene } from '@/shared/models/credit';
import { getSnowId } from '@/shared/lib/hash';

// 强制使用 Node.js 运行时，因为需要使用 bcryptjs 和数据库操作
export const runtime = 'nodejs';

/**
 * 非程序员解释：
 * - 这个 API 路由用于处理邮箱验证后的用户注册
 * - 首先验证邮箱令牌，然后创建用户账户
 * - 使用服务端方法直接操作数据库，而不是使用客户端方法
 * - 修复了数据不一致问题：如果 user 已存在但缺少 account，会自动补全 account 记录
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, name, token } = await request.json();

    console.log(`📝 收到注册请求: email=${email}, name=${name}`);

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
    // 使用事务确保数据一致性：user 和 account 必须同时创建或同时失败
    const database = db();
    
    console.log(`🚀 开始处理数据库事务: email=${email}`);

    try {
      // 在事务中执行所有数据库操作，确保数据一致性
      const result = await database.transaction(async (tx) => {
        // 检查邮箱是否已存在
        const existingUser = await tx
          .select()
          .from(user)
          .where(eq(user.email, email))
          .limit(1);
        
        console.log(`🔍 检查用户是否存在: ${existingUser.length > 0 ? '是' : '否'}`);

        let userId: string;
        let newUser: typeof user.$inferSelect;
        let isNewUser = false;

        if (existingUser.length > 0) {
          // 用户已存在，检查是否有对应的 account 记录
          userId = existingUser[0].id;
          newUser = existingUser[0];

          // 检查是否已有 account 记录（用于邮箱密码登录）
          const existingAccount = await tx
            .select()
            .from(account)
            .where(
              and(
                eq(account.userId, userId),
                eq(account.providerId, 'credential')
              )
            )
            .limit(1);
          
          console.log(`🔍 检查 Account 是否存在: ${existingAccount.length > 0 ? '是' : '否'}`);

          if (existingAccount.length > 0) {
            // 用户已存在且已有 account 记录，说明已完整注册
            // 抛出错误，让事务回滚
            throw new Error('USER_ALREADY_EXISTS');
          }

          // 用户存在但没有 account 记录，这是数据不一致的情况
          // 我们需要补全 account 记录，让用户能够登录
          console.log(`⚠️ 检测到数据不一致：用户 ${email} 存在但缺少 account 记录，正在补全...`);

          // 更新用户信息（可能用户之前没有设置姓名）
          await tx
            .update(user)
            .set({
              name: name.trim(),
              emailVerified: true, // 确保邮箱已验证
              updatedAt: new Date(),
            })
            .where(eq(user.id, userId));

          // 重新获取更新后的用户信息
          const [updatedUser] = await tx
            .select()
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);
          
          if (updatedUser) {
            newUser = updatedUser;
          }
        } else {
          // 新用户，创建完整的用户记录
          isNewUser = true;
          userId = getUuid();
          
          console.log(`🆕 创建新用户: ${userId}`);

          // 创建用户记录
          const [createdUser] = await tx
            .insert(user)
            .values({
              id: userId,
              email,
              name: name.trim(),
              emailVerified: true, // 因为已经通过邮箱验证
            })
            .returning();
          
          newUser = createdUser;
        }

        // 哈希密码（使用 better-auth 的 hashPassword 函数，确保完全兼容）
        const hashedPassword = await hashPassword(password);

        // 创建或更新账户记录（存储密码）
        // 先检查是否已存在 account（可能由于之前的错误导致部分创建）
        const existingAccount = await tx
          .select()
          .from(account)
          .where(
            and(
              eq(account.userId, userId),
              eq(account.providerId, 'credential')
            )
          )
          .limit(1);

        if (existingAccount.length > 0) {
          // 更新现有 account 的密码
          await tx
            .update(account)
            .set({
              password: hashedPassword,
              updatedAt: new Date(),
            })
            .where(eq(account.id, existingAccount[0].id));
        } else {
          // 创建新的 account 记录
          console.log(`🔐 创建 Account 记录`);
          const accountId = getUuid();
          await tx.insert(account).values({
            id: accountId,
            accountId: email, // better-auth 使用邮箱作为 accountId
            providerId: 'credential', // better-auth 的邮箱密码提供者
            userId: userId,
            password: hashedPassword,
          });
        }

        return { userId, newUser, isNewUser };
      });

      const { userId, newUser, isNewUser } = result;

      // === 添加数据验证步骤 ===
      console.log(`🕵️‍♂️ 事务完成，正在验证数据写入情况...`);
      const verifyUser = await database.select().from(user).where(eq(user.id, userId)).limit(1);
      const verifyAccount = await database.select().from(account).where(and(eq(account.userId, userId), eq(account.providerId, 'credential'))).limit(1);

      if (verifyUser.length === 0) {
        console.error(`❌ 严重错误：事务成功但无法查询到 User 记录。UserID: ${userId}`);
        throw new Error('REGISTRATION_VERIFICATION_FAILED_USER');
      }

      if (verifyAccount.length === 0) {
        console.error(`❌ 严重错误：事务成功但无法查询到 Account 记录。UserID: ${userId}`);
        throw new Error('REGISTRATION_VERIFICATION_FAILED_ACCOUNT');
      }

      console.log(`✅ 数据验证通过：User 和 Account 均已存在`);
      // ========================

      // 只有新用户才赠送积分和发送欢迎邮件
      if (isNewUser) {
        /**
         * 赠送免费用户月度积分（10积分）
         * 
         * 非程序员解释：
         * - 每个新注册的用户都会获得10个AI积分
         * - 这些积分会在当月最后一天的23:59:59过期
         * - 下个月第一天会通过定时任务重新发放新的10积分
         * - 这样确保免费用户每月都有10积分可以体验AI功能
         */
        const now = new Date();
        // 计算当月最后一天的23:59:59
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        await createCredit({
          id: getUuid(),
          userId: userId,
          userEmail: email,
          transactionNo: getSnowId(),
          transactionType: CreditTransactionType.GRANT,
          transactionScene: CreditTransactionScene.GIFT, // 使用GIFT场景表示免费赠送
          credits: 10, // 免费用户每月10积分
          remainingCredits: 10,
          description: 'Monthly free credits for new user registration',
          expiresAt: lastDayOfMonth, // 当月最后一天过期
          status: CreditStatus.ACTIVE,
        });

        // 发送欢迎邮件（仅新用户）
        const { EmailService } = await import('@/shared/services/email-service');
        await EmailService.sendWelcomeEmail(email, name.trim());
      } else {
        // 对于补全 account 的已存在用户，记录日志但不发送邮件
        console.log(`✅ 已为用户 ${email} 补全 account 记录，现在可以正常登录了`);
      }

      return NextResponse.json({
        success: true,
        message: isNewUser ? '注册成功！' : '账户信息已更新，现在可以正常登录了！',
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
        },
        isNewUser, // 标识是否为新用户
      });

    } catch (dbError: any) {
      console.error('数据库错误:', dbError);

      // 处理用户已存在的情况（在事务中抛出的自定义错误）
      if (dbError.message === 'USER_ALREADY_EXISTS') {
        return NextResponse.json(
          { error: '该邮箱已被注册，请直接登录' },
          { status: 400 }
        );
      }

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