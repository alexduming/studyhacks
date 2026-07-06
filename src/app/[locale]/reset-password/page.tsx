'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react';
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

function ResetPasswordContent() {
  const t = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    const emailParam = searchParams.get('email');
    setToken(tokenParam);
    setEmail(emailParam);
    
    if (!tokenParam || !emailParam) {
      toast.error(t('reset_password.invalid_link'));
    }
  }, [searchParams, t]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !email) {
      toast.error(t('reset_password.invalid_link'));
      return;
    }

    if (password.length < 6) {
      toast.error(t('email_register.password_too_short'));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t('email_register.password_mismatch'));
      return;
    }

    setLoading(true);

    try {
      // 调用 better-auth 的重置密码 API
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        toast.success(t('reset_password.success'));
        
        // 3秒后跳转到登录页
        setTimeout(() => {
          router.push('/sign-in');
        }, 3000);
      } else {
        toast.error(data.error || t('reset_password.error'));
      }
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error(t('reset_password.error'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl">
              {t('reset_password.success_title')}
            </CardTitle>
            <CardDescription>
              {t('reset_password.success_description')}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Button
              onClick={() => router.push('/sign-in')}
              className="w-full"
            >
              {t('forgot_password.back_to_sign_in')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {t('reset_password.invalid_link')}
            </CardTitle>
            <CardDescription>
              {t('reset_password.link_expired')}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Button
              onClick={() => router.push('/forgot-password')}
              className="w-full"
            >
              {t('reset_password.request_new_link')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {t('reset_password.title')}
          </CardTitle>
          <CardDescription>
            {t('reset_password.description')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t('email_register.password_title')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('email_register.password_placeholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('email_register.confirm_password_title')}</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('email_register.confirm_password_placeholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                t('reset_password.reset_button')
              )}
            </Button>

            <div className="text-center pt-4 border-t">
              <button
                type="button"
                onClick={() => router.push('/sign-in')}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline"
              >
                {t('forgot_password.back_to_sign_in')}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

