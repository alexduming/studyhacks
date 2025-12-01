import { redirect } from '@/core/i18n/navigation';
import { getSignUser } from '@/shared/models/user';
import {
  hasAllPermissions,
  hasAnyPermission,
  hasAnyRole,
  hasPermission,
  hasRole,
} from '@/shared/services/rbac';

// Permission constants
export const PERMISSIONS = {
  // Admin access
  ADMIN_ACCESS: 'admin.access',

  // Users
  USERS_READ: 'admin.users.read',
  USERS_WRITE: 'admin.users.write',
  USERS_DELETE: 'admin.users.delete',

  // Posts
  POSTS_READ: 'admin.posts.read',
  POSTS_WRITE: 'admin.posts.write',
  POSTS_DELETE: 'admin.posts.delete',

  // Categories
  CATEGORIES_READ: 'admin.categories.read',
  CATEGORIES_WRITE: 'admin.categories.write',
  CATEGORIES_DELETE: 'admin.categories.delete',

  // Payments
  PAYMENTS_READ: 'admin.payments.read',

  // Subscriptions
  SUBSCRIPTIONS_READ: 'admin.subscriptions.read',

  // Credits
  CREDITS_READ: 'admin.credits.read',
  CREDITS_WRITE: 'admin.credits.write',

  // API Keys
  APIKEYS_READ: 'admin.apikeys.read',
  APIKEYS_WRITE: 'admin.apikeys.write',
  APIKEYS_DELETE: 'admin.apikeys.delete',

  // Settings
  SETTINGS_READ: 'admin.settings.read',
  SETTINGS_WRITE: 'admin.settings.write',

  // Roles & Permissions
  ROLES_READ: 'admin.roles.read',
  ROLES_WRITE: 'admin.roles.write',
  ROLES_DELETE: 'admin.roles.delete',

  PERMISSIONS_READ: 'admin.permissions.read',
  PERMISSIONS_WRITE: 'admin.permissions.write',
  PERMISSIONS_DELETE: 'admin.permissions.delete',

  // AI Tasks
  AITASKS_READ: 'admin.ai-tasks.read',
  AITASKS_WRITE: 'admin.ai-tasks.write',
  AITASKS_DELETE: 'admin.ai-tasks.delete',
} as const;

/**
 * Permission guard error
 */
