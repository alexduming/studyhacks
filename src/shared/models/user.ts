import { headers } from 'next/headers';
import { count, desc, eq, inArray } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { user } from '@/config/db/schema';

import { Permission, Role } from '../services/rbac';
import { getRemainingCredits } from './credit';

export interface UserCredits {
  remainingCredits: number;
  expiresAt: Date | null;
}

export type User = typeof user.$inferSelect & {
  isAdmin?: boolean;
  credits?: UserCredits;
  roles?: Role[];
  permissions?: Permission[];
};
export type NewUser = typeof user.$inferInsert;
export type UpdateUser = Partial<Omit<NewUser, 'id' | 'createdAt' | 'email'>>;

export async function updateUser(userId: string, updatedUser: UpdateUser) {
  const [result] = await db()
    .update(user)
    .set(updatedUser)
    .where(eq(user.id, userId))
    .returning();

  return result;
}

export async function findUserById(userId: string) {
  const [result] = await db().select().from(user).where(eq(user.id, userId));

  return result;
}

export async function getUsers({
  page = 1,
  limit = 30,
  email,
}: {
  email?: string;
  page?: number;
  limit?: number;
} = {}): Promise<User[]> {
  const result = await db()
    .select()
    .from(user)
    .where(email ? eq(user.email, email) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return result;
}

export async function getUsersCount({ email }: { email?: string }) {
  const [result] = await db()
    .select({ count: count() })
    .from(user)
    .where(email ? eq(user.email, email) : undefined);
  return result?.count || 0;
}

export async function getUserByUserIds(userIds: string[]) {
  const result = await db()
    .select()
    .from(user)
    .where(inArray(user.id, userIds));

  return result;
}

/**
 * 判断是否为可重试的认证错误
 * 非程序员解释：
 * - 有些错误是临时的（比如数据库连接问题），可以重试
 * - 有些错误是永久的（比如认证失败、会话过期），不应该重试
 */
function isRetryableAuthError(error: any): boolean {
  if (!error) return false;

  const errorMessage =
    error instanceof Error ? error.message : String(error);
  const errorCode = (error as any)?.code || '';
  const statusCode = (error as any)?.statusCode || (error as any)?.status;

  // 检查错误代码（数据库连接相关错误）
  const retryableCodes = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
    'ECONNABORTED',
    'CONNECT_TIMEOUT',
    '504', // Gateway Timeout
    '502', // Bad Gateway
    '503', // Service Unavailable
  ];

  if (retryableCodes.includes(errorCode) || retryableCodes.includes(String(statusCode))) {
    return true;
  }

  // 检查 HTTP 状态码（5xx 错误通常是服务器临时问题）
  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // 检查错误消息中的关键词
  const retryableKeywords = [
    'failed to get session',
    'database',
    'connection',
    'timeout',
    'network',
    'internal server error',
    'fetch failed',
    'socket',
    'closed',
    'hang up',
    'upstream',
    'busy',
  ];

  const lowerMessage = errorMessage.toLowerCase();
  if (retryableKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return true;
  }

  return false;
}

/**
 * 获取已登录用户信息
 * 非程序员解释：
 * - 这个方法会尝试获取当前登录用户的信息
 * - 如果遇到临时错误（如数据库连接问题），会自动重试
 * - 如果用户未登录或认证失败，返回 null
 */
export async function getUserInfo() {
  try {
    const signUser = await getSignUser();
    return signUser;
  } catch (error) {
    // 如果是可重试的错误，尝试重试一次
    if (isRetryableAuthError(error)) {
      try {
        console.log('[User] 第一次获取用户信息失败，准备重试:', error);
        // 等待 500ms 后重试一次
        await new Promise((resolve) => setTimeout(resolve, 500));
        const signUser = await getSignUser();
        return signUser;
      } catch (retryError) {
        // 重试也失败，记录错误但不抛出（返回 null 表示未登录）
        console.warn('[User] 获取用户信息失败（已重试）:', retryError);
        return null;
      }
    }

    // 不可重试的错误（如认证失败），返回 null 而不是抛出错误
    // 这样调用者可以优雅地处理"用户未登录"的情况
    console.warn('[User] 获取用户信息失败:', error);
    return null;
  }
}

export async function getUserCredits(userId: string) {
  const remainingCredits = await getRemainingCredits(userId);

  return { remainingCredits };
}

/**
 * 获取已登录用户（内部方法）
 * 非程序员解释：
 * - 这是实际调用认证系统的方法
 * - 修正：现在内部集成了重试机制和错误捕获，避免抛出异常导致页面崩溃
 */
export async function getSignUser() {
  // 定义内部获取函数
  const fetchSession = async () => {
    const auth = await getAuth();
    return await auth.api.getSession({
      headers: await headers(),
    });
  };

  try {
    const session = await fetchSession();
    return session?.user;
  } catch (error) {
    // 记录详细错误信息
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code || '';
    const statusCode = (error as any)?.statusCode || (error as any)?.status;

    console.warn('[Auth] getSession 第一次尝试失败:', {
      message: errorMessage,
      code: errorCode,
      statusCode,
    });

    // 如果是可重试的错误，尝试重试一次
    if (isRetryableAuthError(error)) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const session = await fetchSession();
        return session?.user;
      } catch (retryError) {
        console.warn('[Auth] getSession 重试也失败:', retryError);
        // 重试失败，为了页面稳定性，返回 null 而不是抛出
        return null;
      }
    }

    // 如果不可重试或重试失败，吞掉错误返回 null
    // 这样即使 Auth 服务挂了，网站至少还能访问（虽然是未登录状态）
    return null;
  }
}

export async function appendUserToResult(result: any) {
  if (!result || !result.length) {
    return result;
  }

  const userIds = result.map((item: any) => item.userId);
  const users = await getUserByUserIds(userIds);
  result = result.map((item: any) => {
    const user = users.find((user: any) => user.id === item.userId);
    return { ...item, user };
  });

  return result;
}
