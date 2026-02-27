import { getTranslations } from 'next-intl/server';
import { Presentation } from 'lucide-react';

import { getUserPresentationsAction } from '@/app/actions/presentation';
import { Button } from '@/shared/components/ui/button';
import { Link } from '@/core/i18n/navigation';
import { PresentationCard } from './presentation-card';

export const dynamic = 'force-dynamic';

export default async function PresentationsPage() {
  const t = await getTranslations('library.presentations');
  const presentations = await getUserPresentationsAction();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('title')}</h2>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <Link href="/slides">
          <Button>
            <Presentation className="mr-2 h-4 w-4" />
            {t('buttons.new')}
          </Button>
        </Link>
      </div>

      {presentations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
          <div className="bg-muted mb-4 rounded-full p-4">
            <Presentation className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold">{t('empty.title')}</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            {t('empty.description')}
          </p>
          <Link href="/slides" className="mt-4">
            <Button>{t('empty.button')}</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {presentations.map((item) => (
            <PresentationCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

