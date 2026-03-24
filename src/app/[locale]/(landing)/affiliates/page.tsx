'use client';

import { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  Copy,
  DollarSign,
  Gift,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';

/**
 * 分销员页面（教练计划）
 *
 * 功能：
 * - 显示邀请码和邀请链接
 * - 统计邀请人数、付费用户数、佣金收入
 * - 查看邀请记录、佣金记录、提现记录
 * - 申请提现
 */
export default function AffiliatesPage() {
  const t = useTranslations('affiliates');
  const locale = useLocale();

  // 状态
  const [inviteCode, setInviteCode] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // 统计数据
  const [stats, setStats] = useState({
    totalInvitations: 0,
    totalCommissions: 0,
    pendingCommissions: 0,
    availableBalance: 0,
    totalWithdrawn: 0,
    pendingWithdrawal: 0,
    earnedCredits: 0,
  });

  // 付费用户统计
  const [referralStats, setReferralStats] = useState({
    uniquePaidUsers: 0,
    totalOrders: 0,
    amountStats: [] as any[],
  });

  // 列表数据
  const [invitations, setInvitations] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [paidOrders, setPaidOrders] = useState<any[]>([]);

  // 提现对话框
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('paypal');
  const [withdrawing, setWithdrawing] = useState(false);
  // 不同提现方式的账户信息
  const [paypalEmail, setPaypalEmail] = useState('');
  const [alipayAccount, setAlipayAccount] = useState('');
  const [alipayName, setAlipayName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  // 加载数据
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadInviteCode(),
        loadStats(),
        loadReferralStats(),
        loadInvitations(),
        loadCommissions(),
        loadWithdrawals(),
      ]);
    } catch (error) {
      console.error('Load data failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取邀请码
  const loadInviteCode = async () => {
    const response = await fetch('/api/invitation/generate', {
      method: 'POST',
    });
    const data = await response.json();
    if (data.success) {
      setInviteCode(data.data.code);
      setInviteUrl(data.data.inviteUrl);
    }
  };

  // 获取统计数据
  const loadStats = async () => {
    const response = await fetch('/api/affiliate/stats');
    const data = await response.json();
    if (data.success) {
      setStats(data.data);
    }
  };

  // 获取付费用户统计
  const loadReferralStats = async () => {
    const response = await fetch('/api/affiliate/referrals');
    const data = await response.json();
    if (data.success) {
      setReferralStats({
        uniquePaidUsers: data.data.uniquePaidUsers || 0,
        totalOrders: data.data.total || 0,
        amountStats: data.data.amountStats || [],
      });
      setPaidOrders(data.data.orders || []);
    }
  };

  // 获取邀请列表
  const loadInvitations = async () => {
    const response = await fetch('/api/affiliate/invitations?limit=20');
    const data = await response.json();
    if (data.success) {
      setInvitations(data.data.invitations || []);
    }
  };

  // 获取佣金记录
  const loadCommissions = async () => {
    const response = await fetch('/api/affiliate/commissions?limit=20');
    const data = await response.json();
    if (data.success) {
      setCommissions(data.data.records || []);
    }
  };

  // 获取提现记录
  const loadWithdrawals = async () => {
    const response = await fetch('/api/affiliate/withdrawals?limit=20');
    const data = await response.json();
    if (data.success) {
      setWithdrawals(data.data.records || []);
    }
  };

  // 复制邀请链接
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success(t('invite_card.copy_button') + ' ✓');
    setTimeout(() => setCopied(false), 2000);
  };

  // 提交提现申请
  const handleWithdraw = async () => {
    // 根据提现方式验证必填字段
    let accountData: Record<string, string> = {};
    let isValid = true;

    if (withdrawMethod === 'paypal') {
      if (!paypalEmail) isValid = false;
      accountData = { email: paypalEmail };
    } else if (withdrawMethod === 'alipay') {
      if (!alipayName || !alipayAccount) isValid = false;
      accountData = { name: alipayName, account: alipayAccount };
    } else if (withdrawMethod === 'bank_transfer') {
      if (!bankAccountName || !bankAccountNumber || !bankName || !bankBranch)
        isValid = false;
      accountData = {
        name: bankAccountName,
        accountNumber: bankAccountNumber,
        bankName: bankName,
        branch: bankBranch,
      };
    }

    if (!withdrawAmount || !isValid) {
      toast.error(t('messages.fill_complete'));
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error(t('messages.invalid_amount'));
      return;
    }

    if (amount > stats.availableBalance / 100) {
      toast.error(t('messages.exceed_balance'));
      return;
    }

    try {
      setWithdrawing(true);
      const response = await fetch('/api/affiliate/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.floor(amount * 100), // 转换为分
          currency: 'usd',
          method: withdrawMethod,
          account: JSON.stringify(accountData), // 结构化账户信息
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(t('messages.withdraw_success'));
        setWithdrawDialogOpen(false);
        // 重置所有表单字段
        setWithdrawAmount('');
        setPaypalEmail('');
        setAlipayName('');
        setAlipayAccount('');
        setBankAccountName('');
        setBankAccountNumber('');
        setBankName('');
        setBankBranch('');
        loadStats();
        loadWithdrawals();
      } else {
        toast.error(data.error || t('messages.withdraw_error'));
      }
    } catch (error) {
      toast.error(t('messages.withdraw_error'));
    } finally {
      setWithdrawing(false);
    }
  };

  // 格式化金额
  const formatAmount = (amount: number, currency: string) => {
    const value = amount / 100;
    if (currency.toLowerCase() === 'cny') {
      return `¥${value.toFixed(2)}`;
    }
    return `$${value.toFixed(2)}`;
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const localeMap: Record<string, string> = { zh: 'zh-CN', en: 'en-US' };
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
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
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
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('description')}</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* 邀请人数 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.invitations.title')}
            </CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInvitations}</div>
            <p className="text-muted-foreground text-xs">
              {t('stats.invitations.subtitle')}
            </p>
          </CardContent>
        </Card>

        {/* 付费用户 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.paid_users.title')}
            </CardTitle>
            <TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {referralStats.uniquePaidUsers}
            </div>
            <p className="text-muted-foreground text-xs">
              {t('stats.paid_users.subtitle', {
                count: referralStats.totalOrders,
              })}
            </p>
          </CardContent>
        </Card>

        {/* 总佣金 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.total_commission.title')}
            </CardTitle>
            <DollarSign className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatAmount(stats.totalCommissions, 'usd')}
            </div>
            <p className="text-muted-foreground text-xs">
              {t('stats.total_commission.withdrawn', {
                amount: formatAmount(stats.totalWithdrawn, 'usd'),
              })}
            </p>
          </CardContent>
        </Card>

        {/* 可提现余额 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.available.title')}
            </CardTitle>
            <Wallet className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatAmount(stats.availableBalance, 'usd')}
            </div>
            <Dialog
              open={withdrawDialogOpen}
              onOpenChange={setWithdrawDialogOpen}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={stats.availableBalance <= 0}
                >
                  {t('reward_card.withdraw_button')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {t('reward_card.withdraw_dialog.title')}
                  </DialogTitle>
                  <DialogDescription>
                    {t('reward_card.withdraw_dialog.description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>
                      {t('reward_card.withdraw_dialog.amount_label')}
                    </Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                    />
                    <p className="text-muted-foreground text-xs">
                      {t('reward_card.available_balance', {
                        amount: formatAmount(stats.availableBalance, 'usd'),
                      })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {t('reward_card.withdraw_dialog.method_label')}
                    </Label>
                    <Select
                      value={withdrawMethod}
                      onValueChange={setWithdrawMethod}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paypal">
                          {t('reward_card.withdraw_methods.paypal')}
                        </SelectItem>
                        <SelectItem value="alipay">
                          {t('reward_card.withdraw_methods.alipay')}
                        </SelectItem>
                        <SelectItem value="bank_transfer">
                          {t('reward_card.withdraw_methods.bank_transfer')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* PayPal 表单字段 */}
                  {withdrawMethod === 'paypal' && (
                    <div className="space-y-2">
                      <Label>
                        {t('reward_card.withdraw_dialog.paypal_email_label')}
                      </Label>
                      <Input
                        type="email"
                        placeholder={t(
                          'reward_card.withdraw_dialog.paypal_placeholder'
                        )}
                        value={paypalEmail}
                        onChange={(e) => setPaypalEmail(e.target.value)}
                      />
                    </div>
                  )}

                  {/* 支付宝表单字段 */}
                  {withdrawMethod === 'alipay' && (
                    <>
                      <div className="space-y-2">
                        <Label>
                          {t('reward_card.withdraw_dialog.real_name_label')}
                        </Label>
                        <Input
                          placeholder={t(
                            'reward_card.withdraw_dialog.real_name_placeholder'
                          )}
                          value={alipayName}
                          onChange={(e) => setAlipayName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>
                          {t('reward_card.withdraw_dialog.alipay_account_label')}
                        </Label>
                        <Input
                          placeholder={t(
                            'reward_card.withdraw_dialog.alipay_placeholder'
                          )}
                          value={alipayAccount}
                          onChange={(e) => setAlipayAccount(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {/* 银行转账表单字段 */}
                  {withdrawMethod === 'bank_transfer' && (
                    <>
                      <div className="space-y-2">
                        <Label>
                          {t('reward_card.withdraw_dialog.real_name_label')}
                        </Label>
                        <Input
                          placeholder={t(
                            'reward_card.withdraw_dialog.real_name_placeholder'
                          )}
                          value={bankAccountName}
                          onChange={(e) => setBankAccountName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>
                          {t('reward_card.withdraw_dialog.bank_account_label')}
                        </Label>
                        <Input
                          placeholder={t(
                            'reward_card.withdraw_dialog.bank_account_placeholder'
                          )}
                          value={bankAccountNumber}
                          onChange={(e) => setBankAccountNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>
                          {t('reward_card.withdraw_dialog.bank_name_label')}
                        </Label>
                        <Input
                          placeholder={t(
                            'reward_card.withdraw_dialog.bank_name_placeholder'
                          )}
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>
                          {t('reward_card.withdraw_dialog.bank_branch_label')}
                        </Label>
                        <Input
                          placeholder={t(
                            'reward_card.withdraw_dialog.bank_branch_placeholder'
                          )}
                          value={bankBranch}
                          onChange={(e) => setBankBranch(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={handleWithdraw} disabled={withdrawing}>
                    {withdrawing
                      ? t('reward_card.withdraw_dialog.submitting')
                      : t('reward_card.withdraw_dialog.submit_button')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* 邀请码卡片 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('invite_card.title')}</CardTitle>
          <CardDescription>{t('invite_card.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={inviteUrl} readOnly className="flex-1" />
            <Button onClick={handleCopyUrl} variant="outline">
              {copied ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {t('invite_card.copy_button')}
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('invite_card.invite_code')}:{' '}
            <span className="font-mono font-bold">{inviteCode}</span>
          </p>
        </CardContent>
      </Card>

      {/* 数据面板 */}
      <Tabs defaultValue="referrals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="referrals">
            {t('panel.tabs.referrals')}
          </TabsTrigger>
          <TabsTrigger value="invitations">
            {t('panel.tabs.invitation')}
          </TabsTrigger>
          <TabsTrigger value="commissions">
            {t('panel.tabs.reward')}
          </TabsTrigger>
          <TabsTrigger value="withdrawals">
            {t('panel.tabs.withdraw')}
          </TabsTrigger>
        </TabsList>

        {/* 付费用户列表 */}
        <TabsContent value="referrals">
          <Card>
            <CardHeader>
              <CardTitle>{t('panel.referrals.title')}</CardTitle>
              <CardDescription>
                {t('panel.referrals.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {paidOrders.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  {t('panel.referrals.no_data')}
                </div>
              ) : (
                <div className="space-y-4">
                  {paidOrders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0"
                    >
                      <div>
                        <p className="font-medium">{order.userEmail}</p>
                        <p className="text-muted-foreground text-sm">
                          {order.productName} · {formatDate(order.paidAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">
                          {formatAmount(order.amount, order.currency)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {t('panel.referrals.commission')}:{' '}
                          {formatAmount(
                            Math.floor(order.amount * 0.2),
                            order.currency
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 邀请记录 */}
        <TabsContent value="invitations">
          <Card>
            <CardHeader>
              <CardTitle>{t('panel.invitation_table.title')}</CardTitle>
              <CardDescription>
                {t('panel.invitation_table.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  {t('panel.invitation_table.no_data')}
                </div>
              ) : (
                <div className="space-y-4">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0"
                    >
                      <div>
                        <p className="font-medium">
                          {inv.inviteeEmail ||
                            t('panel.invitation_table.waiting')}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {formatDate(inv.createdAt)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          inv.status === 'accepted' ? 'default' : 'secondary'
                        }
                      >
                        {inv.status === 'accepted'
                          ? t('panel.invitation_table.registered')
                          : t('panel.invitation_table.pending')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 佣金记录 */}
        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <CardTitle>{t('panel.reward_table.title')}</CardTitle>
              <CardDescription>
                {t('panel.reward_table.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {commissions.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  {t('panel.reward_table.no_data')}
                </div>
              ) : (
                <div className="space-y-4">
                  {commissions.map((comm) => (
                    <div
                      key={comm.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0"
                    >
                      <div>
                        <p className="font-medium">{comm.description}</p>
                        <p className="text-muted-foreground text-sm">
                          {formatDate(comm.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">
                          +{formatAmount(comm.amount, comm.currency)}
                        </p>
                        <Badge
                          variant={
                            comm.status === 'paid' ? 'default' : 'secondary'
                          }
                        >
                          {comm.status === 'paid'
                            ? t('panel.reward_table.status_paid')
                            : t('panel.reward_table.status_pending')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 提现记录 */}
        <TabsContent value="withdrawals">
          <Card>
            <CardHeader>
              <CardTitle>{t('panel.withdraw_table.title')}</CardTitle>
              <CardDescription>
                {t('panel.withdraw_table.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {withdrawals.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  {t('panel.withdraw_table.no_data')}
                </div>
              ) : (
                <div className="space-y-4">
                  {withdrawals.map((wd) => (
                    <div
                      key={wd.id}
                      className="flex items-center justify-between border-b pb-4 last:border-0"
                    >
                      <div>
                        <p className="font-medium">
                          {wd.method === 'paypal'
                            ? t('reward_card.withdraw_methods.paypal')
                            : t('reward_card.withdraw_methods.bank_transfer')}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {formatDate(wd.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">
                          {formatAmount(wd.amount, wd.currency)}
                        </p>
                        <Badge
                          variant={
                            wd.status === 'paid'
                              ? 'default'
                              : wd.status === 'approved'
                                ? 'outline'
                                : wd.status === 'rejected'
                                  ? 'destructive'
                                  : 'secondary'
                          }
                        >
                          {wd.status === 'paid'
                            ? t('panel.withdraw_table.status_paid')
                            : wd.status === 'approved'
                              ? t('panel.withdraw_table.status_approved')
                              : wd.status === 'rejected'
                                ? t('panel.withdraw_table.status_rejected')
                                : t('panel.withdraw_table.status_pending')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

