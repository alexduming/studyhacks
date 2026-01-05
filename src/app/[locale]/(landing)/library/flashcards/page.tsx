import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Layers } from 'lucide-react';

import { getAITasks } from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';

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

export default async function FlashcardsPage({
  params,
}: {
  params: { locale: string };
}) {
  const user = await getUserInfo();
  if (!user) {
    notFound();
  }

  const records = await getFlashcardHistory(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Flashcards Library</h2>
          <p className="text-muted-foreground text-sm">
            查看所有 AI 生成的闪卡，快速复习任意学习材料。
          </p>
        </div>
        <Link href={`/${params.locale}/flashcards`}>
          <Button variant="outline">
            <Layers className="mr-2 h-4 w-4" />
            继续生成闪卡
          </Button>
        </Link>
      </div>

      {records.length === 0 ? (
        <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
          <div className="bg-muted mb-4 rounded-full p-4">
            <Layers className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="mb-2 text-xl font-semibold capitalize">
            Flashcards Library
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            还没有历史记录，去上传一份资料尝试生成吧。
          </p>
          <Link href={`/${params.locale}/flashcards`}>
            <Button variant="outline">生成新闪卡</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {records.map((record) => (
            <Card key={record.id} className="flex h-full flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base font-medium">
                  <span>闪卡组 · {record.count} 张</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(record.createdAt).toLocaleString()}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {record.flashcards.length === 0 ? (
                  <p className="text-muted-foreground">
                    解析记录为空，可以前往生成页重新触发一次。
                  </p>
                ) : (
                  record.flashcards.slice(0, 4).map((card, index) => (
                    <div
                      key={`${record.id}-${index}`}
                      className="rounded-lg border p-3"
                    >
                      <p className="font-semibold">Q{index + 1}: {card.front}</p>
                      <p className="text-muted-foreground mt-2">
                        A: {card.back}
                      </p>
                      {card.difficulty && (
                        <p className="text-xs text-primary mt-1 uppercase">
                          {card.difficulty}
                        </p>
                      )}
                    </div>
                  ))
                )}
                {record.flashcards.length > 4 && (
                  <p className="text-muted-foreground text-xs">
                    ... 还有 {record.flashcards.length - 4} 张闪卡，可在生成时下载原始 JSON。
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

