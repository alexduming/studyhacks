import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { EmailVerificationService } from '@/shared/services/email-verification-service';
import { EmailVerificationPage } from '@/shared/components/auth/email-verification-page';

interface Props {
  searchParams: Promise<{
    token?: string;
    email?: string;
  }>;
}

export async function generateMetadata() {
  const t = await getTranslations('common');

  return {
    title: `邮箱验证 - ${t('metadata.title')}`,
  };
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token, email } = await searchParams;

  // 如果没有token或email参数，显示错误页面
  if (!token || !email) {
    return (
      <EmailVerificationPage
        status="error"
        message="验证链接无效，请重新获取验证邮件"
        showResendButton={true}
      />
    );
  }

  try {
    // 验证token
    const result = await EmailVerificationService.verifyToken(token, email);

    if (!result.success) {
      return (
        <EmailVerificationPage
          status="error"
          message={result.message}
          showResendButton={true}
          email={email}
        />
      );
    }

    // 验证成功，返回注册完成页面组件
    const searchParamsObj = {
      email,
      verified: 'true',
      token
    };

    // 动态导入注册完成页面组件
    const { RegisterCompletePage } = await import('@/shared/components/auth/register-complete-page');

    return <RegisterCompletePage email={email} token={token} />;

  } catch (error) {
    console.error('邮箱验证错误:', error);
    return (
      <EmailVerificationPage
        status="error"
        message="验证过程中出现错误，请稍后重试"
        showResendButton={true}
        email={email}
      />
    );
  }
}