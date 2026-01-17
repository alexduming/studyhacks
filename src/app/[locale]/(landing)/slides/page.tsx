import { redirect } from 'next/navigation';
import { getPresentationAction } from '@/app/actions/presentation';

import { envConfigs } from '@/config';

import Slides2Client from '../slides2/slides2-client';
import AIPPTClient from './aippt-client';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  params: Promise<{ locale: string }>;
}

export default async function Page({ searchParams, params }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { locale } = await params;
  const id = resolvedSearchParams?.id;

  // 🎯 功能切换：根据环境变量决定使用哪个版本的组件
  // 非程序员解释：
  // - 如果设置了 SLIDES_USE_V2=true，则使用新的 slides2 版本
  // - 否则使用原来的 AIPPTClient 组件
  // - 这样可以通过修改环境变量随时切换，无需修改代码
  const useV2 = envConfigs.slides_use_v2 === 'true';

  // 如果使用 V2 版本，直接使用 Slides2Client 组件
  if (useV2) {
    let initialPresentation = null;

    if (typeof id === 'string') {
      try {
        initialPresentation = await getPresentationAction(id);
      } catch (error) {
        console.error('Error fetching initial presentation:', error);
        // 即使服务端获取失败，也可以让客户端组件尝试或显示空状态
      }
    }

    return <Slides2Client initialPresentation={initialPresentation} />;
  }

  // 原来的逻辑：使用 AIPPTClient 组件
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
