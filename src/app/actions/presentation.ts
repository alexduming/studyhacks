'use server';

import { eq, desc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { db } from '@/core/db';
import { presentation } from '@/config/db/schema';
import { getSignUser as getCurrentUser } from '@/shared/models/user';

/**
 * 🔧 Presentation 数据类型（序列化后，用于 Server -> Client 传输）
 * Date 对象已转换为 ISO 字符串，避免 React Server Components 序列化错误
 */
export type SerializedPresentation = {
  id: string;
  userId: string;
  title: string;
  content: string | null;
  status: string;
  kieTaskId: string | null;
  styleId: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * Create a new presentation record
 */
export async function createPresentationAction(params: {
  title: string;
  content: string; // JSON string
  status: 'generating' | 'completed' | 'failed';
  kieTaskId?: string;
  styleId?: string;
}) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const id = nanoid();

  await db().insert(presentation).values({
    id,
    userId: user.id,
    title: params.title,
    content: params.content,
    status: params.status,
    kieTaskId: params.kieTaskId,
    styleId: params.styleId,
  });

  return { id };
}

/**
 * Update a presentation record
 */
export async function updatePresentationAction(
  id: string,
  data: {
    status?: 'generating' | 'completed' | 'failed';
    content?: string;
    kieTaskId?: string;
    thumbnailUrl?: string;
  }
) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Ensure user owns the presentation
  const existing = await db()
    .select()
    .from(presentation)
    .where(and(eq(presentation.id, id), eq(presentation.userId, user.id)))
    .limit(1);

  if (!existing || existing.length === 0) {
    throw new Error('Presentation not found or unauthorized');
  }

  await db()
    .update(presentation)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(presentation.id, id));

  return { success: true };
}

/**
 * 🎯 原子化更新单张幻灯片的图片 URL
 * 解决后台上传 R2 后无法回写数据库的问题
 */
export async function updateSlideImageAction(
  presentationId: string,
  slideId: string,
  newImageUrl: string
) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  try {
    return await db().transaction(async (tx) => {
      // 1. 获取当前记录
      const [record] = await tx
        .select()
        .from(presentation)
        .where(
          and(eq(presentation.id, presentationId), eq(presentation.userId, user.id))
        )
        .limit(1);

      if (!record || !record.content) return { success: false, error: 'Not found' };

      // 2. 解析并更新内容
      // 🎯 支持新格式（包含 _meta）和旧格式（直接是数组）
      const parsed = JSON.parse(record.content);
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
        return { success: false, error: 'Invalid content' };
      }

      let changed = false;
      const nextSlides = slides.map((s: any) => {
        if (s.id === slideId) {
          changed = true;
          return { ...s, imageUrl: newImageUrl, status: 'completed' };
        }
        return s;
      });

      if (!changed) return { success: false, error: 'Slide not found' };

      // 3. 更新数据库
      // 🎯 保持原有格式输出
      const nextContent = hasMeta
        ? JSON.stringify({ slides: nextSlides, _meta: metaData })
        : JSON.stringify(nextSlides);

      const updateData: any = {
        content: nextContent,
        updatedAt: new Date(),
      };

      // 如果是第一张图，同步更新封面
      if (nextSlides[0]?.id === slideId) {
        updateData.thumbnailUrl = newImageUrl;
      }

      await tx
        .update(presentation)
        .set(updateData)
        .where(eq(presentation.id, presentationId));

      return { success: true };
    });
  } catch (error) {
    console.error('[DB] 原子化更新 Slide 失败:', error);
    return { success: false };
  }
}

/**
 * Get user's presentations list
 */
