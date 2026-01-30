import { getTranslations } from 'next-intl/server';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { TableCard } from '@/shared/blocks/table';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/shared/components/ui/avatar';
import { Badge } from '@/shared/components/ui/badge';
import { getRemainingCredits } from '@/shared/models/credit';
import {
  getUserMembership,
  getUsers,
  getUsersCount,
  User,
} from '@/shared/models/user';
import { getUserRoles } from '@/shared/services/rbac';
import { Crumb, Search } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';

import { ManageCreditsDialog } from './manage-credits-dialog';
import { ManageMembershipDialog } from './manage-membership-dialog';

export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: number;
    pageSize?: number;
    email?: string;
  }>;
}) {
  const { locale } = await params;

  // Check if user has permission to read users
  await requirePermission({
    code: PERMISSIONS.USERS_READ,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const t = await getTranslations('admin.users');

  const { page: pageNum, pageSize, email } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 30;

  const total = await getUsersCount({
    email,
  });
  const users = await getUsers({
    email,
    page,
    limit,
  });

  const crumbs: Crumb[] = [
    { title: t('list.crumbs.admin'), url: '/admin' },
    { title: t('list.crumbs.users'), is_active: true },
  ];

  const search: Search = {
    name: 'email',
    title: t('list.search.email.title'),
    placeholder: t('list.search.email.placeholder'),
    value: email,
    withButton: true,
  };

  const table: Table = {
    columns: [
      { name: 'id', title: t('fields.id'), type: 'copy' },
      { name: 'name', title: t('fields.name') },
      {
        name: 'image',
        title: t('fields.avatar'),
        callback: async (item: User) => {
          const membership = await getUserMembership(item.id);
          return (
            <Avatar
              isVip={membership.level === 'plus' || membership.level === 'pro'}
              vipLevel={membership.level as 'plus' | 'pro'}
            >
              <AvatarImage src={item.image || ''} alt={item.name || ''} />
              <AvatarFallback>{item.name?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
          );
        },
      },
      { name: 'email', title: t('fields.email'), type: 'copy' },
      {
        name: 'membership',
        title: 'Membership',
        callback: async (item: User) => {
          const membership = await getUserMembership(item.id);

          const colors = {
            free: 'bg-slate-500',
            plus: 'bg-blue-500',
            pro: 'bg-purple-500',
          };

          return (
            <div className="flex items-center gap-2">
              <Badge className={`${colors[membership.level]} text-white`}>
                {membership.level.toUpperCase()}
              </Badge>
              <ManageMembershipDialog
                userId={item.id}
                userName={item.name}
                currentLevel={membership.level}
              />
            </div>
          );
        },
      },
      {
        name: 'roles',
        title: t('fields.roles'),
        callback: async (item: User) => {
          const roles = await getUserRoles(item.id);

          return (
            <div className="flex flex-col gap-2">
              {roles.map((role) => (
                <Badge key={role.id} variant="outline">
                  {role.title}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        name: 'emailVerified',
        title: t('fields.email_verified'),
        type: 'label',
        placeholder: '-',
      },
      {
        name: 'remainingCredits',
        title: t('fields.remaining_credits'),
        callback: async (item: User) => {
          const credits = await getRemainingCredits(item.id);

          return (
            <div className="flex items-center gap-2">
              <div className="text-green-500">{credits}</div>
              <ManageCreditsDialog
                userId={item.id}
                userName={item.name}
                currentCredits={credits}
              />
            </div>
          );
        },
      },
      { name: 'createdAt', title: t('fields.created_at'), type: 'time' },
      {
        name: 'actions',
        title: t('fields.actions'),
        type: 'dropdown',
        callback: (item: User) => [
          {
            name: 'edit',
            title: t('list.buttons.edit'),
            icon: 'RiEditLine',
            url: `/admin/users/${item.id}/edit`,
          },
          {
            name: 'edit-roles',
            title: t('list.buttons.edit_roles'),
            icon: 'Users',
            url: `/admin/users/${item.id}/edit-roles`,
          },
        ],
      },
    ],
    data: users,
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
        <MainHeader title={t('list.title')} search={search} />
        <TableCard table={table} />
      </Main>
    </>
  );
}
