import { db } from '@/core/db';
import { EmailService } from './email-service';
import { emailVerification } from '@/config/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// 验证链接配置
const VERIFICATION_CONFIG = {
  tokenLength: 32,
  expiresInHours: 24,
  maxAttempts: 3,
  cooldownMinutes: 1,
} as const;

export interface VerificationRequest {
  email: string;
  type: 'registration' | 'password_reset';
}

export interface VerificationResult {
  success: boolean;
  message: string;
  data?: any;
}

export class EmailVerificationService {

  /**
   * 生成验证令牌
   */
  private static generateToken(): string {
    return nanoid(VERIFICATION_CONFIG.tokenLength);
  }

  /**
   * 检查冷却时间
   */
  private static async checkCooldown(email: string): Promise<boolean> {
    try {
      const database = db();
      const existing = await database.select()
        .from(emailVerification)
        .where(eq(emailVerification.email, email))
        .limit(1);

      if (!existing[0]?.lastSentAt) return true;

      const cooldownEnd = new Date(existing[0].lastSentAt.getTime() + VERIFICATION_CONFIG.cooldownMinutes * 60 * 1000);
      return new Date() > cooldownEnd;
    } catch (error) {
      console.error('检查冷却时间失败:', error);
      return true; // 出错时允许发送
    }
  }

