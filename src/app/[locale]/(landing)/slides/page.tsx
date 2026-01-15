import { redirect } from 'next/navigation';
import { getPresentationAction } from '@/app/actions/presentation';

import AIPPTClient from './aippt-client';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  params: Promise<{ locale: string }>;
}

export default async function Page({ searchParams, params }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { locale } = await params;
  const id = resolvedSearchParams?.id;

  // 🎯 彻底修复：将旧路由重定向到新路由，复用更强大的加载逻辑
  if (typeof id === 'string') {
    redirect(`/${locale}/slides2?id=${id}`);
  }

  let initialPresentation = null;
  // ... (保留部分代码以防万一，但逻辑上已经 redirect)
  if (typeof id === 'string') {
    try {
      initialPresentation = await getPresentationAction(id);
    } catch (error) {
      console.error('Error fetching initial presentation:', error);
    }
  }

  return <AIPPTClient initialPresentation={initialPresentation} />;
}
