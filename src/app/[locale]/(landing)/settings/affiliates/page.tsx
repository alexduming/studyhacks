'use client';

import { useEffect, useState } from 'react';
import {
  Award,
  Check,
  Clock,
  Copy,
  DollarSign,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
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
import { Input } from '@/shared/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';

// 申请状态类型
type ApplicationStatus = 'pending' | 'approved' | 'rejected' | null;

/**
 * 分销员页面（教练计划）
 *
 * 流程：
 * 1. 未申请 → 显示申请表单
 * 2. 待审核 → 显示等待状态
 * 3. 已拒绝 → 显示拒绝原因，可重新申请
 * 4. 已批准 → 显示完整分销员面板
 */
export default function AffiliatesPage() {
  const t = useTranslations('affiliates');
  const locale = useLocale();

  // 申请状态
  const [applicationStatus, setApplicationStatus] =
    useState<ApplicationStatus>(null);
  const [application, setApplication] = useState<any>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // 申请表单
  const [applyReason, setApplyReason] = useState('');
  const [applySocialMedia, setApplySocialMedia] = useState('');
  const [applying, setApplying] = useState(false);

  // 分销员面板状态
  const [inviteCode, setInviteCode] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

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

  // 首次加载检查申请状态
  useEffect(() => {
    checkApplicationStatus();
  }, []);

  // 检查申请状态
  const checkApplicationStatus = async () => {
    try {
      setCheckingStatus(true);
      const response = await fetch('/api/affiliate/application-status');
      const data = await response.json();
      if (data.success) {
        if (data.data.hasApplication) {
          setApplication(data.data.application);
          setApplicationStatus(data.data.application.status);
          // 如果已批准，加载分销员数据
          if (data.data.application.status === 'approved') {
            loadAllData();
          }
        } else {
          setApplicationStatus(null);
        }
      }
    } catch (error) {
      console.error('检查申请状态失败:', error);
    } finally {
      setCheckingStatus(false);
    }
  };

  // 提交申请
  const handleApply = async () => {
    try {
      setApplying(true);
      const response = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: applyReason,
          socialMedia: applySocialMedia,
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('申请已提交，请等待审核');
        setApplicationStatus('pending');
        setApplication(data.data);
      } else {
        toast.error(data.error || '申请失败');
      }
    } catch (error) {
      toast.error('申请失败');
    } finally {
      setApplying(false);
    }
  };

  // 加载所有分销员数据
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
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取邀请码
  const loadInviteCode = async () => {
    const response = await fetch('/api/invitation/generate', { method: 'POST' });
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
      // 自动填充上次的提现信息
      const records = data.data.records || [];
      if (records.length > 0) {
        const lastWithdrawal = records[0]; // 最近一次提现
        setWithdrawMethod(lastWithdrawal.method || 'paypal');
        // 解析账户信息
        try {
          const accountInfo = JSON.parse(lastWithdrawal.account);
          if (lastWithdrawal.method === 'paypal') {
            setPaypalEmail(accountInfo.email || '');
          } else if (lastWithdrawal.method === 'alipay') {
            setAlipayName(accountInfo.name || '');
            setAlipayAccount(accountInfo.account || '');
          } else if (lastWithdrawal.method === 'bank_transfer') {
            setBankAccountName(accountInfo.name || '');
            setBankAccountNumber(accountInfo.accountNumber || '');
            setBankName(accountInfo.bankName || '');
            setBankBranch(accountInfo.branch || '');
          }
        } catch {
          // 旧格式的账户信息，直接作为字符串处理
          if (lastWithdrawal.method === 'paypal') {
            setPaypalEmail(lastWithdrawal.account || '');
          }
        }
      }
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
      toast.error('请填写完整信息');
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('请输入有效金额');
      return;
    }

    if (amount > stats.availableBalance / 100) {
      toast.error('提现金额超过可用余额');
      return;
    }

    try {
      setWithdrawing(true);
      const response = await fetch('/api/affiliate/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.floor(amount * 100),
          currency: 'usd',
          method: withdrawMethod,
          account: JSON.stringify(accountData),
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success('提现申请已提交');
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
        toast.error(data.error || '提现失败');
      }
    } catch (error) {
      toast.error('提现失败');
    } finally {
      setWithdrawing(false);
    }
  };

  // 处理提现金额变化，限制不超过可用余额
  const handleWithdrawAmountChange = (value: string) => {
    const maxAmount = stats.availableBalance / 100;
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > maxAmount) {
      setWithdrawAmount(maxAmount.toFixed(2));
    } else {
      setWithdrawAmount(value);
    }
  };

  // 全部提现
  const handleWithdrawAll = () => {
    const maxAmount = stats.availableBalance / 100;
    setWithdrawAmount(maxAmount.toFixed(2));
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
    return new Date(dateString).toLocaleDateString(localeMap[locale] || 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  // 加载中状态
  if (checkingStatus) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>
        <div className="py-12 text-center">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // 未申请状态 - 显示申请表单
  if (applicationStatus === null) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>

        <Card className="mx-auto max-w-2xl">
          <CardHeader className="text-center">
            <div className="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <Award className="text-primary h-8 w-8" />
            </div>
            <CardTitle className="text-2xl">申请成为教练</CardTitle>
            <CardDescription>
              加入我们的教练计划，推广产品并获得佣金收入
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>申请理由</Label>
              <Textarea
                placeholder="请简要说明您为什么想成为教练，以及您的推广计划..."
                value={applyReason}
                onChange={(e) => setApplyReason(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>社交媒体账号（可选）</Label>
              <Input
                placeholder="您的微信公众号、微博、小红书等账号"
                value={applySocialMedia}
                onChange={(e) => setApplySocialMedia(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleApply}
              disabled={applying || !applyReason.trim()}
            >
              {applying ? '提交中...' : '提交申请'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 待审核状态
  if (applicationStatus === 'pending') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>

        <Card className="mx-auto max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
            <CardTitle className="text-2xl">申请审核中</CardTitle>
            <CardDescription>
              您的申请已提交，我们会尽快审核
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-muted-foreground text-sm">
                提交时间：{formatDate(application?.createdAt)}
              </p>
              {application?.reason && (
                <p className="text-muted-foreground mt-2 text-sm">
                  申请理由：{application.reason}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 已拒绝状态
  if (applicationStatus === 'rejected') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>

        <Card className="mx-auto max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl">申请未通过</CardTitle>
            <CardDescription>
              很抱歉，您的申请未能通过审核
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {application?.adminNote && (
              <div className="bg-muted rounded-lg p-4">
                <p className="text-muted-foreground text-sm">
                  审核备注：{application.adminNote}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>重新申请理由</Label>
              <Textarea
                placeholder="请说明您的推广计划..."
                value={applyReason}
                onChange={(e) => setApplyReason(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>社交媒体账号（可选）</Label>
              <Input
                placeholder="您的微信公众号、微博、小红书等账号"
                value={applySocialMedia}
                onChange={(e) => setApplySocialMedia(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleApply}
              disabled={applying || !applyReason.trim()}
            >
              {applying ? '提交中...' : '重新申请'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 已批准状态 - 显示完整分销员面板
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('description')}</p>
        </div>
        <div className="py-12 text-center">
          <p className="text-muted-foreground">加载中...</p>
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
            <CardTitle className="text-sm font-medium">邀请人数</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInvitations}</div>
            <p className="text-muted-foreground text-xs">已注册用户</p>
          </CardContent>
        </Card>

        {/* 付费用户 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">付费用户</CardTitle>
            <TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referralStats.uniquePaidUsers}</div>
            <p className="text-muted-foreground text-xs">
              共 {referralStats.totalOrders} 笔订单
            </p>
          </CardContent>
        </Card>

        {/* 总佣金 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总佣金</CardTitle>
            <DollarSign className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatAmount(stats.totalCommissions, 'usd')}
            </div>
            <p className="text-muted-foreground text-xs">
              已提现: {formatAmount(stats.totalWithdrawn, 'usd')}
            </p>
          </CardContent>
        </Card>

        {/* 可提现余额 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可提现</CardTitle>
            <Wallet className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatAmount(stats.availableBalance, 'usd')}
            </div>
            <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
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
                  <DialogTitle>{t('reward_card.withdraw_dialog.title')}</DialogTitle>
                  <DialogDescription>
                    {t('reward_card.withdraw_dialog.description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>{t('reward_card.withdraw_dialog.amount_label')}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={withdrawAmount}
                        onChange={(e) => handleWithdrawAmountChange(e.target.value)}
                        max={stats.availableBalance / 100}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleWithdrawAll}
                        className="whitespace-nowrap"
                      >
                        全部提现
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      可用余额: {formatAmount(stats.availableBalance, 'usd')}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('reward_card.withdraw_dialog.method_label')}</Label>
                    <Select value={withdrawMethod} onValueChange={setWithdrawMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paypal">PayPal</SelectItem>
                        <SelectItem value="alipay">支付宝</SelectItem>
                        <SelectItem value="bank_transfer">银行转账</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* PayPal 表单字段 */}
                  {withdrawMethod === 'paypal' && (
                    <div className="space-y-2">
                      <Label>PayPal 邮箱</Label>
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        value={paypalEmail}
                        onChange={(e) => setPaypalEmail(e.target.value)}
                      />
                    </div>
                  )}

                  {/* 支付宝表单字段 */}
                  {withdrawMethod === 'alipay' && (
                    <>
                      <div className="space-y-2">
                        <Label>真实姓名</Label>
                        <Input
                          placeholder="请输入收款人真实姓名"
                          value={alipayName}
                          onChange={(e) => setAlipayName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>支付宝账号</Label>
                        <Input
                          placeholder="手机号或邮箱"
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
                        <Label>真实姓名</Label>
                        <Input
                          placeholder="请输入收款人真实姓名"
                          value={bankAccountName}
                          onChange={(e) => setBankAccountName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>银行卡号</Label>
                        <Input
                          placeholder="请输入银行卡号"
                          value={bankAccountNumber}
                          onChange={(e) => setBankAccountNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>银行名称</Label>
                        <Input
                          placeholder="如：中国工商银行"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>开户行</Label>
                        <Input
                          placeholder="如：北京市朝阳区支行"
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
                      ? '提交中...'
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
            邀请码: <span className="font-mono font-bold">{inviteCode}</span>
          </p>
        </CardContent>
      </Card>

      {/* 数据面板 */}
      <Tabs defaultValue="referrals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="referrals">付费用户</TabsTrigger>
          <TabsTrigger value="invitations">{t('panel.tabs.invitation')}</TabsTrigger>
          <TabsTrigger value="commissions">{t('panel.tabs.reward')}</TabsTrigger>
          <TabsTrigger value="withdrawals">{t('panel.tabs.withdraw')}</TabsTrigger>
        </TabsList>

        {/* 付费用户列表 */}
        <TabsContent value="referrals">
          <Card>
            <CardHeader>
              <CardTitle>付费用户订单</CardTitle>
              <CardDescription>通过您的邀请码注册并付费的用户订单</CardDescription>
            </CardHeader>
            <CardContent>
              {paidOrders.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  暂无付费用户
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
                          佣金: {formatAmount(Math.floor(order.amount * 0.2), order.currency)}
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
              <CardTitle>邀请记录</CardTitle>
              <CardDescription>您邀请注册的用户列表</CardDescription>
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
                        <p className="font-medium">{inv.inviteeEmail || '等待注册'}</p>
                        <p className="text-muted-foreground text-sm">
                          {formatDate(inv.createdAt)}
                        </p>
                      </div>
                      <Badge variant={inv.status === 'accepted' ? 'default' : 'secondary'}>
                        {inv.status === 'accepted' ? '已注册' : '待注册'}
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
              <CardTitle>佣金记录</CardTitle>
              <CardDescription>您获得的佣金明细</CardDescription>
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
                        <Badge variant={comm.status === 'paid' ? 'default' : 'secondary'}>
                          {comm.status === 'paid' ? '可提现' : '待确认'}
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
              <CardTitle>提现记录</CardTitle>
              <CardDescription>您的提现申请记录</CardDescription>
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
                            ? 'PayPal'
                            : wd.method === 'alipay'
                              ? '支付宝'
                              : '银行转账'}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {formatDate(wd.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatAmount(wd.amount, wd.currency)}</p>
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
                            ? '已打款'
                            : wd.status === 'approved'
                              ? '已批准'
                              : wd.status === 'rejected'
                                ? '已拒绝'
                                : '待审核'}
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
