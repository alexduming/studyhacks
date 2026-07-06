import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { TableCard } from '@/shared/blocks/table';
import { getRedemptionCodes, getRedemptionCodesCount } from '@/shared/models/redemption';
import { Crumb, Tab } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';

export default async function RedemptionCodesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: number; pageSize?: number }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Check permission
  await requirePermission({
    code: PERMISSIONS.CREDITS_READ,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const t = await getTranslations('admin.credits'); // Reuse credits translations for now or add new

  const { page: pageNum, pageSize } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 20;

  const crumbs: Crumb[] = [
    { title: t('list.crumbs.admin'), url: '/admin' },
    { title: t('list.crumbs.credits'), url: '/admin/credits' },
    { title: 'Codes', is_active: true },
  ];

  const tabs: Tab[] = [
    {
      name: 'transactions',
      title: 'Transactions',
      url: '/admin/credits',
      is_active: false,
    },
    {
      name: 'codes',
      title: 'Redemption Codes',
      url: '/admin/credits/codes',
      is_active: true,
    },
  ];

  const actions = [
    {
      title: 'Generate Codes',
      url: '/admin/credits/generate',
      icon: 'Ticket',
    },
  ];

  const total = await getRedemptionCodesCount();
  const codes = await getRedemptionCodes({ page, limit });

  const table: Table = {
    columns: [
      {
        name: 'code',
        title: 'Code',
        type: 'copy',
      },
      {
        name: 'credits',
        title: 'Credits',
        type: 'label',
      },
      {
        name: 'status',
        title: 'Status',
        type: 'label',
        metadata: {
            // Map status to colors if needed
        }
      },
      {
        name: 'usage',
        title: 'Usage',
        callback: (item) => (
            <span>{item.usedCount} / {item.maxUses}</span>
        )
      },
      {
        name: 'expiresAt',
        title: 'Expires',
        type: 'time',
        placeholder: 'Never',
      },
      {
        name: 'createdAt',
        title: 'Created At',
        type: 'time',
      },
    ],
    data: codes,
    pagination: {
      total,
      page,
      limit,
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title="Redemption Codes Management" tabs={tabs} actions={actions} />
        <TableCard table={table} />
      </Main>
    </>
  );
}

