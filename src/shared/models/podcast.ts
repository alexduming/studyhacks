/**
 * Podcast Model
 * 
 * 非程序员解释：
 * - 这个文件负责管理播客数据的存储和查询
 * - 包括保存播客、获取播客列表、删除播客等功能
 */

import { db } from '@/core/db';
import { podcast } from '@/config/db/schema';
import { eq, desc, and } from 'drizzle-orm';

/**
 * 播客数据接口
 */
export interface PodcastData {
  id: string;
  userId: string;
  episodeId: string;
  title: string;
  description?: string;
  audioUrl: string;
  duration: number;
  mode: 'quick' | 'deep' | 'debate';
  language: string;
  speakerIds?: string[];
  coverUrl?: string;
  outline?: string;
  scripts?: Array<{
    speakerId: string;
    speakerName: string;
    content: string;
  }>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

type DbPodcast = typeof podcast.$inferSelect;

function normalizePodcast(record: DbPodcast): PodcastData {
  return {
    ...record,
    description: record.description || undefined,
    speakerIds: record.speakerIds ? JSON.parse(record.speakerIds) : undefined,
    coverUrl: record.coverUrl || undefined,
    outline: record.outline || undefined,
    scripts: record.scripts
      ? (JSON.parse(record.scripts) as PodcastData['scripts'])
      : undefined,
    mode: record.mode as PodcastData['mode'],
    status: record.status as PodcastData['status'],
  };
}

/**
 * 保存播客到数据库
 */
export async function savePodcast(data: {
  id: string;
  userId: string;
  episodeId: string;
  title: string;
  description?: string;
  audioUrl: string;
  duration: number;
  mode: 'quick' | 'deep' | 'debate';
  language: string;
  speakerIds?: string[];
  coverUrl?: string;
  outline?: string;
  scripts?: any[];
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}): Promise<PodcastData> {
  try {
    const [result] = await db()
      .insert(podcast)
      .values({
        id: data.id,
        userId: data.userId,
        episodeId: data.episodeId,
        title: data.title,
        description: data.description || '',
        audioUrl: data.audioUrl,
        duration: data.duration,
        mode: data.mode,
        language: data.language,
        speakerIds: data.speakerIds ? JSON.stringify(data.speakerIds) : null,
        coverUrl: data.coverUrl || null,
        outline: data.outline || null,
        scripts: data.scripts ? JSON.stringify(data.scripts) : null,
        status: data.status || 'completed',
      })
      .returning();

    return normalizePodcast(result);
  } catch (error) {
    console.error('保存播客失败:', error);
    throw new Error('Failed to save podcast');
  }
}

/**
 * 获取用户的播客列表
 */
export async function getUserPodcasts(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<PodcastData[]> {
  try {
    const results = await db()
      .select()
      .from(podcast)
      .where(eq(podcast.userId, userId))
      .orderBy(desc(podcast.createdAt))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    return results.map((p) => normalizePodcast(p));
  } catch (error) {
    console.error('获取播客列表失败:', error);
    throw new Error('Failed to get user podcasts');
  }
}

/**
 * 根据 ID 获取播客
 */
export async function getPodcastById(
  podcastId: string,
  userId: string
): Promise<PodcastData | null> {
  try {
    const [result] = await db()
      .select()
      .from(podcast)
      .where(and(eq(podcast.id, podcastId), eq(podcast.userId, userId)))
      .limit(1);

    if (!result) {
      return null;
    }

    return normalizePodcast(result);
  } catch (error) {
    console.error('获取播客失败:', error);
    throw new Error('Failed to get podcast');
  }
}

/**
 * 删除播客
 */
export async function deletePodcast(
  podcastId: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await db()
      .delete(podcast)
      .where(and(eq(podcast.id, podcastId), eq(podcast.userId, userId)))
      .returning();

    return result.length > 0;
  } catch (error) {
    console.error('删除播客失败:', error);
    throw new Error('Failed to delete podcast');
  }
}

/**
 * 更新播客状态
 */
export async function updatePodcastStatus(
  podcastId: string,
  userId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed'
): Promise<boolean> {
  try {
    const result = await db()
      .update(podcast)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(podcast.id, podcastId), eq(podcast.userId, userId)))
      .returning();

    return result.length > 0;
  } catch (error) {
    console.error('更新播客状态失败:', error);
    throw new Error('Failed to update podcast status');
  }
}

/**
 * 获取播客总数
 */
export async function getPodcastCount(userId: string): Promise<number> {
  try {
    const results = await db()
      .select()
      .from(podcast)
      .where(eq(podcast.userId, userId));

    return results.length;
  } catch (error) {
    console.error('获取播客总数失败:', error);
    return 0;
  }
}

