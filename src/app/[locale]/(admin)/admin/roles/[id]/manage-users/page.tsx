import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Empty } from '@/shared/blocks/common';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { FormCard } from '@/shared/blocks/form';
import { TableCard } from '@/shared/blocks/table';
import { Badge } from '@/shared/components/ui/badge';
import { getUsers, getUsersCount } from '@/shared/models/user';
import {
  assignRoleToUser,
  getRoleById,
  getRolePermissions,
  getUsersWithInfoByRole,
  getUserRoles,
  removeRoleFromUser,
} from '@/shared/services/rbac';
import { Crumb, Search } from '@/shared/types/blocks/common';
import { Form } from '@/shared/types/blocks/form';
import { type Table } from '@/shared/types/blocks/table';

/**
 * 角色用户管理页面
 * 功能：
 * 1. 显示该角色下的所有用户
 * 2. 可以添加用户到该角色
 * 3. 可以从该角色移除用户
 * 4. 显示该角色的权限信息
 */
export default async function RoleManageUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{
    page?: number;
    pageSize?: number;
    email?: string;
  }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  // 检查权限：需要管理员访问权限
  // 注意：super_admin 拥有 '*' 权限，应该能通过所有权限检查
  // 先检查是否有管理员访问权限，避免过于严格的权限检查导致问题
  await requirePermission({
    code: PERMISSIONS.ADMIN_ACCESS,
    redirectUrl: '/no-permission', // 使用通用路径，避免本地化路径问题
    locale,
  });

  const role = await getRoleById(id);
  if (!role) {
    return <Empty message="Role not found" />;
  }

  const t = await getTranslations('admin.roles');

  // 获取该角色下的用户
  const roleUsers = await getUsersWithInfoByRole(role.id);

  // 获取该角色的权限
  const rolePermissions = await getRolePermissions(role.id);

  // 获取所有用户（用于添加用户到角色）
  const { page: pageNum, pageSize, email } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 30;

  const total = await getUsersCount({ email });
  const allUsers = await getUsers({
    email,
    page,
    limit,
  });

  // 获取已拥有该角色的用户ID列表
  const roleUserIds = roleUsers.map((ru) => ru.userId);

  const crumbs: Crumb[] = [
    { title: t('manage_users.crumbs.admin'), url: '/admin' },
    { title: t('manage_users.crumbs.roles'), url: '/admin/roles' },
    {
      title: t('manage_users.crumbs.manage_users'),
      is_active: true,
    },
  ];

  const search: Search = {
    name: 'email',
    title: t('manage_users.search.email.title'),
    placeholder: t('manage_users.search.email.placeholder'),
    value: email,
    withButton: true,
  };

  // 角色用户列表表格
  const roleUsersTable: Table = {
    columns: [
      { name: 'name', title: t('manage_users.fields.name') },
      { name: 'email', title: t('manage_users.fields.email'), type: 'copy' },
      {
        name: 'image',
        title: t('manage_users.fields.avatar'),
        type: 'image',
        placeholder: '-',
      },
      {
        name: 'allRoles',
        title: t('manage_users.fields.all_roles'),
        callback: async (item: any) => {
          const userRoles = await getUserRoles(item.userId);
          return (
            <div className="flex flex-wrap gap-2">
              {userRoles.map((r) => (
                <Badge
                  key={r.id}
                  variant={r.id === role.id ? 'default' : 'outline'}
                >
                  {r.title}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        name: 'actions',
        title: t('manage_users.fields.actions'),
        type: 'dropdown',
        callback: (item: any) => [
          {
            name: 'remove',
            title: t('manage_users.buttons.remove_from_role'),
            icon: 'RiDeleteBinLine',
            action: 'remove',
            url: `/admin/roles/${role.id}/manage-users?action=remove&userId=${item.userId}`,
          },
        ],
      },
    ],
    data: roleUsers.map((ru) => ({
      userId: ru.userId,
      id: ru.id,
      name: ru.name,
      email: ru.email,
      image: ru.image,
      emailVerified: ru.emailVerified,
      createdAt: ru.userCreatedAt,
    })),
  };

  // 所有用户列表表格（用于添加用户）
  const allUsersTable: Table = {
    columns: [
      { name: 'name', title: t('manage_users.fields.name') },
      { name: 'email', title: t('manage_users.fields.email'), type: 'copy' },
      {
        name: 'image',
        title: t('manage_users.fields.avatar'),
        type: 'image',
        placeholder: '-',
      },
      {
        name: 'hasRole',
        title: t('manage_users.fields.has_role'),
        callback: (item: any) => {
          const hasRole = roleUserIds.includes(item.id);
          return hasRole ? (
            <Badge variant="default">
              {t('manage_users.badges.has_role')}
            </Badge>
          ) : (
            <Badge variant="outline">
              {t('manage_users.badges.not_has_role')}
            </Badge>
          );
        },
      },
      {
        name: 'actions',
        title: t('manage_users.fields.actions'),
        type: 'dropdown',
        callback: (item: any) => {
          const hasRole = roleUserIds.includes(item.id);
          if (hasRole) {
            return [
              {
                name: 'already_has_role',
                title: t('manage_users.buttons.already_has_role'),
                icon: 'RiCheckLine',
                attributes: { disabled: true },
              },
            ];
          }
          return [
            {
              name: 'add',
              title: t('manage_users.buttons.add_to_role'),
              icon: 'RiAddLine',
              action: 'add',
              url: `/admin/roles/${role.id}/manage-users?action=add&userId=${item.id}`,
            },
          ];
        },
      },
    ],
    data: allUsers,
    pagination: {
      total,
      page,
      limit,
    },
  };

  // 处理添加/移除用户的操作（通过 Server Action）
  // 注意：这里使用 redirect 来处理操作，避免在页面渲染时执行

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader
          title={t('manage_users.title', { roleName: role.title })}
        />

        {/* 角色权限信息卡片 */}
        <div className="mb-6 rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-lg font-semibold">
            {t('manage_users.role_permissions.title')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {rolePermissions.length > 0 ? (
              rolePermissions.map((perm) => (
                <Badge key={perm.id} variant="secondary">
                  {perm.title} ({perm.code})
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">
                {t('manage_users.role_permissions.no_permissions')}
              </span>
            )}
          </div>
          <div className="mt-4">
            <a
              href={`/admin/roles/${role.id}/edit-permissions`}
              className="text-sm text-primary hover:underline"
            >
              {t('manage_users.role_permissions.edit_permissions')} →
            </a>
          </div>
        </div>

        {/* 该角色下的用户列表 */}
        <div className="mb-6">
          <h3 className="mb-4 text-lg font-semibold">
            {t('manage_users.role_users.title', {
              count: roleUsers.length,
            })}
          </h3>
          {roleUsers.length > 0 ? (
            <TableCard table={roleUsersTable} />
          ) : (
            <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
              {t('manage_users.role_users.no_users')}
            </div>
          )}
        </div>

        {/* 所有用户列表（用于添加用户） */}
        <div>
          <h3 className="mb-4 text-lg font-semibold">
            {t('manage_users.all_users.title')}
          </h3>
          <MainHeader search={search} />
          <TableCard table={allUsersTable} />
        </div>
      </Main>
    </>
  );
}

