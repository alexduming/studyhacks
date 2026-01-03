import Link from 'next/link';
import { Image as ImageIcon } from 'lucide-react';

import { getUserInfographicTasksAction } from '@/app/actions/ai_task';
import { Button } from '@/shared/components/ui/button';
import { InfographicCard } from './infographic-card';

/**
 * 信息图历史列表页面（/library/infographics）
 *
 * 非程序员解释：
 * - 这个页面会读取你在“AI 信息图生成器”里发起过的任务（数据来自 ai_task 表）
 * - 每一条记录会展示：生成时间、生成提示词、预览图封面、下载按钮
 * - 卡片可点击放大查看预览图
 */
export default async function InfographicsPage() {
  // 从后端读取当前用户最近的 Infographic 任务
  const tasks = await getUserInfographicTasksAction();

  // 没有任何任务时，展示一个友好的空状态，引导用户去生成第一张信息图
  if (!tasks || tasks.length === 0) {
    return (
      <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <div className="bg-muted mb-4 rounded-full p-4">
          <ImageIcon className="text-muted-foreground h-8 w-8" />
        </div>
        <h3 className="mb-2 text-xl font-semibold capitalize">
          Infographics Library
        </h3>
        <p className="text-muted-foreground mb-6 max-w-md">
          Your generated infographics will appear here. Start creating new
          content to build your library.
        </p>
        <Link href="/infographic">
          <Button variant="outline">Generate New Infographics</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">My Infographics</h2>
        <Link href="/infographic">
          <Button variant="outline">
            <ImageIcon className="mr-2 h-4 w-4" />
            Generate New Infographics
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => {
          // 尝试从 taskResult 中解析出图片 URL
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

          // 格式化时间
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
