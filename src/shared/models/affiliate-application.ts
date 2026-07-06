import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { affiliateApplication, user } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';

export type AffiliateApplication = typeof affiliateApplication.$inferSelect;
export type NewAffiliateApplication = typeof affiliateApplication.$inferInsert;

// 申请状态枚举
export enum ApplicationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

// 创建申请
export async function createApplication(data: {
  userId: string;
  reason?: string;
  socialMedia?: string;
}) {
  const [record] = await db()
    .insert(affiliateApplication)
    .values({
      id: getUuid(),
      userId: data.userId,
      reason: data.reason,
      socialMedia: data.socialMedia,
      status: ApplicationStatus.PENDING,
    })
    .returning();
  return record;
}

// 获取用户的申请记录
export async function getApplicationByUserId(userId: string) {
  const [record] = await db()
    .select()
    .from(affiliateApplication)
    .where(eq(affiliateApplication.userId, userId))
    .orderBy(desc(affiliateApplication.createdAt))
    .limit(1);
  return record || null;
}

// 获取待审批申请列表（管理员用）
export async function getPendingApplications(options?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (options?.status) {
    conditions.push(eq(affiliateApplication.status, options.status));
  }

  const records = await db()
    .select({
      id: affiliateApplication.id,
      userId: affiliateApplication.userId,
      status: affiliateApplication.status,
      reason: affiliateApplication.reason,
      socialMedia: affiliateApplication.socialMedia,
      adminNote: affiliateApplication.adminNote,
      createdAt: affiliateApplication.createdAt,
      processedAt: affiliateApplication.processedAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(affiliateApplication)
    .leftJoin(user, eq(affiliateApplication.userId, user.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(affiliateApplication.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db()
    .select({ count: sql<number>`count(*)` })
    .from(affiliateApplication)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return {
    records,
    total: Number(total?.count || 0),
    page,
    limit,
    totalPages: Math.ceil(Number(total?.count || 0) / limit),
  };
}

// 更新申请状态（管理员用）
export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  adminNote?: string
) {
  const [record] = await db()
    .update(affiliateApplication)
    .set({
      status,
      adminNote,
      processedAt: new Date(),
    })
    .where(eq(affiliateApplication.id, id))
    .returning();
  return record;
}
