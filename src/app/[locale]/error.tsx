'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common.error');

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('[Page Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
      <div className="bg-destructive/10 text-destructive mb-6 flex h-20 w-20 items-center justify-center rounded-full">
        <AlertCircle className="h-10 w-10" />
      </div>
      <h2 className="mb-2 text-2xl font-bold tracking-tight">
        {/* 使用默认文案作为回退，防止 locale 加载失败 */}
        {t.has('title') ? t('title') : 'Something went wrong!'}
      </h2>
      <p className="text-muted-foreground mb-8 max-w-[500px]">
        {t.has('description')
          ? t('description')
          : 'We apologize for the inconvenience. An unexpected error has occurred. Please try again.'}
      </p>

      {/* 仅在开发环境显示详细错误 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-muted mb-8 w-full max-w-2xl overflow-auto rounded-lg p-4 text-left font-mono text-xs">
          <p className="font-bold text-red-500">{error.name}: {error.message}</p>
          {error.digest && <p className="mt-1 text-gray-500">Digest: {error.digest}</p>}
        </div>
      )}

      <Button onClick={() => reset()} className="gap-2">
        <RefreshCcw className="h-4 w-4" />
        {t.has('retry') ? t('retry') : 'Try again'}
      </Button>
    </div>
  );
}

