import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { presentation } from '@/config/db/schema';
import { getStorageServiceWithConfigs } from '@/shared/services/storage';
import { getAllConfigs } from '@/shared/models/config';
import { getUserInfo } from '@/shared/models/user';

export const runtime = 'nodejs';

/**
 * 将 PPT 某一页的临时图片链接替换为 R2 永久链接，并同步更新数据库
 *
 * 非程序员解释：
 * - AI 生成的图片链接通常是临时的（例如 fal.media）
 * - 这个 API 会把临时图片下载下来，上传到我们自己的 R2 存储
 * - 然后把数据库里的图片链接替换为永久链接，保证 Library 永久可见
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { presentationId, slideId, imageUrl } = body || {};

    if (!presentationId || typeof presentationId !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少 presentationId' },
        { status: 400 }
      );
    }

    if (!slideId || typeof slideId !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少 slideId' },
        { status: 400 }
      );
    }

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少 imageUrl' },
        { status: 400 }
      );
    }

    // 读取该演示记录，确保归属正确
    const [record] = await db()
      .select()
      .from(presentation)
      .where(
        and(
          eq(presentation.id, presentationId),
          eq(presentation.userId, user.id)
        )
      )
      .limit(1);

    if (!record) {
      return NextResponse.json(
        { success: false, error: 'Presentation not found' },
        { status: 404 }
      );
    }

    // 如果已经是我们的永久链接，就不重复上传
    const configs = await getAllConfigs();
    const r2Domain = configs.r2_domain || '';
    const assetsBaseUrl = process.env.NEXT_PUBLIC_ASSETS_URL || '';
    const isPermanent =
      (r2Domain && imageUrl.includes(r2Domain)) ||
      (assetsBaseUrl && imageUrl.includes(assetsBaseUrl));

    let finalUrl = imageUrl;

    if (!isPermanent) {
      // 上传到 R2
      if (!configs.r2_bucket_name || !configs.r2_access_key) {
        return NextResponse.json(
          {
            success: false,
            error: 'R2 存储未配置，请在后台设置中配置 R2',
          },
          { status: 500 }
        );
      }

      const storageService = getStorageServiceWithConfigs(configs);
      const timestamp = Date.now();
      const randomId = nanoid(8);
      const fileExtension =
        imageUrl.includes('.jpg') || imageUrl.includes('.jpeg') ? 'jpg' : 'png';
      const fileName = `${timestamp}_${randomId}.${fileExtension}`;
      const storageKey = `slides/${user.id}/${fileName}`;

      const uploadResult = await storageService.downloadAndUpload({
        url: imageUrl,
        key: storageKey,
        contentType: `image/${fileExtension}`,
        disposition: 'inline',
      });

      if (!uploadResult.success || !uploadResult.url) {
        return NextResponse.json(
          {
            success: false,
            error: `图片保存失败: ${uploadResult.error || '未知错误'}`,
          },
          { status: 500 }
        );
      }

      finalUrl = uploadResult.url;
    }

    // 更新 presentation.content 内该页的 imageUrl
    let nextContent = record.content;
    let nextThumbnail = record.thumbnailUrl;
    let updated = false;

    if (record.content) {
      try {
        const parsed = JSON.parse(record.content);

        // 🎯 支持新格式（包含 _meta）和旧格式（直接是数组）
        // 非程序员解释：
        // - 旧格式：content 直接是 slides 数组
        // - 新格式：content 是 { slides: [...], _meta: {...} }
        let slides: any[];
        let hasMeta = false;
        let metaData: any = null;

        if (Array.isArray(parsed)) {
          slides = parsed;
        } else if (parsed?.slides && Array.isArray(parsed.slides)) {
          slides = parsed.slides;
          hasMeta = true;
          metaData = parsed._meta || {};
        } else {
          slides = [];
        }

        if (slides.length > 0) {
          const nextSlides = slides.map((slide: any) => {
            if (slide?.id === slideId) {
              updated = true;
              return {
                ...slide,
                imageUrl: finalUrl,
                status: 'completed',
              };
            }
            return slide;
          });

          // 更新封面（优先第一张有图的）
          const firstImage = nextSlides.find(
            (slide: any) => slide?.imageUrl
          )?.imageUrl;
          if (firstImage) {
            nextThumbnail = firstImage;
          }

          // 🎯 保持原有格式输出
          if (hasMeta) {
            nextContent = JSON.stringify({ slides: nextSlides, _meta: metaData });
          } else {
            nextContent = JSON.stringify(nextSlides);
          }
        }
      } catch {
        // JSON 解析失败时忽略，避免影响主流程
      }
    }

    if (updated) {
      await db()
        .update(presentation)
        .set({
          content: nextContent,
          thumbnailUrl: nextThumbnail,
          updatedAt: new Date(),
        })
        .where(eq(presentation.id, record.id));
    }

    return NextResponse.json({
      success: true,
      data: {
        url: finalUrl,
        updated,
      },
    });
  } catch (error: any) {
    console.error('[replace-slide-image] error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '未知错误' },
      { status: 500 }
    );
  }
}






