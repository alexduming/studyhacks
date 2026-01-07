import { getPresentationAction } from '@/app/actions/presentation';

import AIPPTClient from './aippt-client';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const id = resolvedSearchParams?.id;

  let initialPresentation = null;

  if (typeof id === 'string') {
    try {
      initialPresentation = await getPresentationAction(id);
    } catch (error) {
      console.error('Error fetching initial presentation:', error);
      // 即使服务端获取失败，也可以让客户端组件尝试或显示空状态
    }
  }

  return <AIPPTClient initialPresentation={initialPresentation} />;
}
