import { NextResponse } from 'next/server';

import { findAITaskById } from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';

export const dynamic = 'force-dynamic';

type LibraryFlashcard = {
  front: string;
  back: string;
  difficulty?: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserInfo();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Please sign in to view flashcards' },
      { status: 401 }
    );
  }

  const { id } = await params;
  const task = await findAITaskById(id);

  if (!task || task.userId !== user.id || task.scene !== 'ai_flashcards') {
    return NextResponse.json(
      { success: false, error: 'Flashcard deck not found' },
      { status: 404 }
    );
  }

  let flashcards: LibraryFlashcard[] = [];
  let count = 0;
  let metadata: Record<string, unknown> | null = null;

  try {
    const parsed = JSON.parse(task.taskResult || '{}');
    flashcards = Array.isArray(parsed.flashcards) ? parsed.flashcards : [];
    metadata =
      parsed.metadata && typeof parsed.metadata === 'object'
        ? parsed.metadata
        : null;
    count =
      typeof parsed.metadata?.count === 'number'
        ? parsed.metadata.count
        : flashcards.length;
  } catch (error) {
    console.warn('[Flashcards Library] Failed to parse taskResult', error);
  }

  return NextResponse.json({
    success: true,
    record: {
      id: task.id,
      createdAt: task.createdAt?.toISOString() ?? new Date().toISOString(),
      flashcards,
      count,
      metadata,
    },
  });
}


