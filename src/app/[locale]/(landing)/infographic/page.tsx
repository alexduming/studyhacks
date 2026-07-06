import { Suspense } from 'react';
import { getInfographicTaskByIdAction } from '@/app/actions/ai_task';
import { Loader2 } from 'lucide-react';

import InfographicClient from './infographic-client';

interface PageProps {
  searchParams: Promise<{ edit?: string }>;
}

export default async function InfographicPage({ searchParams }: PageProps) {
  const { edit: editTaskId } = await searchParams;

  // 在服务器端预加载编辑任务数据（如果 URL 中有 edit 参数）
  let editTaskData = null;
  if (editTaskId) {
    try {
      editTaskData = await getInfographicTaskByIdAction(editTaskId);
    } catch (error) {
      console.error('Failed to preload edit task:', error);
    }
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
        </div>
      }
    >
      <InfographicClient
        editTaskId={editTaskId || null}
        editTaskData={editTaskData}
      />
    </Suspense>
  );
}