export async function getUserPresentationsAction(): Promise<SerializedPresentation[]> {
  const user = await getCurrentUser();
  if (!user) {
    return [];
  }

  const results = await db()
    .select()
    .from(presentation)
    .where(eq(presentation.userId, user.id))
    .orderBy(desc(presentation.createdAt));

  // 🎯 修复历史记录显示问题：
  // - 如果 content 里已经有图片链接，但状态仍是 generating/pending，就自动修正为 completed
  // - 如果 thumbnailUrl 为空，就尝试从 content 里找第一张图作为封面
  // 这样用户在 /library/presentations 里就能看到真实封面和完成状态
  const patchedResults: SerializedPresentation[] = [];

  for (const item of results) {
    let nextContent = item.content;
    let nextThumbnail = item.thumbnailUrl;
    let shouldUpdate = false;

    if (item.content) {
      try {
        const parsed = JSON.parse(item.content);
        // 支持新旧两种格式
        let slides: any[];
        let meta: any = {};
        let isNewFormat = false;

        if (Array.isArray(parsed)) {
          slides = parsed;
        } else if (parsed?.slides && Array.isArray(parsed.slides)) {
          slides = parsed.slides;
          meta = parsed._meta || {};
          isNewFormat = true;
        } else {
          slides = [];
        }

        if (slides.length > 0) {
          let hasChange = false;

          const normalizedSlides = slides.map((slide: any) => {
            // 如果已经有图片，就强制标记为 completed（避免历史记录一直显示“生成中”）
            if (
              slide?.imageUrl &&
              (slide.status === 'pending' || slide.status === 'generating')
            ) {
              hasChange = true;
              return { ...slide, status: 'completed' };
            }
            return slide;
          });

          // 如果封面为空，尝试从内容中取第一张有图的页面
          if (!nextThumbnail) {
            const firstImage = normalizedSlides.find(
              (slide: any) => slide?.imageUrl
            )?.imageUrl;
            if (firstImage) {
              nextThumbnail = firstImage;
              shouldUpdate = true;
            }
          }

          if (hasChange) {
            // 保持原有格式
            if (isNewFormat) {
              nextContent = JSON.stringify({
                slides: normalizedSlides,
                _meta: meta,
              });
            } else {
              nextContent = JSON.stringify(normalizedSlides);
            }
            shouldUpdate = true;
          }
        }
      } catch {
        // content 不是合法 JSON，忽略，避免影响其他记录
      }
    }

    if (shouldUpdate) {
      await db()
        .update(presentation)
        .set({
          content: nextContent,
          thumbnailUrl: nextThumbnail,
          updatedAt: new Date(),
        })
        .where(eq(presentation.id, item.id));
    }

    // 🔧 将 Date 对象转换为 ISO 字符串，避免 Server Components 序列化错误
    patchedResults.push({
      id: item.id,
      userId: item.userId,
      title: item.title,
      content: nextContent,
      status: item.status,
      kieTaskId: item.kieTaskId,
      styleId: item.styleId,
      thumbnailUrl: nextThumbnail,
      createdAt: item.createdAt ? item.createdAt.toISOString() : null,
      updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
    });
  }

  return patchedResults;
}

/**
 * Get single presentation details
 */
export async function getPresentationAction(id: string): Promise<SerializedPresentation | undefined> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const result = await db()
    .select()
    .from(presentation)
    .where(and(eq(presentation.id, id), eq(presentation.userId, user.id)))
    .limit(1);

  const record = result[0];
  if (!record) return record;

  let nextContent = record.content;
  let nextThumbnail = record.thumbnailUrl;
  let shouldUpdate = false;

  if (record.content) {
    try {
      const parsed = JSON.parse(record.content);
      // 支持新旧两种格式
      let slides: any[];
      let meta: any = {};
      let isNewFormat = false;

      if (Array.isArray(parsed)) {
        slides = parsed;
      } else if (parsed?.slides && Array.isArray(parsed.slides)) {
        slides = parsed.slides;
        meta = parsed._meta || {};
        isNewFormat = true;
      } else {
        slides = [];
      }

      if (slides.length > 0) {
        let hasChange = false;

        const normalizedSlides = slides.map((slide: any) => {
          // 如果已经有图片，就强制标记为 completed（避免详情页一直显示“生成中”）
          if (
            slide?.imageUrl &&
            (slide.status === 'pending' || slide.status === 'generating')
          ) {
            hasChange = true;
            return { ...slide, status: 'completed' };
          }
          return slide;
        });

        if (!nextThumbnail) {
          const firstImage = normalizedSlides.find(
            (slide: any) => slide?.imageUrl
          )?.imageUrl;
          if (firstImage) {
            nextThumbnail = firstImage;
            shouldUpdate = true;
          }
        }

        if (hasChange) {
          // 保持原有格式
          if (isNewFormat) {
            nextContent = JSON.stringify({
              slides: normalizedSlides,
              _meta: meta,
            });
          } else {
            nextContent = JSON.stringify(normalizedSlides);
          }
          shouldUpdate = true;
        }
      }
    } catch {
      // content 不是合法 JSON，忽略，避免影响读取
    }
  }

  if (shouldUpdate) {
    await db()
      .update(presentation)
      .set({
        content: nextContent,
        thumbnailUrl: nextThumbnail,
        updatedAt: new Date(),
      })
      .where(eq(presentation.id, record.id));
  }

  // 🔧 将 Date 对象转换为 ISO 字符串，避免 Server Components 序列化错误
  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    content: nextContent,
    status: record.status,
    kieTaskId: record.kieTaskId,
    styleId: record.styleId,
    thumbnailUrl: nextThumbnail,
    createdAt: record.createdAt ? record.createdAt.toISOString() : null,
    updatedAt: record.updatedAt ? record.updatedAt.toISOString() : null,
  };
}

/**
 * Delete a presentation
 */
export async function deletePresentationAction(id: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  await db()
    .delete(presentation)
    .where(and(eq(presentation.id, id), eq(presentation.userId, user.id)));

  return { success: true };
}

