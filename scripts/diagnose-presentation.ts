/**
 * 诊断 Presentation 数据库记录
 * 
 * 用途：检查为什么某些 presentation 一直显示 "generating" 状态
 * 
 * 使用方法：
 * pnpm tsx scripts/diagnose-presentation.ts <presentation_id>
 */

import { db } from '@/core/db';
import { presentation } from '@/config/db/schema';
import { eq } from 'drizzle-orm';

async function diagnosePresentationIssue(presentationId?: string) {
  console.log('\n🔍 开始诊断 Presentation 数据...\n');

  try {
    if (presentationId) {
      // 诊断特定 presentation
      console.log(`📋 查询 Presentation ID: ${presentationId}\n`);

      const result = await db()
        .select()
        .from(presentation)
        .where(eq(presentation.id, presentationId))
        .limit(1);

      if (!result || result.length === 0) {
        console.error('❌ 未找到该 Presentation 记录');
        return;
      }

      const record = result[0];
      console.log('📊 基本信息:');
      console.log(`  ID: ${record.id}`);
      console.log(`  标题: ${record.title}`);
      console.log(`  状态: ${record.status}`);
      console.log(`  样式ID: ${record.styleId || '无'}`);
      console.log(`  KIE任务ID: ${record.kieTaskId || '无'}`);
      console.log(`  缩略图: ${record.thumbnailUrl ? '有' : '无'}`);
      console.log(`  创建时间: ${record.createdAt}`);
      console.log(`  更新时间: ${record.updatedAt}`);

      // 解析 content JSON
      if (record.content) {
        try {
          const slides = JSON.parse(record.content);
          console.log(`\n📑 幻灯片详情 (共 ${slides.length} 张):`);

          slides.forEach((slide: any, index: number) => {
            console.log(`\n  幻灯片 ${index + 1}:`);
            console.log(`    ID: ${slide.id}`);
            console.log(`    标题: ${slide.title}`);
            console.log(`    状态: ${slide.status}`);
            console.log(`    图片URL: ${slide.imageUrl ? '✅ 有' : '❌ 无'}`);
            if (slide.imageUrl) {
              console.log(`      ${slide.imageUrl.substring(0, 80)}...`);
            }
            console.log(`    提供商: ${slide.provider || '未记录'}`);
            console.log(`    是否托底: ${slide.fallbackUsed !== undefined ? slide.fallbackUsed : '未记录'}`);
            console.log(`    任务ID: ${slide.taskId || '未记录'}`);
          });

          // 统计状态
          const statusCount = slides.reduce((acc: any, s: any) => {
            acc[s.status] = (acc[s.status] || 0) + 1;
            return acc;
          }, {});

          console.log(`\n📈 状态统计:`);
          Object.entries(statusCount).forEach(([status, count]) => {
            console.log(`  ${status}: ${count}`);
          });

          // 检查问题
          console.log(`\n🔎 问题检查:`);
          const allCompleted = slides.every((s: any) => s.status === 'completed');
          const allHaveImages = slides.every((s: any) => s.imageUrl);
          const dbStatusCorrect = record.status === 'completed';

          if (allCompleted && allHaveImages && !dbStatusCorrect) {
            console.log(`  ⚠️ 所有幻灯片都已完成，但数据库状态是: ${record.status}`);
            console.log(`  💡 建议：运行修复脚本更新数据库状态`);
          } else if (allCompleted && allHaveImages && dbStatusCorrect) {
            console.log(`  ✅ 数据完整，状态正确`);
          } else if (!allCompleted) {
            console.log(`  ⚠️ 有 ${slides.filter((s: any) => s.status !== 'completed').length} 张幻灯片未完成`);
          } else if (!allHaveImages) {
            console.log(`  ⚠️ 有 ${slides.filter((s: any) => !s.imageUrl).length} 张幻灯片缺少图片URL`);
          }

          // 检查 R2 URL
          const r2Images = slides.filter((s: any) => 
            s.imageUrl && s.imageUrl.includes('cdn.studyhacks.ai')
          );
          const otherImages = slides.filter((s: any) => 
            s.imageUrl && !s.imageUrl.includes('cdn.studyhacks.ai')
          );

          if (r2Images.length > 0) {
            console.log(`  ✅ ${r2Images.length} 张图片已保存到 R2`);
          }
          if (otherImages.length > 0) {
            console.log(`  ⚠️ ${otherImages.length} 张图片仍在外部服务器 (未保存到R2)`);
          }
        } catch (e) {
          console.error('❌ 解析 content JSON 失败:', e);
          console.log('原始 content:', record.content.substring(0, 200));
        }
      } else {
        console.log('\n⚠️ content 字段为空');
      }
    } else {
      // 列出所有 generating 状态的 presentations
      console.log('📋 查询所有 "generating" 状态的 Presentations\n');

      const results = await db()
        .select()
        .from(presentation)
        .where(eq(presentation.status, 'generating'))
        .orderBy(presentation.createdAt);

      if (results.length === 0) {
        console.log('✅ 没有卡在 "generating" 状态的记录');
        return;
      }

      console.log(`⚠️ 找到 ${results.length} 条 "generating" 状态的记录:\n`);

      results.forEach((record, index) => {
        console.log(`${index + 1}. ${record.id}`);
        console.log(`   标题: ${record.title}`);
        console.log(`   创建时间: ${record.createdAt}`);
        console.log(`   更新时间: ${record.updatedAt}`);

        // 快速检查 content
        if (record.content) {
          try {
            const slides = JSON.parse(record.content);
            const completed = slides.filter((s: any) => s.status === 'completed').length;
            console.log(`   幻灯片: ${completed}/${slides.length} 已完成`);
          } catch (e) {
            console.log(`   幻灯片: 解析失败`);
          }
        }
        console.log('');
      });

      console.log(`\n💡 提示：使用以下命令诊断具体记录:`);
      console.log(`pnpm tsx scripts/diagnose-presentation.ts <presentation_id>`);
    }
  } catch (error) {
    console.error('❌ 诊断失败:', error);
  }

  console.log('\n✅ 诊断完成\n');
  process.exit(0);
}

// 从命令行参数获取 presentation ID
const presentationId = process.argv[2];

diagnosePresentationIssue(presentationId);

