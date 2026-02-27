/**
 * Note Document Model
 *
 * 非程序员解释：
 * - 这个文件专门负责“AI 笔记”在数据库里的增删改查
 * - 只要调用这里的函数，就能把 Markdown/预览 HTML 持久化到 `note_document` 表
 */

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { noteDocument } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';

export type NoteDocumentStatus = 'draft' | 'published' | 'archived';

export interface NoteDocument {
  id: string;
  userId: string;
  title: string;
  language: string | null;
  sourceType: string | null;
  sourceName: string | null;
  tags: string[];
  markdown: string;
  html: string | null;
  summary: string | null;
  wordCount: number;
  status: NoteDocumentStatus;
  createdAt: Date;
  updatedAt: Date;
}

type DbNoteDocument = typeof noteDocument.$inferSelect;

function normalizeNote(record: DbNoteDocument): NoteDocument {
  return {
    ...record,
    language: record.language || null,
    sourceType: record.sourceType || null,
    sourceName: record.sourceName || null,
    tags: record.tags ? (JSON.parse(record.tags) as string[]) : [],
    html: record.html || null,
    summary: record.summary || null,
    wordCount: record.wordCount || 0,
    status: (record.status as NoteDocumentStatus) || 'draft',
  };
}

/**
 * 创建笔记（生成完成或手动新增时调用）
 */
export async function createNoteDocument({
  userId,
  title,
  markdown,
  html,
  language,
  sourceType,
  sourceName,
  summary,
  tags,
  wordCount,
  status = 'draft',
}: {
  userId: string;
  title: string;
  markdown: string;
  html?: string | null;
  language?: string | null;
  sourceType?: string | null;
  sourceName?: string | null;
  summary?: string | null;
  tags?: string[];
  wordCount?: number;
  status?: NoteDocumentStatus;
}): Promise<NoteDocument> {
  const [result] = await db()
    .insert(noteDocument)
    .values({
      id: getUuid(),
      userId,
      title,
      markdown,
      html: html || null,
      language: language || null,
      sourceType: sourceType || null,
      sourceName: sourceName || null,
      summary: summary || null,
      tags: tags?.length ? JSON.stringify(tags) : null,
      wordCount: wordCount ?? 0,
      status,
    })
    .returning();

  return normalizeNote(result);
}

/**
 * 更新笔记内容/元信息，附带权限校验（只能改自己的笔记）
 */
export async function updateNoteDocument(
  noteId: string,
  userId: string,
  payload: Partial<{
    title: string;
    markdown: string;
    html: string | null;
    language: string | null;
    sourceType: string | null;
    sourceName: string | null;
    summary: string | null;
    tags: string[];
    wordCount: number;
    status: NoteDocumentStatus;
  }>
): Promise<NoteDocument | null> {
  const { tags, ...rest } = payload;

  const [result] = await db()
    .update(noteDocument)
    .set({
      ...rest,
      tags: tags ? JSON.stringify(tags) : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(noteDocument.id, noteId), eq(noteDocument.userId, userId)))
    .returning();

  if (!result) {
    return null;
  }

  return normalizeNote(result);
}

/**
 * 获取单条笔记，默认附带权限限制
 */
export async function getNoteDocumentById(
  noteId: string,
  userId: string
): Promise<NoteDocument | null> {
  const [result] = await db()
    .select()
    .from(noteDocument)
    .where(and(eq(noteDocument.id, noteId), eq(noteDocument.userId, userId)))
    .limit(1);

  if (!result) {
    return null;
  }

  return normalizeNote(result);
}

/**
 * 获取用户的笔记列表（用于 Library 列表）
 */
export async function listNoteDocuments(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: NoteDocumentStatus;
  }
): Promise<NoteDocument[]> {
  const result = await db()
    .select()
    .from(noteDocument)
    .where(
      and(
        eq(noteDocument.userId, userId),
        options?.status ? eq(noteDocument.status, options.status) : undefined
      )
    )
    .orderBy(desc(noteDocument.updatedAt))
    .limit(options?.limit ?? 20)
    .offset(options?.offset ?? 0);

  return result.map((record) => normalizeNote(record));
}

