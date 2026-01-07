'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Mail, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

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
import { Link } from '@/core/i18n/navigation';

export default function ForgotPasswordPage() {
  const t = useTranslations('common');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast.error(t('email_verification.enter_email'));
      return;
    }

    setLoading(true);

    try {
      // 调用 better-auth 的密码重置 API
      const response = await fetch('/api/auth/forget-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSent(true);
        toast.success(t('forgot_password.email_sent'));
      } else {
        toast.error(data.error || t('forgot_password.error'));
      }
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error(t('forgot_password.error'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl">
              {t('forgot_password.check_email')}
            </CardTitle>
            <CardDescription>
              {t('forgot_password.email_sent_description', { email })}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {t('forgot_password.check_spam')}
              </p>
            </div>

            <div className="text-center space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSent(false)}
                className="w-full"
              >
                {t('forgot_password.try_another_email')}
              </Button>
              
              <div className="pt-4 border-t">
                <Link href="/sign-in" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline">
                  {t('forgot_password.back_to_sign_in')}
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Mail className="h-12 w-12 text-blue-500" />
          </div>
          <CardTitle className="text-2xl">
            {t('forgot_password.title')}
          </CardTitle>
          <CardDescription>
            {t('forgot_password.description')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('sign.email_title')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('sign.email_placeholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('email_verification.loading')}
                </>
              ) : (
                t('forgot_password.send_reset_link')
              )}
            </Button>

            <div className="text-center pt-4 border-t">
              <Link href="/sign-in" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline">
                {t('forgot_password.back_to_sign_in')}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