  /**
   * 发送验证链接
   */
  static async sendVerificationLink(email: string, type: 'registration' | 'password_reset' = 'registration', inviteCode?: string): Promise<VerificationResult> {
    try {
      console.log(`🚀 开始发送验证链接: email=${email}, type=${type}, inviteCode=${inviteCode || 'none'}`);

      // 验证邮箱格式
      if (!this.isValidEmail(email)) {
        console.log(`❌ 邮箱格式无效: ${email}`);
        return {
          success: false,
          message: '请输入有效的邮箱地址'
        };
      }

      // 检查冷却时间
      if (!await this.checkCooldown(email)) {
        console.log(`⏰ 冷却时间未到: ${email}`);
        return {
          success: false,
          message: `请等待 ${VERIFICATION_CONFIG.cooldownMinutes} 分钟后再次发送验证邮件`
        };
      }

      console.log(`✅ 通过验证，准备生成验证令牌: ${email}`);

      // 生成验证令牌
      const token = this.generateToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + VERIFICATION_CONFIG.expiresInHours * 60 * 60 * 1000);

      const database = db();

      // 删除该邮箱的旧验证记录
      await database.delete(emailVerification).where(eq(emailVerification.email, email));

      // 保存新的验证记录
      const verificationId = nanoid();
      await database.insert(emailVerification).values({
        id: verificationId,
        email,
        token,
        type,
        attempts: 0,
        isVerified: false,
        expiresAt,
        createdAt: now,
        lastSentAt: now,
        inviteCode: inviteCode ? inviteCode.toUpperCase() : null,
      });

      // 生成验证链接
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      // 根据不同类型生成不同的跳转路径
      // - registration: 走原有的邮箱验证 + 完成注册流程
      // - password_reset: 直接跳转到重置密码页面
      const path =
        type === 'password_reset' ? '/reset-password' : '/verify-email';
      const verificationUrl = `${baseUrl}${path}?token=${token}&email=${encodeURIComponent(
        email
      )}`;

      console.log('🔧 验证链接已生成:');
      console.log(`- 邮箱: ${email}`);
      console.log(`- 令牌: ${token}`);
      console.log(`- 验证链接: ${verificationUrl}`);

      // 发送邮件
      const emailSent = await EmailService.sendVerificationLink(email, verificationUrl, type);

      if (!emailSent) {
        return {
          success: false,
          message: '验证邮件发送失败，请稍后重试'
        };
      }

      return {
        success: true,
        message: `验证链接已发送至 ${email}，请查收邮件并点击链接完成验证`,
        data: {
          expiresIn: VERIFICATION_CONFIG.expiresInHours * 60 * 60, // 秒
          verificationUrl: process.env.NODE_ENV === 'development' ? verificationUrl : undefined,
        }
      };

    } catch (error) {
      console.error('发送验证链接错误:', error);
      return {
        success: false,
        message: '系统错误，请稍后重试'
      };
    }
  }

  /**
   * 验证邮箱令牌
   */
  static async verifyToken(token: string, email: string): Promise<VerificationResult> {
    try {
      console.log(`🔍 开始验证令牌: email=${email}, token=${token}`);

      const database = db();
      const verification = await database.select()
        .from(emailVerification)
        .where(eq(emailVerification.email, email))
        .limit(1);

      console.log(`🔍 找到的验证记录:`, verification[0]);

      // 检查验证记录是否存在
      if (!verification[0]) {
        return {
          success: false,
          message: '验证链接无效或已过期，请重新获取'
        };
      }

      const verificationRecord = verification[0];

      // 检查是否已验证
      if (verificationRecord.isVerified) {
        return {
          success: true,
          message: '邮箱已经验证过了',
          data: {
            email,
            verifiedAt: verificationRecord.verifiedAt,
          }
        };
      }

      // 检查令牌是否匹配
      if (verificationRecord.token !== token) {
        // 增加尝试次数
        await database.update(emailVerification)
          .set({ attempts: verificationRecord.attempts + 1 })
          .where(eq(emailVerification.email, email));

        return {
          success: false,
          message: `验证链接无效，还有 ${VERIFICATION_CONFIG.maxAttempts - verificationRecord.attempts - 1} 次尝试机会`
        };
      }

      // 检查是否过期
      if (new Date() > verificationRecord.expiresAt) {
        await database.delete(emailVerification).where(eq(emailVerification.email, email));
        return {
          success: false,
          message: '验证链接已过期，请重新获取'
        };
      }

      // 检查尝试次数
      if (verificationRecord.attempts >= VERIFICATION_CONFIG.maxAttempts) {
        await database.delete(emailVerification).where(eq(emailVerification.email, email));
        return {
          success: false,
          message: '验证失败次数过多，请重新获取验证链接'
        };
      }

      // 验证成功，标记为已验证
      const now = new Date();
      await database.update(emailVerification)
        .set({
          isVerified: true,
          verifiedAt: now,
          attempts: 0
        })
        .where(eq(emailVerification.email, email));

      return {
        success: true,
        message: '邮箱验证成功',
        data: {
          email,
          verifiedAt: now,
        }
      };

    } catch (error) {
      console.error('验证令牌错误:', error);
      return {
        success: false,
        message: '验证失败，请稍后重试'
      };
    }
  }

  /**
   * 获取验证记录中的邀请码
   */
  static async getInviteCode(email: string): Promise<string | null> {
    try {
      const database = db();
      const verification = await database.select()
        .from(emailVerification)
        .where(eq(emailVerification.email, email))
        .limit(1);

      return verification[0]?.inviteCode || null;
    } catch (error) {
      console.error('获取邀请码失败:', error);
      return null;
    }
  }

  /**
   * 检查邮箱是否已验证（用于注册流程）
   */
  static async isEmailVerified(email: string): Promise<boolean> {
    try {
      const database = db();
      const verification = await database.select()
        .from(emailVerification)
        .where(eq(emailVerification.email, email))
        .limit(1);

      return verification[0]?.isVerified || false;
    } catch (error) {
      console.error('检查邮箱验证状态失败:', error);
      return false;
    }
  }

  /**
   * 验证邮箱格式
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * 获取验证链接剩余时间（秒）
   */
  static async getRemainingTime(email: string): Promise<number> {
    try {
      const database = db();
      const verification = await database.select()
        .from(emailVerification)
        .where(eq(emailVerification.email, email))
        .limit(1);

      if (!verification[0]) return 0;

      const remaining = Math.floor((verification[0].expiresAt.getTime() - Date.now()) / 1000);
      return Math.max(0, remaining);
    } catch (error) {
      console.error('获取剩余时间失败:', error);
      return 0;
    }
  }

  /**
   * 获取下次发送时间（秒）
   */
  static async getNextSendTime(email: string): Promise<number> {
    try {
      const database = db();
      const verification = await database.select()
        .from(emailVerification)
        .where(eq(emailVerification.email, email))
        .limit(1);

      if (!verification[0]?.lastSentAt) return 0;

      const cooldownEnd = verification[0].lastSentAt.getTime() + VERIFICATION_CONFIG.cooldownMinutes * 60 * 1000;
      const remaining = Math.floor((cooldownEnd - Date.now()) / 1000);
      return Math.max(0, remaining);
    } catch (error) {
      console.error('获取下次发送时间失败:', error);
      return 0;
    }
  }
}

