'use client';

import { useEffect, useState } from 'react';
import { Calendar, Check, Copy, Gift, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';

/**
 * 邀请页面
 *
 * 非程序员解释：
 * - 用户可以在这里获取自己的邀请码
 * - 查看邀请了多少人以及获得了多少积分奖励
 * - 分享邀请链接给朋友
 */
export default function InvitationPage() {
  const t = useTranslations('settings.invitation');
  const locale = useLocale();
  const [inviteCode, setInviteCode] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    accepted: 0,
    pending: 0,
    earnedCredits: 0,
  });
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载邀请码和统计信息
  useEffect(() => {
    loadInviteData();
  }, []);

  const loadInviteData = async () => {
    try {
      setLoading(true);

      // 获取邀请码
      const codeResponse = await fetch('/api/invitation/generate', {
        method: 'POST',
      });
      const codeData = await codeResponse.json();

      if (codeData.success) {
        setInviteCode(codeData.data.code);
        setInviteUrl(codeData.data.inviteUrl);
      }

      // 获取统计信息
      const statsResponse = await fetch('/api/invitation/stats');
      const statsData = await statsResponse.json();

      if (statsData.success) {
        setStats(statsData.data);
      }

      // 获取邀请列表
      const listResponse = await fetch('/api/invitation/list?limit=10');
      const listData = await listResponse.json();

      if (listData.success) {
        setInvitations(listData.data.invitations);
      }
    } catch (error) {
      console.error('加载邀请数据失败:', error);
      toast.error(t('load_error'));
    } finally {
      setLoading(false);
    }
  };

  // 复制邀请码
  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    toast.success(t('invite_code.copy_success'));
    setTimeout(() => setCopied(false), 2000);
  };

  // 复制邀请链接
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(inviteUrl);
    toast.success(t('invite_code.link_copy_success'));
  };

  // 格式化日期（支持多语言）
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const localeMap: Record<string, string> = {
      zh: 'zh-CN',
      en: 'en-US',
    };
    return new Date(dateString).toLocaleDateString(
      localeMap[locale] || 'en-US',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('page_title')}</h1>
            <p className="text-muted-foreground mt-2">
              {t('page_description')}
            </p>
          </div>
        </div>
        <div className="py-12 text-center">
          <p className="text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page_title')}</h1>
          <p className="text-muted-foreground mt-2">{t('page_description')}</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.successful_invitations')}
            </CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.accepted}</div>
            <p className="text-muted-foreground text-xs">
              {t('stats.total_invitations')} {stats.total} {t('stats.people')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.pending_invitations')}
            </CardTitle>
            <Calendar className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-muted-foreground text-xs">
              {t('stats.waiting_registration')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.earned_credits')}
            </CardTitle>
            <Gift className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.earnedCredits}</div>
            <p className="text-muted-foreground text-xs">
              {t('stats.invitation_reward')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 邀请码卡片 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('invite_code.title')}</CardTitle>
          <CardDescription>{t('invite_code.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 邀请码 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('invite_code.code_label')}
            </label>
            <div className="flex gap-2">
              <Input
                value={inviteCode}
                readOnly
                className="font-mono text-lg"
              />
              <Button
                onClick={handleCopyCode}
                variant="outline"
                size="icon"
                title={
                  copied ? t('invite_code.copied') : t('invite_code.copy_code')
                }
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* 邀请链接 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('invite_code.link_label')}
            </label>
            <div className="flex gap-2">
              <Input value={inviteUrl} readOnly className="text-sm" />
              <Button onClick={handleCopyUrl} variant="outline">
                <Copy className="mr-2 h-4 w-4" />
                {t('invite_code.copy_link')}
              </Button>
            </div>
          </div>

          {/* 说明 */}
          <div className="bg-muted rounded-lg p-4 text-sm">
            <h4 className="mb-2 font-medium">{t('rules.title')}</h4>
            <ul className="text-muted-foreground space-y-1">
              <li>• {t('rules.rule_1')}</li>
              <li>• {t('rules.rule_2')}</li>
              <li>• {t('rules.rule_3')}</li>
              <li>• {t('rules.rule_4')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* 邀请记录 */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('invitation_records.title')}</CardTitle>
            <CardDescription>
              {t('invitation_records.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {invitation.inviteeEmail ||
                        t('invitation_records.waiting_registration')}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {invitation.status === 'accepted'
                        ? `${t('invitation_records.accepted_time')}: ${formatDate(invitation.acceptedAt)}`
                        : `${t('invitation_records.created_time')}: ${formatDate(invitation.createdAt)}`}
                    </p>
                  </div>
                  <Badge
                    variant={
                      invitation.status === 'accepted'
                        ? 'default'
                        : invitation.status === 'pending'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {invitation.status === 'accepted'
                      ? t('invitation_records.status_accepted')
                      : invitation.status === 'pending'
                        ? t('invitation_records.status_pending')
                        : t('invitation_records.status_expired')}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
