import { notFound } from 'next/navigation';

import { findAITaskById } from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';

import FlashcardsClient from './flashcards-client';

export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<{ historyId?: string }>;
}) {
  const { historyId } = await searchParams;
  let initialHistoryData = null;

  if (historyId) {
    const user = await getUserInfo();
    if (user) {
      const task = await findAITaskById(historyId);
      // Ensure the task belongs to the user and is a flashcard task
      if (
        task &&
        task.userId === user.id &&
        task.scene === 'ai_flashcards' &&
        task.taskResult
      ) {
        try {
          const parsed = JSON.parse(task.taskResult);
          const flashcards = Array.isArray(parsed.flashcards)
            ? parsed.flashcards
            : [];
          const count =
            typeof parsed.metadata?.count === 'number'
              ? parsed.metadata.count
              : flashcards.length;

          initialHistoryData = {
            id: task.id,
            createdAt:
              task.createdAt?.toISOString() ?? new Date().toISOString(),
            flashcards,
            count,
          };
        } catch (error) {
          console.warn('[Flashcards Page] Failed to parse taskResult', error);
        }
      }
    }
  }

  return <FlashcardsClient initialHistoryData={initialHistoryData} />;
}
