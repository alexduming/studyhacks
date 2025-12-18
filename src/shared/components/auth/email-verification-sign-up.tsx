'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, ArrowRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Link } from '@/core/i18n/navigation';
import { defaultLocale } from '@/config/locale';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

import { SocialProviders } from '@/shared/blocks/sign/social-providers';

interface Props {
  configs: Record<string, string>;
  callbackUrl?: string;
}

export function EmailVerificationSignUp({ configs, callbackUrl = '/' }: Props) {
  const t = useTranslations('common');
  const router = useRouter();
  const locale = useLocale();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  // 检查并保存邀请码
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const invite = params.get('invite');
      if (invite) {
        // 保存邀请码到 sessionStorage，以便在后续步骤中使用
        sessionStorage.setItem('invite_code', invite.toUpperCase());
        console.log('✅ 保存邀请码到 sessionStorage:', invite);
      }
    }
  }, []);

  const isGoogleAuthEnabled = configs.google_auth_enabled === 'true';
  const isGithubAuthEnabled = configs.github_auth_enabled === 'true';
  const isEmailAuthEnabled =
    configs.email_auth_enabled !== 'false' ||
    (!isGoogleAuthEnabled && !isGithubAuthEnabled);

  const handleSendVerification = async () => {
    if (loading) return;

    if (!email || !email.trim()) {
      toast.error(t('email_verification.enter_email'));
      return;
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error(t('email_verification.enter_email'));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          type: 'registration',
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSentEmail(email);
        toast.success(t('email_verification.click_to_verify'));

        // 开发环境下显示调试链接
        if (data.debugUrl) {
          console.log('🔗 Development verification link:', data.debugUrl);
          toast.info(`Development verification link: ${data.debugUrl}`);
        }
      } else {
        toast.error(data.error || t('email_verification.error'));
      }
    } catch (error) {
      console.error('Send verification email error:', error);
      toast.error(t('email_verification.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = () => {
    // 社交登录逻辑可以在这里实现
    // 暂时跳转到原有的社交登录页面
    router.push('/sign-up');
  };

  if (callbackUrl) {
    if (
      locale !== defaultLocale &&
      callbackUrl.startsWith('/') &&
      !callbackUrl.startsWith(`/${locale}`)
    ) {
      callbackUrl = `/${locale}${callbackUrl}`;
    }
  }

  // 如果已经发送了验证邮件，显示等待页面
  if (sentEmail) {
    return (
      <Card className="mx-auto w-full md:max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Mail className="h-12 w-12 text-blue-500" />
          </div>
          <CardTitle className="text-lg md:text-xl">
            {t('email_verification.email_sent', { email: sentEmail })}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {t('email_verification.click_to_verify')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">{t('email_register.next_steps_title')}:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>{t('email_register.step_check_email')}</li>
              <li>{t('email_register.step_click_link')}</li>
              <li>{t('email_register.step_complete_setup')}</li>
            </ol>
            <p className="mt-3 text-xs text-blue-700">
              {t('email_register.spam_folder_note')}
            </p>
          </div>

          <div className="text-center space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSentEmail('')}
              disabled={loading}
            >
              {t('email_verification.resend_button')}
            </Button>
          </div>
        </CardContent>

        <CardFooter>
          <div className="flex w-full justify-center border-t py-4">
            <p className="text-center text-xs text-neutral-500">
              {t('sign.no_account')}
              <Link href="/sign-in" className="underline">
                <span className="cursor-pointer dark:text-white/70">
                  {t('sign.continue')}
                </span>
              </Link>
            </p>
          </div>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full md:max-w-md">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">
          <h1>{t('sign.sign_up_title')}</h1>
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          <h2>{t('sign.sign_up_description')}</h2>
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid gap-4">
          {isEmailAuthEnabled && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="email">{t('sign.email_title')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('sign.email_placeholder')}
                  required
                  onChange={(e) => setEmail(e.target.value)}
                  value={email}
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                onClick={handleSendVerification}
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    {t('email_verification.send_verification')}
                    <ArrowRight size={16} className="ml-2" />
                  </>
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t('sign.or')}
                  </span>
                </div>
              </div>
            </>
          )}

          <SocialProviders
            configs={configs}
            callbackUrl={callbackUrl}
            loading={loading}
            setLoading={setLoading}
            buttonText={t('social_auth.button_text')}
          />
        </div>
      </CardContent>

      <CardFooter>
        <div className="flex w-full justify-center border-t py-4">
          <p className="text-center text-xs text-neutral-500">
            {t('sign.already_have_account')}
            <Link href="/sign-in" className="underline">
              <span className="cursor-pointer dark:text-white/70">
                {t('sign.continue')}
              </span>
            </Link>
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}