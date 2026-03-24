import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Empty } from '@/shared/blocks/common';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { TableCard } from '@/shared/blocks/table';
import { Badge } from '@/shared/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import {
  Credit,
  CreditStatus,
  CreditTransactionType,
  getCredits,
  getCreditsCount,
  getRemainingCredits,
} from '@/shared/models/credit';
import { findUserById } from '@/shared/models/user';
import { Crumb, Tab } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';

type ConsumedDetailItem = {
  creditId?: string;
  creditsConsumed?: number;
};

type GrantState = {
  createdAt: Date;
  expiresAt: Date | null;
  remainingCredits: number;
};

type CreditWithDerivedFields = Credit & {
  balanceAfter: number;
  derivedStatus: string;
};

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function buildBalanceAfterMap(credits: Credit[]) {
  const grantState = new Map<string, GrantState>();

  for (const item of credits) {
    if (item.transactionType !== CreditTransactionType.GRANT) {
      continue;
    }

    grantState.set(item.id, {
      createdAt: toDate(item.createdAt) || new Date(0),
      expiresAt: toDate(item.expiresAt),
      remainingCredits: item.remainingCredits || 0,
    });
  }

  const balanceByTransactionNo = new Map<string, number>();

  for (const item of credits) {
    const createdAt = toDate(item.createdAt) || new Date(0);
    let balanceAfter = 0;

    for (const grant of grantState.values()) {
      const isCreated = grant.createdAt.getTime() <= createdAt.getTime();
      const isNotExpired =
        !grant.expiresAt || grant.expiresAt.getTime() > createdAt.getTime();

      if (isCreated && isNotExpired) {
        balanceAfter += grant.remainingCredits;
      }
    }

    balanceByTransactionNo.set(item.transactionNo, balanceAfter);

    if (
      item.transactionType === CreditTransactionType.CONSUME &&
      item.consumedDetail
    ) {
      try {
        const consumedItems = JSON.parse(
          item.consumedDetail
        ) as ConsumedDetailItem[];

        for (const detail of consumedItems) {
          if (!detail.creditId || !detail.creditsConsumed) {
            continue;
          }

          const grant = grantState.get(detail.creditId);
          if (!grant) {
            continue;
          }

          grant.remainingCredits += detail.creditsConsumed;
        }
      } catch (error) {
        console.warn('Failed to parse consumedDetail for credit record', {
          transactionNo: item.transactionNo,
          error,
        });
      }
    }
  }

  return balanceByTransactionNo;
}

function getDerivedStatus(item: Credit, now: Date) {
  if (item.transactionType === CreditTransactionType.CONSUME) {
    return 'consumed';
  }

  const expiresAt = toDate(item.expiresAt);
  if (expiresAt && expiresAt.getTime() <= now.getTime() && item.remainingCredits > 0) {
    return 'expired';
  }

  if (item.remainingCredits > 0) {
    return 'available';
  }

  return 'used';
}

