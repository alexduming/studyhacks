/**
 * 修复 Presentation 状态不一致问题
 * 
 * 用途：
 * 1. 检查所有 "generating" 状态的 presentations
 * 2. 如果其中的 slides 都已完成，更新数据库状态为 "completed"
 * 3. 自动设置缩略图
 * 
 * 使用方法：
 * pnpm tsx scripts/fix-presentation-status.ts [--dry-run] [presentation_id]
 * 
 * 参数：
 * --dry-run: 只检查不修复（预览模式）
 * presentation_id: 只修复指定的 presentation（可选）
 */

import { db } from '@/core/db';
import { presentation } from '@/config/db/schema';
import { eq } from 'drizzle-orm';

async function fixPresentationStatus(
  targetId?: string,
  dryRun: boolean = false
) {
  console.log('\n🔧 开始修复 Presentation 状态...\n');
  console.log(`模式: ${dryRun ? '🔍 预览模式 (不会修改数据)' : '✏️ 修复模式'}\n`);

  try {
    let records;

    if (targetId) {
      // 修复特定 presentation
      console.log(`🎯 目标: ${targetId}\n`);
      const result = await db()
        .select()
        .from(presentation)
        .where(eq(presentation.id, targetId))
        .limit(1);

      if (!result || result.length === 0) {
        console.error('❌ 未找到该 Presentation 记录');
        return;
      }
      records = result;
    } else {
      // 修复所有 generating 状态的 presentations
      console.log('🎯 目标: 所有 "generating" 状态的记录\n');
      records = await db()
        .select()
        .from(presentation)
        .where(eq(presentation.status, 'generating'));
    }

    if (records.length === 0) {
      console.log('✅ 没有需要修复的记录');
      return;
    }

    console.log(`📋 找到 ${records.length} 条记录需要检查\n`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const record of records) {
      console.log(`\n📄 检查: ${record.id}`);
      console.log(`   标题: ${record.title}`);
      console.log(`   当前状态: ${record.status}`);

      if (!record.content) {
        console.log(`   ⏭️ 跳过: content 为空`);
        skippedCount++;
        continue;
      }

      try {
        const slides = JSON.parse(record.content);
        console.log(`   幻灯片数量: ${slides.length}`);

        // 统计状态
        const statusCount = slides.reduce((acc: any, s: any) => {
          acc[s.status] = (acc[s.status] || 0) + 1;
          return acc;
        }, {});

        console.log(`   状态分布:`, statusCount);

        // 检查是否所有 slides 都已完成
        const allCompleted = slides.every(
          (s: any) => s.status === 'completed' && s.imageUrl
        );
        const anyFailed = slides.some((s: any) => s.status === 'failed');
        const allPending = slides.every((s: any) => s.status === 'pending');

        // ✅ 新增：检测"孤儿记录" - 所有 slides 都是 pending 且记录创建超过 10 分钟
        const createdAt = new Date(record.createdAt);
        const now = new Date();
        const ageMinutes = (now.getTime() - createdAt.getTime()) / 1000 / 60;

        if (allPending && ageMinutes > 10) {
          console.log(
            `   ⚠️ 检测到"孤儿记录" (所有 slides 都是 pending, 已创建 ${Math.floor(ageMinutes)} 分钟)`
          );
          console.log(`   ✅ 需要修复: 标记为 failed`);

          if (!dryRun) {
            await db()
              .update(presentation)
              .set({
                status: 'failed',
                updatedAt: new Date(),
              })
              .where(eq(presentation.id, record.id));

            console.log(`   💾 已更新数据库 (标记为 failed)`);
            fixedCount++;
          } else {
            console.log(`   🔍 [预览模式] 将会更新为: failed`);
            fixedCount++;
          }
          continue;
        }

        if (!allCompleted && !anyFailed) {
          console.log(`   ⏭️ 跳过: 仍在生成中 (创建于 ${Math.floor(ageMinutes)} 分钟前)`);
          skippedCount++;
          continue;
        }

        // 确定最终状态
        const newStatus = anyFailed ? 'failed' : 'completed';

        // 查找缩略图
        const firstSuccessSlide = slides.find(
          (s: any) => s.status === 'completed' && s.imageUrl
        );
        const thumbnail = firstSuccessSlide?.imageUrl || slides[0]?.imageUrl;

        console.log(`   ✅ 需要修复:`);
        console.log(`      新状态: ${newStatus}`);
        console.log(`      缩略图: ${thumbnail ? '有' : '无'}`);

        if (!dryRun) {
          // 执行修复
          await db()
            .update(presentation)
            .set({
              status: newStatus,
              thumbnailUrl: thumbnail,
              updatedAt: new Date(),
            })
            .where(eq(presentation.id, record.id));

          console.log(`   💾 已更新数据库`);
          fixedCount++;
        } else {
          console.log(`   🔍 [预览模式] 将会更新为: ${newStatus}`);
          fixedCount++;
        }
      } catch (e) {
        console.error(`   ❌ 解析 content 失败:`, e);
        skippedCount++;
      }
    }

    console.log(`\n\n📊 修复统计:`);
    console.log(`   ✅ ${dryRun ? '可修复' : '已修复'}: ${fixedCount}`);
    console.log(`   ⏭️ 跳过: ${skippedCount}`);

    if (dryRun && fixedCount > 0) {
      console.log(`\n💡 提示: 移除 --dry-run 参数以执行实际修复`);
    }
  } catch (error) {
    console.error('\n❌ 修复失败:', error);
  }

  console.log('\n✅ 完成\n');
  process.exit(0);
}

// 解析命令行参数
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const presentationId = args.find((arg) => !arg.startsWith('--'));

fixPresentationStatus(presentationId, dryRun);

