'use server';

import { AIMediaType } from '@/extensions/ai';
import { getAITasks, findAITaskById } from '@/shared/models/ai_task';
import { getSignUser as getCurrentUser } from '@/shared/models/user';

/**
 * 获取当前登录用户的 Infographic 生成任务列表
 *
 * 非程序员解释：
 * - 这里相当于"后台帮你把 ai_task 这张总表按照下面几个条件筛了一遍"：
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

/**
 * 根据任务 ID 获取单个 Infographic 任务详情
 *
 * 非程序员解释：
 * - 用于编辑功能：当用户点击"编辑"按钮时，需要加载原任务的详细信息
 * - 安全检查：只能获取当前登录用户自己的任务，防止越权访问
 * - 返回任务的完整信息，包括提示词、参数、生成结果等
 */
export async function getInfographicTaskByIdAction(taskId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const task = await findAITaskById(taskId);

  // 安全检查：确保任务属于当前用户且是 infographic 类型
  if (!task || task.userId !== user.id || task.scene !== 'ai_infographic') {
    return null;
  }

  return task;
}



