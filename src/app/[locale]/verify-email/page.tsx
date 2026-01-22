import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { EmailVerificationService } from '@/shared/services/email-verification-service';
import { EmailVerificationPage } from '@/shared/components/auth/email-verification-page';

/**
 * 非程序员解释：
 * 这是邮箱验证页面的服务器端组件
 * 
 * 为什么要这样设计：
 * 1. 服务器组件负责数据验证（检查token是否有效）
 * 2. 验证成功后重定向到客户端页面（而不是直接渲染客户端组件）
 * 3. 这样可以避免服务器/客户端组件混用导致的水合错误
 * 
 * 修复内容（2026-01-21）：
 * - 移除了在服务器组件中动态导入客户端组件的错误做法
 * - 改用 redirect 重定向到独立的注册完成页面
 * - 通过 URL 参数传递验证成功的信息
 */

interface Props {
  searchParams: Promise<{
    token?: string;
    email?: string;
    uemail?: string;
  }>;
}

export async function generateMetadata() {
  const t = await getTranslations('common');

  return {
    title: `${t('email_verification.page_title')} - ${t('metadata.title')}`,
  };
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token;
  // 支持 uemail 参数（兼容某些邮箱客户端的重命名行为）
  const email = params.email || params.uemail;
  const t = await getTranslations('common');

  console.log(`📧 收到邮箱验证请求: email=${email}, token=${token}`);

  // 如果没有token或email参数，显示错误页面
  if (!token || !email) {
    console.log('❌ 缺少必要参数: token或email为空');
    return (
      <EmailVerificationPage
        status="error"
        message={t('email_verification.invalid_link')}
        showResendButton={true}
      />
    );
  }

  try {
    // 在服务器端验证token
    console.log(`🔍 开始验证token...`);
    const result = await EmailVerificationService.verifyToken(token, email);

    if (!result.success) {
      console.log(`❌ 验证失败: ${result.message}`);
      return (
        <EmailVerificationPage
          status="error"
          message={result.message}
          showResendButton={true}
          email={email}
        />
      );
    }

    console.log(`✅ 验证成功，重定向到注册完成页面`);
    
    // 验证成功，重定向到注册完成页面
    // 使用 redirect 而不是动态导入客户端组件，避免水合错误
    redirect(`/sign-up/complete?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&verified=true`);

  } catch (error) {
    console.error('❌ 邮箱验证异常:', error);
    // 记录详细错误信息以便调试
    if (error instanceof Error) {
      console.error('错误详情:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    
    return (
      <EmailVerificationPage
        status="error"
        message={t('email_verification.error')}
        showResendButton={true}
        email={email}
      />
    );
  }
}