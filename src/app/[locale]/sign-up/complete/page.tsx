import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { RegisterCompletePage } from '@/shared/components/auth/register-complete-page';

interface Props {
  searchParams: Promise<{
    email?: string;
    token?: string;
    verified?: string;
  }>;
}

export async function generateMetadata() {
  const t = await getTranslations('common');

  return {
    title: `完成注册 - ${t('metadata.title')}`,
  };
}

export default async function RegisterCompletePageWrapper({ searchParams }: Props) {
  const { email, token, verified } = await searchParams;

  // 验证必要参数
  if (!email || !token || verified !== 'true') {
    notFound();
  }

  return (
    <RegisterCompletePage
      email={email}
      token={token}
    />
  );
}