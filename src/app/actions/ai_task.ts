'use server';

import { AIMediaType } from '@/extensions/ai';
import { getAITasks } from '@/shared/models/ai_task';
import { getSignUser as getCurrentUser } from '@/shared/models/user';

/**
 * 获取当前登录用户的 Infographic 生成任务列表
 *
 * 非程序员解释：
 * - 这里相当于“后台帮你把 ai_task 这张总表按照下面几个条件筛了一遍”：
 *   1）只看当前登录用户自己的记录
 *   2）mediaType=IMAGE（也就是图片类的 AI 任务）
 *   3）scene='ai_infographic'（只保留信息图生成的任务，不和别的图片混在一起）
 * - 返回结果会在 /library/infographics 页面里渲染成一个历史列表
 */
export async function getUserInfographicTasksAction() {
  const user = await getCurrentUser();
  if (!user) {
    // 未登录时直接返回空数组，前端会显示友好的空状态
    return [];
  }

  const tasks = await getAITasks({
    userId: user.id,
    mediaType: AIMediaType.IMAGE,
    scene: 'ai_infographic',
    // 这里只取最近 50 条，避免一次性把非常久远的历史全部拉出来
    limit: 50,
  });

  return tasks;
}



