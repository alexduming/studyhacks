import { getTranslations } from 'next-intl/server';

import { envConfigs } from '@/config';
import { defaultLocale } from '@/config/locale';
import { SignIn } from '@/shared/blocks/sign/sign-in';
import { getAllConfigs } from '@/shared/models/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const t = await getTranslations('common');

  return {
    title: `${t('sign.sign_in_title')} - ${t('metadata.title')}`,
    alternates: {
      canonical:
        locale !== defaultLocale
          ? `${envConfigs.app_url}/${locale}/sign-in`
          : `${envConfigs.app_url}/sign-in`,
    },
  };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  // 使用 getAllConfigs() 而不是 getConfigs()
  // getAllConfigs() 有完善的错误处理，数据库连接失败时会自动回退到环境变量配置
  // 这样可以避免页面因为数据库连接超时而返回 500 错误
  const configs = await getAllConfigs();

  return <SignIn configs={configs} callbackUrl={callbackUrl || '/'} />;
}
