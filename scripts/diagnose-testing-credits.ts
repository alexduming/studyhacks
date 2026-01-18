/**
 * 诊断脚本：查找"System Gift for Testing"积分记录的来源
 * 
 * 非程序员解释：
 * - 这个脚本会查询数据库中所有description包含"System Gift for Testing"的积分记录
 * - 显示这些记录的详细信息：创建时间、用户、积分数量、交易场景等
 * - 帮助找出这些记录是如何产生的（可能是管理员手动添加、API调用、或测试脚本）
 * 
 * 使用方法：
 * 1. 在项目根目录运行：npx tsx scripts/diagnose-testing-credits.ts
 * 2. 查看输出结果，了解这些记录的来源
 */

import { db } from '../src/core/db';
import { credit, user } from '../src/config/db/schema';
import { eq, like, or, ilike } from 'drizzle-orm';

async function diagnoseTestingCredits() {
  console.log('🔍 开始诊断"System Gift for Testing"积分记录...\n');

  const database = db();

  try {
    // 查询所有description包含"System Gift for Testing"的积分记录
    // 使用ilike查询，支持大小写不敏感匹配
    const testingCredits = await database
      .select()
      .from(credit)
      .where(
        ilike(credit.description, '%System Gift for Testing%')
      )
      .orderBy(credit.createdAt);

    console.log(`📊 找到 ${testingCredits.length} 条相关积分记录\n`);

    if (testingCredits.length === 0) {
      console.log('✅ 没有找到"System Gift for Testing"相关的积分记录');
      return;
    }

    // 统计信息
    const totalCredits = testingCredits.reduce((sum, c) => sum + c.credits, 0);
    const uniqueUsers = new Set(testingCredits.map(c => c.userId));
    const userCount = uniqueUsers.size;

    console.log('📈 统计信息：');
    console.log(`   - 总记录数: ${testingCredits.length}`);
    console.log(`   - 总积分: ${totalCredits}`);
    console.log(`   - 涉及用户数: ${userCount}`);
    console.log(`   - 平均每用户: ${userCount > 0 ? Math.round(totalCredits / userCount) : 0} 积分\n`);

    // 按创建时间分组统计
    const byDate = new Map<string, number>();
    testingCredits.forEach(c => {
      const date = c.createdAt.toISOString().split('T')[0];
      byDate.set(date, (byDate.get(date) || 0) + 1);
    });

    console.log('📅 按日期分布：');
    Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([date, count]) => {
        console.log(`   - ${date}: ${count} 条记录`);
      });
    console.log('');

    // 按交易场景分组
    const byScene = new Map<string, number>();
    testingCredits.forEach(c => {
      const scene = c.transactionScene || 'unknown';
      byScene.set(scene, (byScene.get(scene) || 0) + 1);
    });

    console.log('🎯 按交易场景分布：');
    Array.from(byScene.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([scene, count]) => {
        console.log(`   - ${scene}: ${count} 条记录`);
      });
    console.log('');

    // 详细记录（显示前20条）
    console.log('📋 详细记录（前20条）：\n');
    const displayCount = Math.min(20, testingCredits.length);
    
    for (let i = 0; i < displayCount; i++) {
      const c = testingCredits[i];
      
      // 获取用户信息
      const [userInfo] = await database
        .select()
        .from(user)
        .where(eq(user.id, c.userId))
        .limit(1);

      console.log(`记录 #${i + 1}:`);
      console.log(`  ID: ${c.id}`);
      console.log(`  用户: ${userInfo?.email || c.userEmail || '未知'} (${c.userId})`);
      console.log(`  积分: ${c.credits}`);
      console.log(`  剩余积分: ${c.remainingCredits}`);
      console.log(`  交易类型: ${c.transactionType}`);
      console.log(`  交易场景: ${c.transactionScene || '未设置'}`);
      console.log(`  状态: ${c.status}`);
      console.log(`  描述: ${c.description}`);
      console.log(`  创建时间: ${c.createdAt.toISOString()}`);
      console.log(`  过期时间: ${c.expiresAt ? c.expiresAt.toISOString() : '无'}`);
      if (c.metadata) {
        console.log(`  元数据: ${c.metadata}`);
      }
      if (c.transactionNo) {
        console.log(`  交易号: ${c.transactionNo}`);
      }
      console.log('');
    }

    if (testingCredits.length > displayCount) {
      console.log(`... 还有 ${testingCredits.length - displayCount} 条记录未显示\n`);
    }

    // 分析可能的来源
    console.log('🔎 可能来源分析：\n');
    
    const giftSceneCount = testingCredits.filter(c => c.transactionScene === 'gift').length;
    const awardSceneCount = testingCredits.filter(c => c.transactionScene === 'award').length;
    
    if (giftSceneCount > 0) {
      console.log(`⚠️  发现 ${giftSceneCount} 条记录的交易场景为 'gift'`);
      console.log('   可能来源：');
      console.log('   1. 管理员通过 /admin/credits/create 页面手动添加');
      console.log('   2. 管理员通过 /admin/users 页面的"管理积分"功能添加');
      console.log('   3. 某个自动化脚本或API被误调用\n');
    }
    
    if (awardSceneCount > 0) {
      console.log(`⚠️  发现 ${awardSceneCount} 条记录的交易场景为 'award'`);
      console.log('   可能来源：');
      console.log('   1. 管理员通过 /admin/credits/create 页面手动添加（grant类型）');
      console.log('   2. 某个测试脚本在生产环境运行\n');
    }

    // 检查是否有批量创建的模式
    const timeGroups = new Map<string, number[]>();
    testingCredits.forEach(c => {
      const timeKey = c.createdAt.toISOString().substring(0, 16); // 精确到分钟
      if (!timeGroups.has(timeKey)) {
        timeGroups.set(timeKey, []);
      }
      timeGroups.get(timeKey)!.push(c.credits);
    });

    const batchOperations = Array.from(timeGroups.entries())
      .filter(([_, credits]) => credits.length >= 5)
      .sort((a, b) => b[1].length - a[1].length);

    if (batchOperations.length > 0) {
      console.log('⚠️  发现批量操作模式（同一分钟内创建5条以上记录）：');
      batchOperations.slice(0, 5).forEach(([time, credits]) => {
        console.log(`   - ${time}: ${credits.length} 条记录，总积分 ${credits.reduce((a, b) => a + b, 0)}`);
      });
      console.log('   这可能是某个脚本或API被批量调用\n');
    }

    // 建议
    console.log('💡 建议：\n');
    console.log('1. 检查管理员操作日志（如果有的话）');
    console.log('2. 检查是否有测试脚本在生产环境运行');
    console.log('3. 检查API调用日志，查找是否有异常的POST请求到积分相关接口');
    console.log('4. 如果确认是误操作，可以考虑：');
    console.log('   - 删除这些测试记录（如果用户还没有使用这些积分）');
    console.log('   - 或者保留记录但添加注释说明这是测试数据');
    console.log('5. 加强权限控制，确保只有授权人员可以添加积分');
    console.log('6. 添加操作审计日志，记录所有积分操作的来源\n');

  } catch (error) {
    console.error('❌ 诊断过程中出错:', error);
    throw error;
  }
}

// 运行诊断
diagnoseTestingCredits()
  .then(() => {
    console.log('✅ 诊断完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 诊断失败:', error);
    process.exit(1);
  });


