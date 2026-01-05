'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, PenSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

type NoteDocument = {
  id: string;
  title: string;
  summary: string | null;
  markdown: string;
  wordCount: number;
  language: string | null;
  status: string;
  updatedAt: string;
};

type NotesPageParams = { locale?: string };

export default function NotesLibraryPage({
  params,
}: {
  params: Promise<NotesPageParams> | NotesPageParams;
}) {
  const t = useTranslations('library.notes');
  const [locale, setLocale] = useState<string | undefined>();
  const [notes, setNotes] = useState<NoteDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    Promise.resolve(params).then((p) => setLocale(p?.locale));
  }, [params]);

  const previewFallback = t('list.previewEmpty');
  const errorFallback = t('errors.fetchFailed');

  useEffect(() => {
    async function fetchNotes() {
      try {
        setLoading(true);
        const response = await fetch('/api/library/notes');
        const data = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/signin');
            return;
          }
          throw new Error(data.error || errorFallback);
        }

        setNotes(data.notes || []);
      } catch (err: any) {
        setError(err.message || errorFallback);
      } finally {
        setLoading(false);
      }
    }

    fetchNotes();
  }, [router, errorFallback]);

  const withLocale = (path: string) => (locale ? `/${locale}${path}` : path);
  const formatPreview = (text: string, maxLength = 160) => {
    if (!text) return previewFallback;
    const trimmed = text.replace(/\s+/g, ' ').trim();
    return trimmed.length > maxLength
      ? `${trimmed.slice(0, maxLength)}...`
      : trimmed;
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-destructive text-center">
          <p className="mb-2 text-lg font-semibold">
            {t('errors.fetchFailed')}
          </p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{t('title')}</h2>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <Link href={withLocale('/ai-note-taker')}>
          <Button>
            <PenSquare className="mr-2 h-4 w-4" />
            {t('buttons.new')}
          </Button>
        </Link>
      </div>

      {notes.length === 0 ? (
        <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
          <div className="bg-muted mb-4 rounded-full p-4">
            <FileText className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="mb-2 text-xl font-semibold capitalize">
            {t('empty.title')}
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            {t('empty.description')}
          </p>
          <Link href={withLocale('/ai-note-taker')}>
            <Button variant="outline">{t('empty.button')}</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={withLocale(`/library/notes/${note.id}`)}
              className="group"
            >
              <div className="hover:border-primary bg-card/50 relative flex h-full flex-col rounded-xl border p-5 transition-shadow hover:shadow-md">
                <div className="flex items-center justify-end gap-3">
                  <span className="text-muted-foreground text-xs">
                    {new Date(note.updatedAt).toLocaleString()}
                  </span>
                </div>
                <h3 className="mt-2 line-clamp-1 text-xl font-semibold">
                  {note.title}
                </h3>
                <p
                  className={cn(
                    'text-muted-foreground mt-3 text-sm leading-relaxed',
                    'line-clamp-3'
                  )}
                >
                  {formatPreview(note.summary || note.markdown)}
                </p>
                <div className="text-muted-foreground mt-4 flex items-center text-xs">
                  <FileText className="mr-1 h-4 w-4" />
                  {t('list.wordCount', { count: note.wordCount })}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
