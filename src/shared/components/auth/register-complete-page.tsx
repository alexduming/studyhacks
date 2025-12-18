'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react';
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
import { toast } from 'sonner';

interface Props {
  email: string;
  token: string;
}

export function RegisterCompletePage({ email, token }: Props) {
  const t = useTranslations('common');
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  // 从 URL 或 sessionStorage 中获取邀请码
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const inviteFromUrl = params.get('invite');
      
      if (inviteFromUrl) {
        // 如果 URL 中有，优先使用 URL 中的，并更新 sessionStorage
        const code = inviteFromUrl.toUpperCase();
        setInviteCode(code);
        sessionStorage.setItem('invite_code', code);
      } else {
        // 如果 URL 中没有，尝试从 sessionStorage 读取
        const inviteFromStorage = sessionStorage.getItem('invite_code');
        if (inviteFromStorage) {
          setInviteCode(inviteFromStorage);
        }
      }
    }
  }, []);

  const handleRegister = async () => {
    if (loading) return;

    // 验证表单
    if (!name.trim()) {
      toast.error(t('email_register.all_fields_required'));
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
      console.log('🚀 [Frontend] 开始调用注册 API', { email, name: name.trim() });
      
      const response = await fetch('/api/auth/register-with-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          name: name.trim(),
          token,
          inviteCode: inviteCode.trim() || undefined,
        }),
      });

      console.log('📡 [Frontend] API 响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [Frontend] API 返回错误:', errorText);
        throw new Error(`API 返回错误: ${response.status}`);
      }

      const data = await response.json();
      console.log('📦 [Frontend] API 返回数据:', data);

      if (data.success) {
        console.log('✅ [Frontend] 注册成功，准备跳转');
        
        // 注册成功后清除 sessionStorage 中的邀请码
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('invite_code');
        }

        toast.success(t('email_register.welcome_title'));
        // 跳转到登录页面或用户仪表板
        router.push('/sign-in');
      } else {
        console.error('❌ [Frontend] 注册失败:', data.error);
        toast.error(data.error || t('email_register.registering'));
      }
    } catch (error) {
      console.error('❌ [Frontend] 注册异常:', error);
      toast.error(t('email_register.registering'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-12 w-12 text-green-500" />
          </div>
          <CardTitle className="text-2xl">
            {t('email_register.page_title')}
          </CardTitle>
          <CardDescription>
            {t('email_register.subtitle', { email })}
            <br />
            {t('email_register.instruction')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('email_register.name_title')}</Label>
            <Input
              id="name"
              type="text"
              placeholder={t('email_register.name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

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
            <Label htmlFor="confirm-password">{t('email_register.confirm_password_title')}</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('email_register.confirm_password_placeholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-code">
              {t('email_register.invite_code_title')} <span className="text-xs text-muted-foreground">({t('email_register.invite_code_optional')})</span>
            </Label>
            <Input
              id="invite-code"
              type="text"
              placeholder={t('email_register.invite_code_placeholder')}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              disabled={loading}
              maxLength={8}
            />
            <p className="text-xs text-muted-foreground">
              {t('email_register.invite_code_description')}
            </p>
          </div>

          <Button
            onClick={handleRegister}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('email_register.registering')}
              </>
            ) : (
              t('email_register.register_button')
            )}
          </Button>

          <div className="text-center pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => router.push('/sign-in')}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              {t('email_register.back_to_login')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}