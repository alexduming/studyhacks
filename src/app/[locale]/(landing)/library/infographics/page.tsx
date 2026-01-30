import Link from 'next/link';
import { Image as ImageIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { getUserInfographicTasksAction } from '@/app/actions/ai_task';
import { Button } from '@/shared/components/ui/button';
import { InfographicCard } from './infographic-card';

export default async function InfographicsPage() {
  const t = await getTranslations('library.infographics');
  const tasks = await getUserInfographicTasksAction();

  if (!tasks || tasks.length === 0) {
    return (
      <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <div className="bg-muted mb-4 rounded-full p-4">
          <ImageIcon className="text-muted-foreground h-8 w-8" />
        </div>
        <h3 className="mb-2 text-xl font-semibold capitalize">
          {t('empty.title')}
        </h3>
        <p className="text-muted-foreground mb-6 max-w-md">
          {t('empty.description')}
        </p>
        <Link href="/infographic">
          <Button variant="outline">{t('empty.button')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('title')}</h2>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <Link href="/infographic">
          <Button variant="outline">
            <ImageIcon className="mr-2 h-4 w-4" />
            {t('buttons.new')}
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => {
          let firstImageUrl: string | null = null;
          try {
            if (task.taskResult) {
              const parsed = JSON.parse(task.taskResult);
              if (Array.isArray(parsed.imageUrls) && parsed.imageUrls.length > 0) {
                firstImageUrl = parsed.imageUrls[0];
              }
            }
          } catch {
            firstImageUrl = null;
          }

          const formattedDate = task.createdAt
            ? new Date(task.createdAt).toLocaleString()
            : '';

          return (
            <InfographicCard
              key={task.id}
              id={task.id}
              imageUrl={firstImageUrl}
              prompt={task.prompt || ''}
              formattedDate={formattedDate}
            />
          );
        })}
      </div>
    </div>
  );
}
