'use client';

import { useEffect, useState } from 'react';
import { Check, DollarSign, TrendingUp, Users, Wallet, X } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Input } from '@/shared/components/ui/input';

/**
 * 管理后台：分销员业绩管理页面
 */
export default function AdminAffiliatesPage() {
  const [loading, setLoading] = useState(true);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [withdrawalStatus, setWithdrawalStatus] = useState('pending');
  const [processing, setProcessing] = useState<string | null>(null);

  // 申请相关状态
  const [applications, setApplications] = useState<any[]>([]);
  const [applicationStatus, setApplicationStatus] = useState('pending');
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadWithdrawals();
  }, [withdrawalStatus]);

  useEffect(() => {
    loadApplications();
  }, [applicationStatus]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadAffiliates(), loadWithdrawals(), loadApplications()]);
    } finally {
      setLoading(false);
    }
  };

  const loadAffiliates = async () => {
    const response = await fetch('/api/admin/affiliates');
    const data = await response.json();
    if (data.success) {
      setAffiliates(data.data.affiliates);
    }
  };

  const loadWithdrawals = async () => {
    const response = await fetch(`/api/admin/withdrawals?status=${withdrawalStatus}`);
    const data = await response.json();
    if (data.success) {
      setWithdrawals(data.data.withdrawals);
    }
  };

  // 加载申请列表
  const loadApplications = async () => {
    const url =
      applicationStatus === 'all'
        ? '/api/admin/affiliate-applications'
        : `/api/admin/affiliate-applications?status=${applicationStatus}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.success) {
      setApplications(data.data.records || []);
    }
  };

  // 处理提现审批
  const handleWithdrawalAction = async (id: string, action: string) => {
    try {
      setProcessing(id);
      const response = await fetch('/api/admin/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(
          action === 'approve' ? '已批准' : action === 'reject' ? '已拒绝' : '已打款'
        );
        loadWithdrawals();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  // 处理申请审批
  const handleApplicationAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      setProcessing(id);
      const response = await fetch('/api/admin/affiliate-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action,
          adminNote: adminNotes[id] || '',
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(action === 'approve' ? '已批准' : '已拒绝');
        loadApplications();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  // 格式化金额
  const formatAmount = (amount: number, currency: string = 'usd') => {
    const value = amount / 100;
    if (currency.toLowerCase() === 'cny') {
      return `¥${value.toFixed(2)}`;
    }
    return `$${value.toFixed(2)}`;
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-bold">分销员管理</h1>
        <div className="py-12 text-center">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // 计算总统计
  const totalStats = affiliates.reduce(
    (acc, aff) => ({
      totalAffiliates: acc.totalAffiliates + 1,
      totalPaidUsers: acc.totalPaidUsers + aff.uniquePaidUsers,
      totalCommission: acc.totalCommission + aff.totalCommission,
      totalWithdrawn: acc.totalWithdrawn + aff.totalWithdrawn,
    }),
    { totalAffiliates: 0, totalPaidUsers: 0, totalCommission: 0, totalWithdrawn: 0 }
  );

  // 待审批申请数量
  const pendingApplicationsCount = applications.filter(
    (app) => app.status === 'pending'
  ).length;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">分销员管理</h1>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">分销员数量</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalAffiliates}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">带来付费用户</CardTitle>
            <TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalPaidUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总佣金</CardTitle>
            <DollarSign className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatAmount(totalStats.totalCommission)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已提现</CardTitle>
            <Wallet className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatAmount(totalStats.totalWithdrawn)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 数据面板 */}
      <Tabs defaultValue="applications" className="space-y-4">
        <TabsList>
          <TabsTrigger value="applications" className="relative">
            申请审批
            {pendingApplicationsCount > 0 && (
              <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                {pendingApplicationsCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="affiliates">分销员业绩</TabsTrigger>
          <TabsTrigger value="withdrawals">提现审批</TabsTrigger>
        </TabsList>

        {/* 申请审批 */}
        <TabsContent value="applications">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>分销员申请</CardTitle>
                  <CardDescription>审批用户的分销员申请</CardDescription>
                </div>
                <Select value={applicationStatus} onValueChange={setApplicationStatus}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="pending">待审核</SelectItem>
                    <SelectItem value="approved">已批准</SelectItem>
                    <SelectItem value="rejected">已拒绝</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {applications.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  暂无申请
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>申请人</TableHead>
                      <TableHead>申请理由</TableHead>
                      <TableHead>社交媒体</TableHead>
                      <TableHead>申请时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.map((app) => (
                      <TableRow key={app.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{app.userName || '-'}</p>
                            <p className="text-muted-foreground text-sm">
                              {app.userEmail}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-48">
                          <p className="line-clamp-2 text-sm">{app.reason || '-'}</p>
                        </TableCell>
                        <TableCell className="max-w-32 truncate">
                          {app.socialMedia || '-'}
                        </TableCell>
                        <TableCell>{formatDate(app.createdAt)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              app.status === 'approved'
                                ? 'default'
                                : app.status === 'rejected'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {app.status === 'approved'
                              ? '已批准'
                              : app.status === 'rejected'
                                ? '已拒绝'
                                : '待审核'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {app.status === 'pending' ? (
                            <Input
                              placeholder="审核备注..."
                              className="w-32"
                              value={adminNotes[app.id] || ''}
                              onChange={(e) =>
                                setAdminNotes((prev) => ({
                                  ...prev,
                                  [app.id]: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              {app.adminNote || '-'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {app.status === 'pending' && (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleApplicationAction(app.id, 'approve')
                                }
                                disabled={processing === app.id}
                              >
                                <Check className="mr-1 h-4 w-4" />
                                批准
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  handleApplicationAction(app.id, 'reject')
                                }
                                disabled={processing === app.id}
                              >
                                <X className="mr-1 h-4 w-4" />
                                拒绝
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 分销员业绩列表 */}
        <TabsContent value="affiliates">
          <Card>
            <CardHeader>
              <CardTitle>分销员业绩排行</CardTitle>
              <CardDescription>按带来的付费金额排序</CardDescription>
            </CardHeader>
            <CardContent>
              {affiliates.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  暂无分销员数据
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>分销员</TableHead>
                      <TableHead className="text-right">付费用户</TableHead>
                      <TableHead className="text-right">订单数</TableHead>
                      <TableHead className="text-right">带来金额</TableHead>
                      <TableHead className="text-right">总佣金</TableHead>
                      <TableHead className="text-right">已提现</TableHead>
                      <TableHead className="text-right">可提现</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {affiliates.map((aff, index) => (
                      <TableRow key={aff.user?.id || index}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{aff.user?.name || '-'}</p>
                            <p className="text-muted-foreground text-sm">
                              {aff.user?.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {aff.uniquePaidUsers}
                        </TableCell>
                        <TableCell className="text-right">{aff.totalOrders}</TableCell>
                        <TableCell className="text-right">
                          {formatAmount(aff.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatAmount(aff.totalCommission)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatAmount(aff.totalWithdrawn)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">
                          {formatAmount(
                            aff.paidCommission - aff.totalWithdrawn - aff.pendingWithdrawal
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 提现审批 */}
        <TabsContent value="withdrawals">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>提现申请</CardTitle>
                  <CardDescription>审批分销员的提现申请</CardDescription>
                </div>
                <Select value={withdrawalStatus} onValueChange={setWithdrawalStatus}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="pending">待审核</SelectItem>
                    <SelectItem value="approved">已批准</SelectItem>
                    <SelectItem value="rejected">已拒绝</SelectItem>
                    <SelectItem value="paid">已打款</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {withdrawals.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  暂无提现申请
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>申请人</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>方式</TableHead>
                      <TableHead>账户</TableHead>
                      <TableHead>申请时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals.map((wd) => (
                      <TableRow key={wd.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{wd.userName || '-'}</p>
                            <p className="text-muted-foreground text-sm">
                              {wd.userEmail}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="font-bold">
                          {formatAmount(wd.amount, wd.currency)}
                        </TableCell>
                        <TableCell>
                          {wd.method === 'paypal' ? 'PayPal' : '银行转账'}
                        </TableCell>
                        <TableCell className="max-w-32 truncate">{wd.account}</TableCell>
                        <TableCell>{formatDate(wd.createdAt)}</TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell className="text-right">
                          {wd.status === 'pending' && (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleWithdrawalAction(wd.id, 'approve')}
                                disabled={processing === wd.id}
                              >
                                批准
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleWithdrawalAction(wd.id, 'reject')}
                                disabled={processing === wd.id}
                              >
                                拒绝
                              </Button>
                            </div>
                          )}
                          {wd.status === 'approved' && (
                            <Button
                              size="sm"
                              onClick={() => handleWithdrawalAction(wd.id, 'pay')}
                              disabled={processing === wd.id}
                            >
                              确认打款
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
