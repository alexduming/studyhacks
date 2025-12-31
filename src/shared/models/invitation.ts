import { and, count, desc, eq, isNull, gte, lte, sum, like } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { db } from '@/core/db';
import { invitation, credit } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';
import { CreditTransactionScene } from '@/shared/models/credit';

import { appendUserToResult, User } from './user';

export const INVITATION_REWARD_AMOUNT = 30;
export const MONTHLY_INVITATION_REWARD_LIMIT = 600;

/**
 * 邀请码类型定义
 * 
 * 非程序员解释：
 * - Invitation: 完整的邀请码信息，包括邀请人和被邀请人
 * - NewInvitation: 创建新邀请码时需要的字段
 * - UpdateInvitation: 更新邀请码时可以修改的字段
 */
export type Invitation = typeof invitation.$inferSelect & {
  inviter?: User;
  invitee?: User;
};
export type NewInvitation = typeof invitation.$inferInsert;
export type UpdateInvitation = Partial<Omit<NewInvitation, 'id' | 'createdAt'>>;

/**
 * 邀请码状态枚举
 */
export enum InvitationStatus {
  PENDING = 'pending',   // 待接受（还没有人使用）
  ACCEPTED = 'accepted', // 已接受（有人使用并注册成功）
  EXPIRED = 'expired',   // 已过期
}

/**
 * 生成唯一的邀请码
 * 
 * 非程序员解释：
 * - 使用 nanoid 生成8位随机字符串作为邀请码
 * - 字符串只包含数字和大小写字母，易于分享
 * - 如果碰撞（极少见），会重试生成
 */
export function generateInviteCode(): string {
  // 生成8位邀请码，使用字母和数字
  return nanoid(8).toUpperCase();
}

/**
 * 创建邀请码
 * 
 * 非程序员解释：
 * - 用户可以生成自己的专属邀请码
 * - 邀请码是唯一的，不会重复
 * - 可以设置过期时间（可选）
 */
export async function createInvitation(newInvitation: NewInvitation): Promise<Invitation> {
  const [result] = await db().insert(invitation).values(newInvitation).returning();
  return result;
}

/**
 * 根据邀请码查询邀请信息（用于获取邀请人信息）
 * 
 * 非程序员解释：
 * - 在注册时，需要验证用户输入的邀请码是否有效
 * - 查询邀请码对应的邀请人信息（不限制状态，允许邀请码被多人使用）
 * - 这样设计是为了让一个邀请码可以像推广码一样被多人使用
 * 
 * 修复说明（2025-12-20）：
 * - 移除了 status='pending' 的限制
 * - 现在一个邀请码可以被多个用户使用
 * - 每次使用时会创建新的 invitation 记录
 */
export async function getInvitationByCode(code: string): Promise<Invitation | null> {
  // 查询该邀请码对应的邀请人信息
  // 只需要获取邀请人ID和邮箱，用于发放奖励
  const [result] = await db()
    .select()
    .from(invitation)
    .where(eq(invitation.code, code.toUpperCase()))
    .limit(1);

  return result || null;
}

/**
 * 根据ID查询邀请信息
 */
export async function getInvitationById(id: string): Promise<Invitation | null> {
  const [result] = await db()
    .select()
    .from(invitation)
    .where(eq(invitation.id, id))
    .limit(1);

  return result || null;
}

/**
 * 更新邀请码信息
 * 
 * 非程序员解释：
 * - 当有人使用邀请码注册时，需要更新邀请码状态
 * - 记录被邀请人的信息和接受时间
 */
export async function updateInvitation(
  id: string,
  updateData: UpdateInvitation
): Promise<Invitation> {
  const [result] = await db()
    .update(invitation)
    .set(updateData)
    .where(eq(invitation.id, id))
    .returning();

  return result;
}

/**
 * 获取用户的邀请列表
 * 
 * 非程序员解释：
 * - 用户可以查看自己发出的所有邀请
 * - 包括邀请了多少人、有多少人已注册等信息
 */
