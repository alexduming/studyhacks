/**
 * 检查 Infographic 任务的 creditId 情况
 */

import { db } from '@/core/db';
import { aiTask } from '@/config/db/schema';
import { eq } from 'drizzle-orm';

async function checkInfographicCreditIds() {
  console.log('🔍 检查 Infographic 任务的 creditId 情况...\n');

  try {
    // 查询最近的 infographic 任务
    const tasks = await db()
      .select()
      .from(aiTask)
      .where(eq(aiTask.scene, 'ai_infographic'))
      .orderBy(aiTask.createdAt)
      .limit(10);

    console.log(`找到 ${tasks.length} 个 Infographic 任务\n`);

    let withCreditId = 0;
    let withoutCreditId = 0;

    for (const task of tasks) {
      console.log('📋 任务详情:');
      console.log(`  - Task ID: ${task.taskId || 'N/A'}`);
      console.log(`  - User ID: ${task.userId}`);
      console.log(`  - Credit ID: ${task.creditId || '❌ 无'}`);
      console.log(`  - Status: ${task.status}`);
      console.log(`  - Cost Credits: ${task.costCredits}`);
      console.log(`  - Provider: ${task.provider}`);
      console.log(`  - Created At: ${task.createdAt}`);
      console.log('');

      if (task.creditId) {
        withCreditId++;
      } else {
        withoutCreditId++;
      }
    }

    console.log('\n📊 统计:');
    console.log(`  - 有 creditId: ${withCreditId} 个`);
    console.log(`  - 无 creditId: ${withoutCreditId} 个`);

    if (withoutCreditId > 0) {
      console.log('\n⚠️ 发现有任务没有 creditId，这会导致无法显示交易编号');
      console.log('💡 建议：检查 generate-with-fallback 代码中 consumeCredits 的返回值');
    } else {
      console.log('\n✅ 所有任务都有 creditId，问题可能在其他地方');
    }

  } catch (error: any) {
    console.error('❌ 查询失败:', error);
    throw error;
  }
}

checkInfographicCreditIds()
  .then(() => {
    console.log('\n✅ 检查完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 检查出错:', error);
    process.exit(1);
  });
