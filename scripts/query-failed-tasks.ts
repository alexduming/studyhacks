/**
 * 查询失败任务的用户信息
 *
 * 使用方法：
 * npx tsx scripts/query-failed-tasks.ts
 */

import { db } from '@/core/db';
import { aiTask } from '@/config/db/schema';
import { eq, or, like } from 'drizzle-orm';

const FAILED_TASK_IDS = [
  '78160667539488551',
  '78160287552813370',
  '78160745869210122',
  '78160774439558970',
];

async function queryFailedTasks() {
  console.log('🔍 查询失败任务的用户信息...\n');

  try {
    // 方法1: 直接查询 taskId
    console.log('方法1: 查询 ai_task 表中的 taskId 字段...');
    const tasksByTaskId = await db()
      .select()
      .from(aiTask)
      .where(
        or(
          eq(aiTask.taskId, FAILED_TASK_IDS[0]),
          eq(aiTask.taskId, FAILED_TASK_IDS[1]),
          eq(aiTask.taskId, FAILED_TASK_IDS[2]),
          eq(aiTask.taskId, FAILED_TASK_IDS[3])
        )
      );

    console.log(`找到 ${tasksByTaskId.length} 条记录\n`);

    if (tasksByTaskId.length > 0) {
      console.log('📋 任务详情:');
      for (const task of tasksByTaskId) {
        console.log(`  - Task ID: ${task.taskId}`);
        console.log(`    User ID: ${task.userId}`);
        console.log(`    Status: ${task.status}`);
        console.log(`    Cost Credits: ${task.costCredits}`);
        console.log(`    Provider: ${task.provider}`);
        console.log(`    Created At: ${task.createdAt}`);
        console.log('');
      }
    }

    // 方法2: 模糊查询 taskInfo 或 taskResult 字段
    console.log('\n方法2: 在 taskInfo/taskResult 中搜索这些 ID...');
    const tasksByContent = await db()
      .select()
      .from(aiTask)
      .where(
        or(
          like(aiTask.taskInfo, `%${FAILED_TASK_IDS[0]}%`),
          like(aiTask.taskInfo, `%${FAILED_TASK_IDS[1]}%`),
          like(aiTask.taskInfo, `%${FAILED_TASK_IDS[2]}%`),
          like(aiTask.taskInfo, `%${FAILED_TASK_IDS[3]}%`),
          like(aiTask.taskResult, `%${FAILED_TASK_IDS[0]}%`),
          like(aiTask.taskResult, `%${FAILED_TASK_IDS[1]}%`),
          like(aiTask.taskResult, `%${FAILED_TASK_IDS[2]}%`),
          like(aiTask.taskResult, `%${FAILED_TASK_IDS[3]}%`)
        )
      );

    console.log(`找到 ${tasksByContent.length} 条记录\n`);

    if (tasksByContent.length > 0) {
      console.log('📋 任务详情:');
      for (const task of tasksByContent) {
        console.log(`  - ID: ${task.id}`);
        console.log(`    Task ID: ${task.taskId}`);
        console.log(`    User ID: ${task.userId}`);
        console.log(`    Status: ${task.status}`);
        console.log(`    Cost Credits: ${task.costCredits}`);
        console.log(`    Provider: ${task.provider}`);
        console.log('');
      }
    }

    // 方法3: 查询最近的 infographic 任务
    console.log('\n方法3: 查询最近的 ai_infographic 任务...');
    const recentTasks = await db()
      .select()
      .from(aiTask)
      .where(eq(aiTask.scene, 'ai_infographic'))
      .orderBy(aiTask.createdAt)
      .limit(20);

    console.log(`找到 ${recentTasks.length} 条最近的任务\n`);

    if (recentTasks.length > 0) {
      console.log('📋 最近的任务:');
      for (const task of recentTasks) {
        console.log(`  - Task ID: ${task.taskId || 'N/A'}`);
        console.log(`    User ID: ${task.userId}`);
        console.log(`    Status: ${task.status}`);
        console.log(`    Cost Credits: ${task.costCredits}`);
        console.log(`    Created At: ${task.createdAt}`);
        console.log('');
      }
    }

    // 生成补偿建议
    console.log('\n💡 补偿建议:');
    console.log('如果你知道这些任务对应的用户ID，可以使用以下方式补偿：');
    console.log('\n1. 使用 API 端��（推荐）:');
    console.log('   POST /api/admin/refund-credits');
    console.log('   Body: {');
    console.log('     "userId": "用户ID",');
    console.log('     "credits": 6,');
    console.log('     "description": "Infographic 任务失败补偿"');
    console.log('   }');
    console.log('\n2. 或者在 Drizzle Studio 中手动查询并记录用户ID');

  } catch (error: any) {
    console.error('❌ 查询失败:', error);
    throw error;
  }
}

queryFailedTasks()
  .then(() => {
    console.log('\n✅ 查询完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 查询出错:', error);
    process.exit(1);
  });