export async function getInvitations({
  inviterId,
  inviteeId,
  status,
  getUser = false,
  page = 1,
  limit = 30,
}: {
  inviterId?: string;
  inviteeId?: string;
  status?: InvitationStatus;
  getUser?: boolean;
  page?: number;
  limit?: number;
}): Promise<Invitation[]> {
  const result = await db()
    .select()
    .from(invitation)
    .where(
      and(
        inviterId ? eq(invitation.inviterId, inviterId) : undefined,
        inviteeId ? eq(invitation.inviteeId, inviteeId) : undefined,
        status ? eq(invitation.status, status) : undefined
      )
    )
    .orderBy(desc(invitation.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  if (getUser) {
    return appendUserToResult(result);
  }

  return result;
}

/**
 * 获取邀请数量统计
 * 
 * 非程序员解释：
 * - 统计用户发出的邀请总数
 * - 可以按状态筛选（如只统计已接受的邀请）
 */
export async function getInvitationsCount({
  inviterId,
  inviteeId,
  status,
}: {
  inviterId?: string;
  inviteeId?: string;
  status?: InvitationStatus;
}): Promise<number> {
  const [result] = await db()
    .select({ count: count() })
    .from(invitation)
    .where(
      and(
        inviterId ? eq(invitation.inviterId, inviterId) : undefined,
        inviteeId ? eq(invitation.inviteeId, inviteeId) : undefined,
        status ? eq(invitation.status, status) : undefined
      )
    );

  return result?.count || 0;
}

/**
 * 获取用户当月通过邀请获得的积分总额
 * 
 * 非程序员解释：
 * - 用于限制每月最高邀请奖励
 * - 查询当前月份内所有已接受邀请的奖励总和
 * - 直接查询 credit 表，确保统计准确（包括旧的历史数据）
 */
export async function getMonthlyInvitationCredits(inviterId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // 查询积分表中的邀请奖励记录
  const [result] = await db()
    .select({ total: sum(credit.credits) })
    .from(credit)
    .where(
      and(
        eq(credit.userId, inviterId),
        eq(credit.transactionScene, CreditTransactionScene.AWARD),
        like(credit.description, 'Invitation reward%'), // 匹配 "Invitation reward..."
        gte(credit.createdAt, startOfMonth),
        lte(credit.createdAt, endOfMonth)
      )
    );

  // sum 可能返回 string，需要转换
  return Number(result?.total) || 0;
}

/**
 * 获取或创建用户的邀请码
 * 
 * 非程序员解释：
 * - 每个用户都有一个固定的邀请码
 * - 如果用户还没有邀请码，自动创建一个
 * - 如果已经有了，直接返回现有的
 */
export async function getOrCreateUserInviteCode(
  userId: string,
  userEmail: string
): Promise<string> {
  // 查找用户是否已有邀请码（查找第一个pending状态的邀请码）
  const [existingInvitation] = await db()
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.inviterId, userId),
        eq(invitation.status, InvitationStatus.PENDING),
        isNull(invitation.inviteeId) // 确保是空的邀请码（还没被使用）
      )
    )
    .limit(1);

  if (existingInvitation) {
    return existingInvitation.code;
  }

  // 如果没有，创建一个新的
  let code = generateInviteCode();
  let attempts = 0;
  const maxAttempts = 10;

  // 确保邀请码唯一，如果冲突则重新生成
  while (attempts < maxAttempts) {
    try {
      const newInvitation = await createInvitation({
        id: getUuid(),
        inviterId: userId,
        inviterEmail: userEmail,
        code: code,
        status: InvitationStatus.PENDING,
      });
      return newInvitation.code;
    } catch (error: any) {
      // 如果是唯一性冲突错误，重新生成邀请码
      if (error?.code === '23505' || error?.message?.includes('unique')) {
        code = generateInviteCode();
        attempts++;
      } else {
        throw error;
      }
    }
  }

  throw new Error('Failed to generate unique invite code after multiple attempts');
}

/**
 * 检查用户是否已经被邀请过
 * 
 * 非程序员解释：
 * - 每个用户只能被邀请一次
 * - 防止同一个用户多次使用不同的邀请码注册
 */
export async function checkUserAlreadyInvited(email: string): Promise<boolean> {
  const [result] = await db()
    .select({ count: count() })
    .from(invitation)
    .where(
      and(
        eq(invitation.inviteeEmail, email),
        eq(invitation.status, InvitationStatus.ACCEPTED)
      )
    );

  return (result?.count || 0) > 0;
}
