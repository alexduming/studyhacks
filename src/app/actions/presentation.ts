'use server';

import { eq, desc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { db } from '@/core/db';
import { presentation } from '@/config/db/schema';
import { getSignUser as getCurrentUser } from '@/shared/models/user';

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
 * Get user's presentations list
 */
export async function getUserPresentationsAction() {
  const user = await getCurrentUser();
  if (!user) {
    return [];
  }

  const results = await db()
    .select()
    .from(presentation)
    .where(eq(presentation.userId, user.id))
    .orderBy(desc(presentation.createdAt));

  return results;
}

/**
 * Get single presentation details
 */
export async function getPresentationAction(id: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const result = await db()
    .select()
    .from(presentation)
    .where(and(eq(presentation.id, id), eq(presentation.userId, user.id)))
    .limit(1);

  return result[0];
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

