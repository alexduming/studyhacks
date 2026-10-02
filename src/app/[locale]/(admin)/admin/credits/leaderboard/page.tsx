import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Trophy, Medal, Award } from 'lucide-react';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { TableCard } from '@/shared/blocks/table';
import { Badge } from '@/shared/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar';
import { getTopUsersByCredits } from '@/shared/models/credit';
import { Crumb } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';

/**
 * 积分排行榜页面
 * 非程序员解释：
 * - 这个页面展示所有用户的剩余积分排行榜
 * - 按积分从高到低排序，显示前 100 名用户
 * - 包含用户头像、姓名、邮箱和总积分信息
 */
export default async function CreditsLeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ limit?: number }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // 检查用户是否有权限查看积分
  await requirePermission({
    code: PERMISSIONS.CREDITS_READ,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const t = await getTranslations('admin.credits');

  const { limit } = await searchParams;
  const topLimit = limit ? parseInt(String(limit)) : 100; // 默认显示前 100 名

  // 获取积分排行榜数据
  const topUsers = await getTopUsersByCredits(topLimit);

  // 为每个用户添加排名信息（优化：避免在 callback 中重复查找）
  const topUsersWithRank = topUsers.map((user, index) => ({
    ...user,
    rank: index + 1,
  }));

  const crumbs: Crumb[] = [
    { title: t('list.crumbs.admin'), url: '/admin' },
    { title: t('list.crumbs.credits'), url: '/admin/credits' },
    { title: '积分排行榜', is_active: true },
  ];

  // 定义表格列
  const table: Table = {
    columns: [
      {
        name: 'rank',
        title: '排名',
        callback: (item: any) => {
          // 使用已计算的排名
          const rank = item.rank || 1;
          if (rank === 1) {
            return (
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <span className="font-bold text-yellow-500">#{rank}</span>
              </div>
            );
          } else if (rank === 2) {
            return (
              <div className="flex items-center gap-2">
                <Medal className="h-5 w-5 text-gray-400" />
                <span className="font-bold text-gray-400">#{rank}</span>
              </div>
            );
          } else if (rank === 3) {
            return (
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-600" />
                <span className="font-bold text-amber-600">#{rank}</span>
              </div>
            );
          } else {
            return (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">#{rank}</span>
              </div>
            );
          }
        },
      },
      {
        name: 'user',
        title: '用户',
        callback: (item: any) => {
          const user = item.user;
          if (!user) {
            return <span className="text-muted-foreground">用户已删除</span>;
          }
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.image || ''} alt={user.name || ''} />
                <AvatarFallback>
                  {user.name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium">{user.name || '未命名用户'}</span>
                <span className="text-sm text-muted-foreground">{user.email}</span>
              </div>
            </div>
          );
        },
      },
      {
        name: 'totalCredits',
        title: '剩余积分',
        callback: (item: any) => {
          const credits = item.totalCredits || 0;
          return (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-lg font-bold text-green-600">
                {credits.toLocaleString()}
              </Badge>
            </div>
          );
        },
      },
      {
        name: 'userId',
        title: '用户ID',
        type: 'copy',
      },
    ],
    data: topUsersWithRank,
    pagination: {
      total: topUsersWithRank.length,
      page: 1,
      limit: topLimit,
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader
          title="积分排行榜"
          description={`显示剩余积分最多的前 ${topLimit} 名用户`}
        />
        <TableCard table={table} />
      </Main>
    </>
  );
}

