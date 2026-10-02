import 'dotenv/config';
import { db } from '../src/core/db';
import { presentation, systemConfig } from '../src/config/db/schema';
import { eq, or, like } from 'drizzle-orm';
import { getAllConfigs } from '../src/shared/models/config';
import { getStorageServiceWithConfigs } from '../src/shared/services/storage';
import { nanoid } from 'nanoid';

/**
 * 历史文稿图片迁移脚本 (FAL/KIE/临时链接 -> R2)
 *
 * 非程序员解释：
 * 这个脚本会自动找出所有还在使用临时链接的历史幻灯片，
 * 把图片下载并上传到我们的持久化存储 R2 中，然后更新数据库。
 *
 * 支持的临时域名：
 * - fal.media (包括 v3b.fal.media 等子域名)
 * - kie.ai
 * - tempfile.aiquickdraw.com
 */

// 🎯 临时域名列表 - 这些域名的图片需要迁移到 R2
const TEMP_DOMAINS = [
  'fal.media',
  'kie.ai',
  'tempfile.aiquickdraw.com',
];

// 检查 URL 是否为临时链接
function isTempUrl(url: string): boolean {
  if (!url) return false;
  return TEMP_DOMAINS.some(domain => url.includes(domain));
}

async function migratePresentations() {
  console.log('🚀 开始扫描需要迁移的历史文稿...');
  console.log(`   临时域名列表: ${TEMP_DOMAINS.join(', ')}`);

  // 1. 获取系统配置（R2 密钥等）
  console.log('  -> 正在获取底层配置...');
  let configs: Record<string, string> = {};
  try {
    const rawConfigs = await db().select().from(systemConfig);
    console.log(`  -> 数据库 config 表共有 ${rawConfigs.length} 条记录`);

    for (const item of rawConfigs) {
      if (item.name.startsWith('r2_')) {
        console.log(`     [R2] ${item.name}: ${item.value ? '已设置(长度:' + item.value.length + ')' : '空'}`);
      }
      configs[item.name] = item.value || '';
    }
  } catch (e) {
    console.error('❌ 获取配置失败:', e);
    return;
  }

  const r2Bucket = configs.r2_bucket_name || process.env.R2_BUCKET_NAME || '';
  const r2Key = configs.r2_access_key || process.env.R2_ACCESS_KEY || '';
  const r2Secret = configs.r2_secret_key || process.env.R2_SECRET_KEY || '';
  const r2Endpoint = configs.r2_endpoint || process.env.R2_ENDPOINT || '';

  console.log('  -> 检查 R2 参数值长度:', {
    bucket: r2Bucket.length,
    key: r2Key.length,
    secret: r2Secret.length,
    endpoint: r2Endpoint.length
  });

  if (!r2Bucket || r2Bucket.trim() === '' || !r2Key || r2Key.trim() === '') {
    console.error('❌ R2 配置项值为空，请检查数据库 config 表中的内容。');
    return;
  }

  // 补全配置对象以备 storageService 使用
  const finalConfigs = {
    ...configs,
    r2_bucket_name: r2Bucket,
    r2_access_key: r2Key,
    r2_secret_key: r2Secret,
    r2_endpoint: r2Endpoint
  };

  const storageService = getStorageServiceWithConfigs(finalConfigs);

  // 2. 找出包含临时链接的记录
  // 🎯 扩展查询条件，支持更多临时域名
  const records = await db()
    .select()
    .from(presentation)
    .where(
      or(
        like(presentation.content, '%fal.media%'),
        like(presentation.content, '%kie.ai%'),
        like(presentation.content, '%tempfile.aiquickdraw.com%'),
        like(presentation.thumbnailUrl, '%fal.media%'),
        like(presentation.thumbnailUrl, '%kie.ai%'),
        like(presentation.thumbnailUrl, '%tempfile.aiquickdraw.com%')
      )
    );

  console.log(`[SCAN] 发现 ${records.length} 个文稿需要处理`);

  let successCount = 0;
  let failCount = 0;
  let imagesMigrated = 0;

  for (const record of records) {
    console.log(`\n-----------------------------------------`);
    console.log(`[PROCESS] 正在处理文稿: ${record.title} (ID: ${record.id})`);

    try {
      let contentChanged = false;
      let nextContent = record.content;
      let nextThumbnail = record.thumbnailUrl;

      // 处理内容中的图片
      if (record.content) {
        // 🎯 支持新格式（包含 _meta）和旧格式（直接是数组）
        let parsed: any;
        try {
          parsed = JSON.parse(record.content);
        } catch {
          console.log(`  ⚠️ 无法解析 content JSON，跳过`);
          continue;
        }

        // 提取 slides 数组
        let slides: any[];
        let hasMeta = false;
        if (Array.isArray(parsed)) {
          slides = parsed;
        } else if (parsed?.slides && Array.isArray(parsed.slides)) {
          slides = parsed.slides;
          hasMeta = true;
        } else {
          console.log(`  ⚠️ content 格式不正确，跳过`);
          continue;
        }

        for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];
          const originalUrl = slide.imageUrl;

          if (originalUrl && isTempUrl(originalUrl)) {
            console.log(`  -> 正在迁移第 ${i + 1} 页图片: ${originalUrl.substring(0, 60)}...`);

            const storageKey = `presentations/${record.userId}/${record.id}/${Date.now()}_${nanoid(6)}.png`;
            const uploadResult = await storageService.downloadAndUpload({
              url: originalUrl,
              key: storageKey,
              contentType: 'image/png',
            });

            if (uploadResult.success && uploadResult.url) {
              slides[i].imageUrl = uploadResult.url;
              contentChanged = true;
              imagesMigrated++;
              console.log(`  ✅ 迁移成功: ${uploadResult.url}`);

              // 如果是第一页，同步更新封面变量
              if (i === 0) {
                nextThumbnail = uploadResult.url;
              }
            } else {
              console.error(`  ❌ 迁移失败: ${uploadResult.error}`);
            }
          }

          // 🎯 同时处理 history 中的图片
          if (slide.history && Array.isArray(slide.history)) {
            for (let j = 0; j < slide.history.length; j++) {
              const historyEntry = slide.history[j];
              if (historyEntry.imageUrl && isTempUrl(historyEntry.imageUrl)) {
                console.log(`  -> 正在迁移第 ${i + 1} 页历史版本 ${j + 1}...`);

                const storageKey = `presentations/${record.userId}/${record.id}/history_${Date.now()}_${nanoid(6)}.png`;
                const uploadResult = await storageService.downloadAndUpload({
                  url: historyEntry.imageUrl,
                  key: storageKey,
                  contentType: 'image/png',
                });

                if (uploadResult.success && uploadResult.url) {
                  slides[i].history[j].imageUrl = uploadResult.url;
                  contentChanged = true;
                  imagesMigrated++;
                  console.log(`  ✅ 历史版本迁移成功`);
                }
              }
            }
          }
        }

        // 重新构建 content
        if (hasMeta) {
          nextContent = JSON.stringify({ ...parsed, slides });
        } else {
          nextContent = JSON.stringify(slides);
        }
      }

      // 处理封面图（如果封面图独立且未在内容循环中更新）
      if (nextThumbnail && isTempUrl(nextThumbnail)) {
        console.log(`  -> 正在迁移独立封面图...`);
        const storageKey = `presentations/${record.userId}/${record.id}/cover_${Date.now()}.png`;
        const uploadResult = await storageService.downloadAndUpload({
          url: nextThumbnail,
          key: storageKey,
          contentType: 'image/png',
        });
        if (uploadResult.success && uploadResult.url) {
          nextThumbnail = uploadResult.url;
          contentChanged = true;
          imagesMigrated++;
        }
      }

      // 3. 回写数据库
      if (contentChanged) {
        await db()
          .update(presentation)
          .set({
            content: nextContent,
            thumbnailUrl: nextThumbnail,
            updatedAt: new Date(),
          })
          .where(eq(presentation.id, record.id));

        console.log(`✨ 文稿 "${record.title}" 已完成持久化更新`);
        successCount++;
      } else {
        console.log(`ℹ️ 文稿 "${record.title}" 无需实际更改`);
      }

    } catch (err) {
      console.error(`❌ 处理文稿 ${record.id} 时出错:`, err);
      failCount++;
    }
  }

  console.log(`\n=========================================`);
  console.log(`🏁 迁移完成！`);
  console.log(`✅ 成功更新文稿: ${successCount} 个`);
  console.log(`📷 迁移图片总数: ${imagesMigrated} 张`);
  console.log(`❌ 失败: ${failCount} 个`);
  console.log(`=========================================`);
}

migratePresentations().catch(console.error);

