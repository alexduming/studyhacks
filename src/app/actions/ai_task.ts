'use server';

import { AIMediaType } from '@/extensions/ai';
import { getAITasks, findAITaskById, updateAITaskById } from '@/shared/models/ai_task';
import { getSignUser as getCurrentUser } from '@/shared/models/user';

/**
 * 历史记录条目接口
 */
export interface InfographicHistoryEntry {
  id: string;
  imageUrl: string;
  prompt: string;
  createdAt: number;
}

/**
 * 获取当前登录用户的 Infographic 生成任务列表
 *
 * 非程序员解释：
 * - 这里相当于"后台帮你把 ai_task 这张总表按照下面几个条件筛了一遍"：
 *   1）只看当前登录用户自己的记录
 *   2）mediaType=IMAGE（也就是图片类的 AI 任务）
 *   3）scene='ai_infographic'（只保留信息图生成的任务，不和别的混在一起）
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

/**
 * 更新 Infographic 任务的历史记录
 *
 * 非程序员解释：
 * - 当用户编辑信息图后，需要把新版本添加到历史记录中
 * - 历史记录存储在 taskResult 的 history 字段中
 * - 最多保留 20 个历史版本
 * - 同时更新当前显示的图片 URL
 */
export async function updateInfographicHistoryAction(params: {
  taskId: string;
  newImageUrl: string;
  editPrompt: string;
}) {
  const { taskId, newImageUrl, editPrompt } = params;

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const task = await findAITaskById(taskId);

  // 安全检查
  if (!task || task.userId !== user.id || task.scene !== 'ai_infographic') {
    throw new Error('Task not found or access denied');
  }

  // 解析现有的 taskResult
  let taskResult: {
    imageUrls: string[];
    history?: InfographicHistoryEntry[];
  };

  try {
    taskResult = JSON.parse(task.taskResult || '{}');
  } catch {
    taskResult = { imageUrls: [] };
  }

  // 获取当前图片 URL（编辑前的版本）
  const currentImageUrl = taskResult.imageUrls?.[0];
  const currentHistory = taskResult.history || [];

  // 如果是首次编辑，先把原始图片存入历史记录
  if (currentHistory.length === 0 && currentImageUrl) {
    currentHistory.push({
      id: `${taskId}-original`,
      imageUrl: currentImageUrl,
      prompt: '原始版本',
      createdAt: Date.now() - 1, // 稍早一点，确保排在编辑结果之后
    });
  }

  // 添加新的编辑版本到历史记录（新版本在前）
  const newHistoryEntry: InfographicHistoryEntry = {
    id: `${taskId}-${Date.now()}`,
    imageUrl: newImageUrl,
    prompt: editPrompt || '编辑版本',
    createdAt: Date.now(),
  };

  // 新记录放在前面，最多保留 20 条
  const newHistory = [newHistoryEntry, ...currentHistory].slice(0, 20);

  // 更新 taskResult
  const updatedTaskResult = {
    ...taskResult,
    imageUrls: [newImageUrl], // 更新当前显示的图片
    history: newHistory,
  };

  // 保存到数据库
  await updateAITaskById(taskId, {
    taskResult: JSON.stringify(updatedTaskResult),
  });

  return {
    success: true,
    history: newHistory,
  };
}

/**
 * 切换 Infographic 到指定的历史版本
 *
 * 非程序员解释：
 * - 当用户点击历史缩略图时，切换到该版本
 * - 只更新当前显示的图片 URL，不修改历史记录
 */
export async function switchInfographicVersionAction(params: {
  taskId: string;
  imageUrl: string;
}) {
  const { taskId, imageUrl } = params;

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const task = await findAITaskById(taskId);

  // 安全检查
  if (!task || task.userId !== user.id || task.scene !== 'ai_infographic') {
    throw new Error('Task not found or access denied');
  }

  // 解析现有的 taskResult
  let taskResult: {
    imageUrls: string[];
    history?: InfographicHistoryEntry[];
  };

  try {
    taskResult = JSON.parse(task.taskResult || '{}');
  } catch {
    taskResult = { imageUrls: [] };
  }

  // 更新当前显示的图片
  const updatedTaskResult = {
    ...taskResult,
    imageUrls: [imageUrl],
  };

  // 保存到数据库
  await updateAITaskById(taskId, {
    taskResult: JSON.stringify(updatedTaskResult),
  });

  return { success: true };
}



