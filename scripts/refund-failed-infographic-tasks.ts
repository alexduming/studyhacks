/**
 * 脚本：为失败的 Infographic 任务补偿积分
 *
 * 使用方法：
 * npx tsx scripts/refund-failed-infographic-tasks.ts
 */

import { db } from '@/core/db';
import { aiTask } from '@/config/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { refundCredits } from '@/shared/models/credit';

// 需要补偿的任务ID列表
const FAILED_TASK_IDS = [
  '78160667539488551',
  '78160287552813370',
  '78160745869210122',
  '78160774439558970',
];

async function refundFailedTasks() {
  console.log('🔍 开始查询失败的任务...\n');

  try {
    // 查询这些任务的详细信息
    const tasks = await db()
      .select()
      .from(aiTask)
      .where(
        and(
          inArray(aiTask.taskId, FAILED_TASK_IDS),
          eq(aiTask.scene, 'ai_infographic')
        )
      );

    console.log(`找到 ${tasks.length} 个任务记录\n`);

    if (tasks.length === 0) {
      console.log('❌ 未找到任何匹配的任务记录');
      return;
    }

    // 显示任务详情
    for (const task of tasks) {
      console.log('📋 任务详情:');
      console.log(`  - ID: ${task.id}`);
      console.log(`  - Task ID: ${task.taskId}`);
      console.log(`  - User ID: ${task.userId}`);
      console.log(`  - Provider: ${task.provider}`);
      console.log(`  - Status: ${task.status}`);
      console.log(`  - Cost Credits: ${task.costCredits}`);
      console.log(`  - Created At: ${task.createdAt}`);
      console.log('');
    }

    // 为每个失败的任务补偿积分
    let refundedCount = 0;
    let totalRefunded = 0;

    for (const task of tasks) {
      // 检查任务状态是否为失败
      if (task.status === 'failed' || task.status === 'pending') {
        const creditsToRefund = task.costCredits || 6; // 默认6积分

        try {
          console.log(`💰 为任务 ${task.taskId} 补偿 ${creditsToRefund} 积分...`);

          await refundCredits({
            userId: task.userId,
            credits: creditsToRefund,
            description: `Refund for failed Infographic task ${task.taskId}`,
          });

          // 更新任务状态为 failed（如果还是 pending）
          if (task.status === 'pending') {
            await db()
              .update(aiTask)
              .set({ status: 'failed' })
              .where(eq(aiTask.id, task.id));
          }

          console.log(`✅ 成功补偿 ${creditsToRefund} 积分给用户 ${task.userId}\n`);
          refundedCount++;
          totalRefunded += creditsToRefund;
        } catch (error: any) {
          console.error(`❌ 补偿失败:`, error.message);
          console.log('');
        }
      } else {
        console.log(`⏭️ 跳过任务 ${task.taskId}（状态: ${task.status}）\n`);
      }
    }

    console.log('\n📊 补偿统计:');
    console.log(`  - 成功补偿: ${refundedCount} 个任务`);
    console.log(`  - 总积分: ${totalRefunded} 积分`);
    console.log('\n✅ 补偿完成！');

  } catch (error: any) {
    console.error('❌ 执行失败:', error);
    throw error;
  }
}

// 执行脚本
refundFailedTasks()
  .then(() => {
    console.log('\n🎉 脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 脚本执行出错:', error);
    process.exit(1);
  });