export class PermissionDeniedError extends Error {
  constructor(message = 'Permission denied') {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Check if user can access admin area
 */
export async function canAccessAdmin(userId: string): Promise<boolean> {
  return await hasPermission(userId, PERMISSIONS.ADMIN_ACCESS);
}

/**
 * Check if current user has permission, throw error if not
 */
export async function requirePermission({
  code,
  redirectUrl,
  locale,
}: {
  code: string;
  redirectUrl?: string;
  locale?: string;
}): Promise<void> {
  const user = await getSignUser();

  if (!user) {
    if (redirectUrl) {
      redirect({ href: redirectUrl, locale: locale || '' });
    }
    throw new PermissionDeniedError('User not authenticated');
  }

  const allowed = await hasPermission(user.id, code);

  if (!allowed) {
    if (redirectUrl) {
      redirect({ href: redirectUrl, locale: locale || '' });
    }
    throw new PermissionDeniedError(`Permission required: ${code}`);
  }
}

/**
 * Check if current user has any of the permissions, throw error if not
 */
export async function requireAnyPermission({
  codes,
  redirectUrl,
  locale,
}: {
  codes: string[];
  redirectUrl?: string;
  locale?: string;
}): Promise<void> {
  const user = await getSignUser();

  if (!user) {
    if (redirectUrl) {
      redirect({ href: redirectUrl, locale: locale || '' });
    }
    throw new PermissionDeniedError('User not authenticated');
  }

  const allowed = await hasAnyPermission(user.id, codes);

  if (!allowed) {
    if (redirectUrl) {
      redirect({ href: redirectUrl, locale: locale || '' });
    }
    throw new PermissionDeniedError(
      `Any of these permissions required: ${codes.join(', ')}`
    );
  }
}

/**
 * Check if current user has all of the permissions, throw error if not
 */
export async function requireAllPermissions({
  codes,
  redirectUrl,
  locale,
}: {
  codes: string[];
  redirectUrl?: string;
  locale?: string;
}): Promise<void> {
  const user = await getSignUser();

  if (!user) {
    if (redirectUrl) {
      redirect({ href: redirectUrl, locale: locale || '' });
    }
    throw new PermissionDeniedError('User not authenticated');
  }

  const allowed = await hasAllPermissions(user.id, codes);

  if (!allowed) {
    if (redirectUrl) {
      redirect({ href: redirectUrl, locale: locale || '' });
    }
    throw new PermissionDeniedError(
      `All of these permissions required: ${codes.join(', ')}`
    );
  }
}

/**
 * Check if current user has role, throw error if not
 */
export async function requireRole({
  roleName,
  redirectUrl,
  locale,
}: {
  roleName: string;
  redirectUrl?: string;
  locale?: string;
}): Promise<void> {
  const user = await getSignUser();

  if (!user) {
    if (redirectUrl) {
      redirect({ href: redirectUrl, locale: locale || '' });
    }
    throw new PermissionDeniedError('User not authenticated');
  }

  const allowed = await hasRole(user.id, roleName);

  if (!allowed) {
    if (redirectUrl) {
      redirect({ href: redirectUrl, locale: locale || '' });
    }
    throw new PermissionDeniedError(`Role required: ${roleName}`);
  }
}

/**
 * Check if current user has any of the roles, throw error if not
 */
export async function requireAnyRole({
  roleNames,
  redirectUrl,
  locale,
}: {
  roleNames: string[];
  redirectUrl?: string;
  locale?: string;
}): Promise<void> {
  const user = await getSignUser();

  if (!user) {
    if (redirectUrl) {
      redirect({ href: redirectUrl, locale: locale || '' });
    }
    throw new PermissionDeniedError('User not authenticated');
  }

  const allowed = await hasAnyRole(user.id, roleNames);

  if (!allowed) {
    if (redirectUrl) {
      redirect({ href: redirectUrl, locale: locale || '' });
    }
    throw new PermissionDeniedError(
      `Any of these roles required: ${roleNames.join(', ')}`
    );
  }
}

/**
 * Check if current user can access admin area
 * 检查当前用户是否可以访问管理员区域
 * 如果用户未登录，重定向到登录页
 * 如果用户没有管理员权限，重定向到无权限页面
 */
export async function requireAdminAccess({
  redirectUrl,
  locale,
}: {
  redirectUrl?: string;
  locale?: string;
}): Promise<void> {
  const user = await getSignUser();

  // 如果用户未登录，重定向到登录页
  if (!user) {
    redirect({ href: '/sign-in', locale: locale || '' });
    return; // 确保函数不会继续执行
  }

  // 检查用户是否有管理员权限（需要查询数据库）
  // 注意：如果数据库连接慢，这里可能会等待较长时间
  try {
    const allowed = await canAccessAdmin(user.id);

    // 如果用户没有管理员权限，重定向到无权限页面
    if (!allowed) {
      // 如果提供了重定向 URL，使用它；否则使用默认的无权限页面
      const targetUrl = redirectUrl || '/no-permission';
      redirect({ href: targetUrl, locale: locale || '' });
      return; // 确保函数不会继续执行
    }
  } catch (error) {
    // 如果数据库查询失败（比如连接超时），记录错误并重定向到登录页
    // 这样可以避免页面卡死，用户需要重新登录
    console.error('[权限检查] 数据库查询失败，重定向到登录页:', error);
    redirect({ href: '/sign-in', locale: locale || '' });
    return;
  }
}

/**
 * Get current user with permission check
 * Returns null if user doesn't have permission
 */
export async function getCurrentUserWithPermission({
  code,
  locale,
}: {
  code: string;
  locale?: string;
}): Promise<{ id: string; email: string; name: string } | null> {
  const user = await getSignUser();
  if (!user) return null;

  const allowed = await hasPermission(user.id, code);
  if (!allowed) return null;

  return user;
}

/**
 * Check page access permissions
 * Returns true if user has access, false otherwise
 */
export async function checkPageAccess({
  codes,
  locale,
}: {
  codes: string[];
  locale?: string;
}): Promise<boolean> {
  const user = await getSignUser();
  if (!user) return false;

  return await hasAnyPermission(user.id, codes);
}

/**
 * Higher-order function for API routes with permission check
 */
export function withPermission<T extends (...args: any[]) => any>(
  handler: T,
  {
    code,
    locale,
  }: {
    code: string;
    locale?: string;
  }
): T {
  return (async (...args: Parameters<T>) => {
    await requirePermission({ code, locale });
    return handler(...args);
  }) as T;
}

/**
 * Higher-order function for API routes with role check
 */
export function withRole<T extends (...args: any[]) => any>(
  handler: T,
  {
    roleName,
    locale,
  }: {
    roleName: string;
    locale?: string;
  }
): T {
  return (async (...args: Parameters<T>) => {
    await requireRole({ roleName, locale });
    return handler(...args);
  }) as T;
}
