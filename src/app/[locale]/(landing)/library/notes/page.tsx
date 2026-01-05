'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, PenSquare } from 'lucide-react';

import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

function formatPreview(text: string, maxLength = 160) {
  if (!text) return '暂无预览内容';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}...`
    : trimmed;
}

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
  const [locale, setLocale] = useState<string | undefined>();
  const [notes, setNotes] = useState<NoteDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    Promise.resolve(params).then((p) => setLocale(p?.locale));
  }, [params]);

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
          throw new Error(data.error || 'Failed to fetch notes');
        }

        setNotes(data.notes || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchNotes();
  }, [router]);

  const withLocale = (path: string) => (locale ? `/${locale}${path}` : path);

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
          <p className="mb-2 text-lg font-semibold">加载失败</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">AI Notes Library</h2>
          <p className="text-muted-foreground text-sm">
            随时回到这里继续编辑你的 AI 笔记，或把它们用于其他学习工具。
          </p>
        </div>
        <Link href={withLocale('/ai-note-taker')}>
          <Button>
            <PenSquare className="mr-2 h-4 w-4" />
            新建笔记
          </Button>
        </Link>
      </div>

      {notes.length === 0 ? (
        <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
          <div className="bg-muted mb-4 rounded-full p-4">
            <FileText className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="mb-2 text-xl font-semibold capitalize">
            Notes Library
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            你生成的笔记会显示在这里，点击下方按钮开始创建第一篇 AI 笔记。
          </p>
          <Link href={withLocale('/ai-note-taker')}>
            <Button variant="outline">生成新笔记</Button>
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
                  {note.wordCount} 字
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
