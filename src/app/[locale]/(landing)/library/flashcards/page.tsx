import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Layers } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { getAITasks } from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';

type FlashcardRecord = {
  id: string;
  createdAt: string;
  count: number;
  flashcards: Array<{
    front: string;
    back: string;
    difficulty?: string;
  }>;
};

async function getFlashcardHistory(userId: string): Promise<FlashcardRecord[]> {
  const tasks = await getAITasks({
    userId,
    scene: 'ai_flashcards',
    mediaType: 'text',
    limit: 30,
  });

  return tasks.map((task) => {
    let flashcards: FlashcardRecord['flashcards'] = [];
    let count = 0;

    try {
      const parsed = JSON.parse(task.taskResult || '{}');
      flashcards = parsed.flashcards || [];
      count = parsed.metadata?.count || flashcards.length;
    } catch (error) {
      console.warn('[Flashcards] Failed to parse task result:', error);
    }

    return {
      id: task.id,
      createdAt: task.createdAt?.toISOString() || new Date().toISOString(),
      count,
      flashcards,
    };
  });
}

// 移除 truncate 函数
// const truncate = (text: string, length = 60) => { ... };

export default async function FlashcardsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('library.flashcards');
  const user = await getUserInfo();
  if (!user) {
    notFound();
  }

  const records = await getFlashcardHistory(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{t('title')}</h2>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <Link href={`/${locale}/flashcards`}>
          <Button variant="outline">
            <Layers className="mr-2 h-4 w-4" />
            {t('buttons.new')}
          </Button>
        </Link>
      </div>

      {records.length === 0 ? (
        <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
          <div className="bg-muted mb-4 rounded-full p-4">
            <Layers className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="mb-2 text-xl font-semibold capitalize">
            {t('empty.title')}
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            {t('empty.description')}
          </p>
          <Link href={`/${locale}/flashcards`}>
            <Button variant="outline">{t('empty.button')}</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {records.map((record) => (
            <Link
              key={record.id}
              href={`/${locale}/flashcards?historyId=${record.id}`}
              className="group block h-full"
              aria-label={t('cards.actions.resumeHint', { count: record.count })}
            >
              <Card className="flex h-full flex-col p-0 transition hover:-translate-y-0.5 hover:border-primary/50">
                <div className="flex h-full flex-row">
                  {/* Left: Count */}
                  <div className="bg-muted/30 flex w-24 flex-col items-center justify-center border-r p-4">
                    <span className="text-primary text-3xl font-bold">
                      {record.count}
                    </span>
                    <span className="text-muted-foreground text-xs uppercase">
                      Cards
                    </span>
                  </div>

                  {/* Right: Content */}
                  <div className="flex flex-1 flex-col p-4">
                    {/* Q & A Preview */}
                    <div className="flex-1 space-y-2">
                      {record.flashcards.length > 0 ? (
                        <>
                          <div className="flex gap-2">
                            <span className="bg-primary/10 text-primary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold">
                              Q
                            </span>
                            <p className="line-clamp-2 font-medium leading-tight">
                              {record.flashcards[0].front}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <span className="bg-muted text-muted-foreground mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold">
                              A
                            </span>
                            <p className="text-muted-foreground line-clamp-2 text-sm leading-tight">
                              {record.flashcards[0].back}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground text-sm italic">
                          {t('cards.empty')}
                        </p>
                      )}
                    </div>

                    {/* Footer: Time */}
                    <div className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
                      <span>{new Date(record.createdAt).toLocaleString()}</span>
                      <ArrowRight className="text-primary/50 h-4 w-4" />
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

