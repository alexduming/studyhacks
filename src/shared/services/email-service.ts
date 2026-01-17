import { Resend } from 'resend';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export class EmailService {
  private static fromEmail =
    process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  private static fromName = process.env.RESEND_FROM_NAME || 'StudyHacks';

  private static getClient() {
    const apiKey = process.env.RESEND_API_KEY;
    // 构建时可能没有环境变量，提供一个占位符以防止构建失败
    // 在运行时如果没有 key，发送邮件会失败并被 catch 捕获
    return new Resend(apiKey || 're_missing_api_key');
  }

  /**
   * 发送验证链接邮件
   */
  static async sendVerificationLink(
    email: string,
    verificationUrl: string,
    type: 'registration' | 'password_reset' = 'registration'
  ): Promise<boolean> {
    try {
      console.log('🔧 邮件服务配置检查:');
      console.log('- API Key 存在:', !!process.env.RESEND_API_KEY);
      console.log('- From Email:', process.env.RESEND_FROM_EMAIL);
      console.log('- From Name:', process.env.RESEND_FROM_NAME);
      console.log('- Node Env:', process.env.NODE_ENV);

      const resend = this.getClient();
      const html = this.generateVerificationLinkEmailTemplate(
        verificationUrl,
        type
      );

      // 开发环境下在控制台显示链接，方便测试
      if (process.env.NODE_ENV === 'development') {
        console.log('='.repeat(50));
        console.log('📧 开发环境 - 验证链接信息');
        console.log('='.repeat(50));
        console.log(`收件人: ${email}`);
        console.log(`发件人: ${this.fromName} <${this.fromEmail}>`);
        console.log(
          `主题: ${type === 'registration' ? '验证您的邮箱地址' : '重置您的密码'} - StudyHacks`
        );
        console.log(`验证链接: ${verificationUrl}`);
        console.log('='.repeat(50));
        console.log(
          '请查收您的邮箱并点击链接完成验证，或在开发环境点击上述链接'
        );
        console.log('='.repeat(50));
      }

      try {
        const { data, error } = await resend.emails.send({
          from: `${this.fromName} <${this.fromEmail}>`,
          to: [email],
          subject:
            type === 'registration'
              ? '验证您的邮箱地址 - StudyHacks'
              : '重置您的密码 - StudyHacks',
          html,
        });

        if (error) {
          console.error('❌ Resend 邮件发送失败:', error);
          console.error('❌ 错误详情:', JSON.stringify(error, null, 2));
          return false;
        }

        console.log('✅ 验证链接邮件发送成功:', data);
        return true;
      } catch (networkError) {
        console.error('❌ Resend API 网络错误:', networkError);

        // 开发环境下即使邮件发送失败也返回true，方便测试
        if (process.env.NODE_ENV === 'development') {
          console.log('⚠️ 开发环境：邮件发送失败但允许继续测试');
          return true;
        }
        return false;
      }
    } catch (error) {
      console.error('❌ 邮件服务完全失败:', error);

      // 开发环境下返回true
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️ 开发环境：邮件服务异常但允许继续测试');
        return true;
      }
      return false;
    }
  }

  /**
   * 发送欢迎邮件
   */
  static async sendWelcomeEmail(
    email: string,
    name?: string
  ): Promise<boolean> {
    try {
      const resend = this.getClient();
      const html = this.generateWelcomeEmailTemplate(name);

      try {
        const { data, error } = await resend.emails.send({
          from: `${this.fromName} <${this.fromEmail}>`,
          to: [email],
          subject: '欢迎加入 Study! 🎉',
          html,
        });

        if (error) {
          console.error('❌ Resend 欢迎邮件发送失败:', error);
          return false;
        }

        console.log('✅ 欢迎邮件发送成功:', data);
        return true;
      } catch (networkError) {
        console.error('❌ Resend API 网络错误:', networkError);
        return false;
      }
    } catch (error) {
      console.error('❌ 邮件服务完全失败:', error);
      return false;
    }
  }

  /**
   * 生成验证链接邮件模板
   */
  private static generateVerificationLinkEmailTemplate(
    verificationUrl: string,
    type: 'registration' | 'password_reset' = 'registration'
  ): string {
    const isRegistration = type === 'registration';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${isRegistration ? '邮箱验证' : '密码重置'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #6366f1; }
            .verify-box { background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; }
            .button { display: inline-block; background: #6366f1; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0; font-size: 16px; }
            .button:hover { background: #4f46e5; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #6b7280; }
            .security-note { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">StudyHacks</div>
              <h1>${isRegistration ? '验证您的邮箱地址' : '重置您的密码'}</h1>
            </div>

            <p>您好！感谢您${isRegistration ? '注册' : '使用'} StudyHacks 服务。</p>

            ${
              isRegistration
                ? '<p>请点击下方按钮来完成您的邮箱验证，验证成功后您就可以设置密码并完成账户注册。</p>'
                : '<p>请点击下方按钮来重置您的密码。如果您没有请求重置密码，请忽略此邮件。</p>'
            }

            <div class="verify-box">
              <a href="${verificationUrl}" class="button">
                ${isRegistration ? '验证邮箱地址' : '重置密码'}
              </a>
              <p style="margin: 15px 0 0 0; color: #6b7280; font-size: 14px;">
                验证链接有效期为 24 小时
              </p>
            </div>

            <div class="security-note">
              <strong>安全提示：</strong>
              ${
                isRegistration
                  ? '此验证链接仅用于验证您的邮箱地址，请勿分享给他人。'
                  : '此密码重置链接仅限您本人使用，请勿分享给他人。'
              }
            </div>

            <p style="text-align: center; color: #6b7280; font-size: 14px; margin: 30px 0;">
              如果按钮无法点击，请复制以下链接到浏览器地址栏：<br>
              <span style="word-break: break-all; color: #6366f1;">${verificationUrl}</span>
            </p>

            <p style="color: #6b7280; font-size: 14px;">
              如果您没有${isRegistration ? '注册账户' : '请求重置密码'}，请忽略此邮件。
            </p>

            <div class="footer">
              <p>此邮件由 StudyHacks 自动发送，请勿回复。</p>
              <p>如有疑问，请联系我们的客服团队。</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * 生成欢迎邮件模板
   */
  private static generateWelcomeEmailTemplate(name?: string): string {
    const displayName = name || '用户';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>欢迎加入 Study</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #6366f1; }
            .welcome-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; }
            .features { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0; }
            .feature { background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #6b7280; }
            .button { display: inline-block; background: white; color: #6366f1; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">StudyHacks</div>
              <h1>欢迎加入我们！🎉</h1>
            </div>

            <div class="welcome-box">
              <h2>亲爱的 ${displayName}，</h2>
              <p style="font-size: 18px; margin: 20px 0;">
                欢迎加入 StudyHacks 大家庭！
              </p>
              <p>您的账户已经成功创建，现在可以开始探索我们的精彩内容了。</p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}" class="button">
                立即开始学习
              </a>
            </div>

            <h3 style="text-align: center; margin: 30px 0;">您可以享受的服务</h3>
            <div class="features">
              <div class="feature">
                <h4>📚 AI笔记助手</h4>
                <p>将讲座、视频和文档转换为智能笔记</p>
              </div>
              <div class="feature">
                <h4>🎯 智能闪卡</h4>
                <p>创建具有间隔重复功能的智能闪卡</p>
              </div>
              <div class="feature">
                <h4>👥 互动测验</h4>
                <p>通过自适应 AI 测验测试您的知识</p>
              </div>
              <div class="feature">
                <h4>🎖️ 信息图与幻灯片</h4>
                <p>一键生成可视化学习资料</p>
              </div>
            </div>

            <div class="footer">
              <p>感谢您选择 StudyHacks！</p>
              <p>如有任何问题，请随时联系我们。</p>
              <p style="margin-top: 20px;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/contact" style="color: #6366f1;">联系我们</a> |
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/help" style="color: #6366f1;">帮助中心</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
