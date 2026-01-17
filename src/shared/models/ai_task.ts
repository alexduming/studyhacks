import { and, count, desc, eq, or, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { aiTask, credit } from '@/config/db/schema';
import { AITaskStatus } from '@/extensions/ai';
import { getUuid } from '@/shared/lib/hash';
import { appendUserToResult, User } from '@/shared/models/user';

import { consumeCredits, CreditStatus } from './credit';

export type AITask = typeof aiTask.$inferSelect & {
  user?: User;
  transactionNo?: string;
};
export type NewAITask = typeof aiTask.$inferInsert;
export type UpdateAITask = Partial<Omit<NewAITask, 'id' | 'createdAt'>>;

/**
 * 创建 AI 任务并同时扣减积分（“完整模式”）
 *
 * 非程序员解释：
 * - 这个函数负责两件事情：
 *   1）在 ai_task 表里插入一条任务记录
 *   2）如果传入了 costCredits > 0，就顺便在积分表里扣除对应的积分
 * - 适用于“先记任务 + 同时扣积分”的通用场景
 *
 * 注意：
 * - 如果你的业务代码已经单独调用过 consumeCredits 再调用这个函数，就会产生“双重扣费”的问题
 *   所以后面我们会再提供一个“只记任务，不扣积分”的精简版本
 */
export async function createAITask(newAITask: NewAITask) {
  const result = await db().transaction(async (tx) => {
    // 1. 创建任务记录
    const [taskResult] = await tx.insert(aiTask).values(newAITask).returning();

    if (newAITask.costCredits && newAITask.costCredits > 0) {
      // 2. 如果需要扣积分，这里统一执行扣费逻辑
      const consumedCredit = await consumeCredits({
        userId: newAITask.userId,
        credits: newAITask.costCredits,
        scene: newAITask.scene || undefined,
        description: `generate ${newAITask.mediaType}`,
        metadata: JSON.stringify({
          type: 'ai-task',
          mediaType: taskResult.mediaType,
          taskId: taskResult.id,
        }),
      });

      // 3. 把扣费记录的 id 回写到任务表，方便后续失败时回滚积分
      if (consumedCredit && consumedCredit.id) {
        taskResult.creditId = consumedCredit.id;
        await tx
          .update(aiTask)
          .set({ creditId: consumedCredit.id })
          .where(eq(aiTask.id, taskResult.id));
      }
    }

    return taskResult;
  });

  return result;
}

/**
 * 创建 AI 任务但**不**在这里扣积分（“精简模式”）
 *
 * 非程序员解释：
 * - 有些业务（比如当前的 Infographic）已经在自己的接口里先扣好了积分
 * - 为了避免重复扣费，我们需要一个“只写 ai_task 表，不再触碰积分”的版本
 * - 这个函数就是做最简单的事情：插入一条任务记录并返回，完全不改积分表
 *
 * 使用场景：
 * - 已经在别处调用过 consumeCredits
 * - 只是想把任务记录下来，用于「历史列表 / 统计看板」
 */
export async function createAITaskRecordOnly(
  newAITask: Omit<NewAITask, 'id' | 'createdAt' | 'updatedAt'>
) {
  const [taskResult] = await db()
    .insert(aiTask)
    .values({
      ...newAITask,
      // 这里统一生成一个全局唯一 ID，避免调用方还要自己关心 ID 生成细节
      id: getUuid(),
    })
    .returning();
  return taskResult;
}

export async function findAITaskById(id: string) {
  const [result] = await db().select().from(aiTask).where(eq(aiTask.id, id));
  return result;
}

export async function updateAITaskById(id: string, updateAITask: UpdateAITask) {
  const result = await db().transaction(async (tx) => {
    // task failed, Revoke credit consumption record
    if (updateAITask.status === AITaskStatus.FAILED && updateAITask.creditId) {
      // get consumed credit record
      const [consumedCredit] = await tx
        .select()
        .from(credit)
        .where(eq(credit.id, updateAITask.creditId));
      if (consumedCredit && consumedCredit.status === CreditStatus.ACTIVE) {
        const consumedItems = JSON.parse(consumedCredit.consumedDetail || '[]');

        // console.log('consumedItems', consumedItems);

        // add back consumed credits
        await Promise.all(
          consumedItems.map((item: any) => {
            if (item && item.creditId && item.creditsConsumed > 0) {
              return tx
                .update(credit)
                .set({
                  remainingCredits: sql`${credit.remainingCredits} + ${item.creditsConsumed}`,
                })
                .where(eq(credit.id, item.creditId));
            }
          })
        );

        // delete consumed credit record
        await tx
          .update(credit)
          .set({
            status: CreditStatus.DELETED,
          })
          .where(eq(credit.id, updateAITask.creditId));
      }
    }

    // update task
    const [result] = await db()
      .update(aiTask)
      .set(updateAITask)
      .where(eq(aiTask.id, id))
      .returning();

    return result;
  });

  return result;
}

export async function getAITasksCount({
  userId,
  status,
  mediaType,
  provider,
  scene,
  search,
}: {
  userId?: string;
  status?: string;
  mediaType?: string;
  provider?: string;
  scene?: string;
  search?: string;
}): Promise<number> {
  const query = db()
    .select({ count: count() })
    .from(aiTask)
    .leftJoin(credit, eq(aiTask.creditId, credit.id));

  const whereConditions = [
    userId ? eq(aiTask.userId, userId) : undefined,
    mediaType ? eq(aiTask.mediaType, mediaType) : undefined,
    provider ? eq(aiTask.provider, provider) : undefined,
    status ? eq(aiTask.status, status) : undefined,
    scene ? eq(aiTask.scene, scene) : undefined,
  ];

  if (search) {
    whereConditions.push(
      or(
        eq(aiTask.id, search),
        eq(aiTask.taskId, search),
        eq(credit.transactionNo, search)
      )
    );
  }

  const [result] = await query.where(and(...whereConditions.filter(Boolean)));

  return result?.count || 0;
}

export async function getAITasks({
  userId,
  status,
  mediaType,
  provider,
  scene,
  page = 1,
  limit = 30,
  getUser = false,
  search,
}: {
  userId?: string;
  status?: string;
  mediaType?: string;
  provider?: string;
  scene?: string;
  page?: number;
  limit?: number;
  getUser?: boolean;
  search?: string;
}): Promise<AITask[]> {
  const whereConditions = [
    userId ? eq(aiTask.userId, userId) : undefined,
    mediaType ? eq(aiTask.mediaType, mediaType) : undefined,
    provider ? eq(aiTask.provider, provider) : undefined,
    status ? eq(aiTask.status, status) : undefined,
    scene ? eq(aiTask.scene, scene) : undefined,
  ];

  if (search) {
    whereConditions.push(
      or(
        eq(aiTask.id, search),
        eq(aiTask.taskId, search),
        eq(credit.transactionNo, search)
      )
    );
  }

  const result = await db()
    .select({
      id: aiTask.id,
      userId: aiTask.userId,
      taskId: aiTask.taskId,
      mediaType: aiTask.mediaType,
      provider: aiTask.provider,
      model: aiTask.model,
      prompt: aiTask.prompt,
      options: aiTask.options,
      status: aiTask.status,
      taskInfo: aiTask.taskInfo,
      taskResult: aiTask.taskResult,
      costCredits: aiTask.costCredits,
      scene: aiTask.scene,
      creditId: aiTask.creditId,
      createdAt: aiTask.createdAt,
      updatedAt: aiTask.updatedAt,
      deletedAt: aiTask.deletedAt,
      transactionNo: credit.transactionNo,
    })
    .from(aiTask)
    .leftJoin(credit, eq(aiTask.creditId, credit.id))
    .where(and(...whereConditions.filter(Boolean)))
    .orderBy(desc(aiTask.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  if (getUser) {
    return appendUserToResult(result) as unknown as AITask[];
  }

  return result as unknown as AITask[];
}
