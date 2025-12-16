'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

interface Props {
  status: 'loading' | 'success' | 'error';
  message: string;
  showResendButton?: boolean;
  email?: string;
}

export function EmailVerificationPage({
  status,
  message,
  showResendButton = false,
  email,
}: Props) {
  const t = useTranslations('common');
  const router = useRouter();
  const [resendLoading, setResendLoading] = useState(false);
  const [resendEmail, setResendEmail] = useState(email || '');
  const [resendMessage, setResendMessage] = useState('');

  const handleResendEmail = async () => {
    if (!resendEmail) {
      setResendMessage(t('email_verification.enter_email'));
      return;
    }

    setResendLoading(true);
    setResendMessage('');

    try {
      const response = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: resendEmail,
          type: 'registration',
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResendMessage(t('email_verification.email_sent', { email: resendEmail }));

        // 开发环境下显示调试链接
        if (data.debugUrl) {
          console.log('🔗 Development verification link:', data.debugUrl);
          setResendMessage(prev => prev + `\n\nDevelopment verification link: ${data.debugUrl}`);
        }
      } else {
        setResendMessage(data.error || t('email_verification.error'));
      }
    } catch (error) {
      console.error('Resend verification email error:', error);
      setResendMessage(t('email_verification.error'));
    } finally {
      setResendLoading(false);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-16 w-16 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-500" />;
      case 'error':
        return <XCircle className="h-16 w-16 text-red-500" />;
      default:
        return <Mail className="h-16 w-16 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'text-blue-600';
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {getStatusIcon()}
          </div>
          <CardTitle className="text-2xl">
            {status === 'loading' && t('email_verification.loading')}
            {status === 'success' && t('email_verification.success')}
            {status === 'error' && t('email_verification.error')}
          </CardTitle>
          <CardDescription className={`text-center ${getStatusColor()}`}>
            {message}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'success' && (
            <Button
              onClick={() => router.push('/sign-in')}
              className="w-full"
            >
              {t('email_verification.go_to_login')}
            </Button>
          )}

          {showResendButton && (
            <div className="space-y-4 pt-4 border-t">
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                {t('email_verification.resend_title')}
              </div>

              {!email && (
                <div className="space-y-2">
                  <Label htmlFor="resend-email">{t('email_verification.email_title')}</Label>
                  <Input
                    id="resend-email"
                    type="email"
                    placeholder={t('email_verification.email_placeholder')}
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                  />
                </div>
              )}

              <Button
                variant="outline"
                onClick={handleResendEmail}
                disabled={resendLoading}
                className="w-full"
              >
                {resendLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('email_verification.loading')}
                  </>
                ) : (
                  t('email_verification.resend_button')
                )}
              </Button>

              {resendMessage && (
                <div className={`text-sm text-center ${
                  resendMessage.includes(t('email_verification.email_sent')) ? 'text-green-600' : 'text-red-600'
                }`}>
                  {resendMessage}
                </div>
              )}
            </div>
          )}

          <div className="text-center pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => router.push('/sign-up')}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              {t('email_verification.back_to_register')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}