export default async function UserCreditsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ page?: number; pageSize?: number; type?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  await requirePermission({
    code: PERMISSIONS.CREDITS_READ,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const user = await findUserById(id);
  if (!user) {
    const tUsers = await getTranslations('admin.users');
    return <Empty message={tUsers('credit_details.empty')} />;
  }

  const tUsers = await getTranslations('admin.users');
  const tCredits = await getTranslations('admin.credits');
  const now = new Date();

  const { page: pageNum, pageSize, type } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 30;
  const transactionType =
    type && type !== 'all' ? (type as CreditTransactionType) : undefined;

  const [filteredTotal, allTotal, remainingCredits] = await Promise.all([
    getCreditsCount({
      userId: id,
      transactionType,
      status: CreditStatus.ACTIVE,
    }),
    getCreditsCount({
      userId: id,
      status: CreditStatus.ACTIVE,
    }),
    getRemainingCredits(id),
  ]);

  const [credits, allCredits] = await Promise.all([
    getCredits({
      userId: id,
      status: CreditStatus.ACTIVE,
      transactionType,
      page,
      limit,
    }),
    getCredits({
      userId: id,
      status: CreditStatus.ACTIVE,
      page: 1,
      limit: Math.max(allTotal, 1),
    }),
  ]);

  const balanceAfterMap = buildBalanceAfterMap(allCredits);
  const creditsWithBalance: CreditWithDerivedFields[] = credits.map((item) => ({
    ...item,
    balanceAfter: balanceAfterMap.get(item.transactionNo) ?? 0,
    derivedStatus: getDerivedStatus(item, now),
  }));

  const expiredUnusedGrants = allCredits
    .filter(
      (item) =>
        item.transactionType === CreditTransactionType.GRANT &&
        getDerivedStatus(item, now) === 'expired'
    )
    .sort((a, b) => {
      const aTime = toDate(a.expiresAt)?.getTime() ?? 0;
      const bTime = toDate(b.expiresAt)?.getTime() ?? 0;
      return bTime - aTime;
    });

  const expiredUnusedTotal = expiredUnusedGrants.reduce(
    (sum, item) => sum + (item.remainingCredits || 0),
    0
  );

  const displayName = user.name || user.email || user.id;
  const displayEmail = user.email || '-';

  const crumbs: Crumb[] = [
    { title: tUsers('credit_details.crumbs.admin'), url: '/admin' },
    { title: tUsers('credit_details.crumbs.users'), url: '/admin/users' },
    {
      title: tUsers('credit_details.crumbs.credit_details'),
      is_active: true,
    },
  ];

  const tabs: Tab[] = [
    {
      title: tCredits('list.tabs.all'),
      name: 'all',
      url: `/admin/users/${id}/credits`,
      is_active: !type || type === 'all',
    },
    {
      title: tCredits('list.tabs.grant'),
      name: 'grant',
      url: `/admin/users/${id}/credits?type=grant`,
      is_active: type === 'grant',
    },
    {
      title: tCredits('list.tabs.consume'),
      name: 'consume',
      url: `/admin/users/${id}/credits?type=consume`,
      is_active: type === 'consume',
    },
  ];

  const table: Table = {
    columns: [
      {
        name: 'transactionNo',
        title: tCredits('fields.transaction_no'),
        type: 'copy',
      },
      {
        name: 'credits',
        title: tCredits('fields.amount'),
        callback: (item: CreditWithDerivedFields) => {
          if (item.credits > 0) {
            return <div className="text-green-500">+{item.credits}</div>;
          }

          return <div className="text-red-500">{item.credits}</div>;
        },
      },
      {
        name: 'balanceAfter',
        title: tCredits('fields.remaining'),
        type: 'label',
        placeholder: '-',
      },
      {
        name: 'derivedStatus',
        title: tCredits('fields.status'),
        callback: (item: CreditWithDerivedFields) => {
          const variantMap: Record<string, string> = {
            available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
            used: 'bg-slate-100 text-slate-700 border-slate-200',
            expired: 'bg-amber-100 text-amber-700 border-amber-200',
            consumed: 'bg-rose-100 text-rose-700 border-rose-200',
          };

          return (
            <Badge variant="outline" className={variantMap[item.derivedStatus]}>
              {tCredits(`status.${item.derivedStatus}`)}
            </Badge>
          );
        },
      },
      {
        name: 'transactionType',
        title: tCredits('fields.type'),
        type: 'label',
        metadata: { variant: 'outline' },
      },
      {
        name: 'transactionScene',
        title: tCredits('fields.scene'),
        type: 'label',
        placeholder: '-',
        metadata: { variant: 'outline' },
      },
      {
        name: 'description',
        title: tCredits('fields.description'),
        placeholder: '-',
      },
      {
        name: 'createdAt',
        title: tCredits('fields.created_at'),
        type: 'time',
      },
      {
        name: 'expiresAt',
        title: tCredits('fields.expires_at'),
        type: 'time',
        placeholder: '-',
        metadata: { format: 'YYYY-MM-DD HH:mm:ss' },
      },
      {
        name: 'metadata',
        title: tCredits('fields.metadata'),
        type: 'json_preview',
        placeholder: '-',
      },
    ],
    data: creditsWithBalance,
    pagination: {
      total: filteredTotal,
      page,
      limit,
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader
          title={tUsers('credit_details.title')}
          description={tUsers('credit_details.description', {
            userName: displayName,
            email: displayEmail,
            credits: remainingCredits,
          })}
        />
        <Card className="mb-6 border-amber-200 bg-amber-50/70">
          <CardHeader>
            <CardTitle>{tUsers('credit_details.expired_summary_title')}</CardTitle>
            <CardDescription>
              {tUsers('credit_details.expired_summary_total', {
                credits: expiredUnusedTotal,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            {expiredUnusedGrants.length > 0 ? (
              expiredUnusedGrants.map((item) => (
                <div key={item.transactionNo}>
                  {tUsers('credit_details.expired_summary_item', {
                    credits: item.remainingCredits,
                    date: toDate(item.expiresAt)?.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                      hour12: false,
                    }) || '-',
                    description: item.description || '-',
                  })}
                </div>
              ))
            ) : (
              <div>{tUsers('credit_details.expired_summary_empty')}</div>
            )}
          </CardContent>
        </Card>
        <TableCard table={table} tabs={tabs} />
      </Main>
    </>
  );
}
