import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { EmailVerificationService } from '@/shared/services/email-verification-service';
import { EmailVerificationPage } from '@/shared/components/auth/email-verification-page';

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

  // 如果没有token或email参数，显示错误页面
  if (!token || !email) {
    return (
      <EmailVerificationPage
        status="error"
        message={t('email_verification.invalid_link')}
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
    console.error('Email verification error:', error);
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