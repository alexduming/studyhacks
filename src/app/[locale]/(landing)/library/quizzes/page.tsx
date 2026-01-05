import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Activity } from 'lucide-react';

import { getAITasks } from '@/shared/models/ai_task';
import { getUserInfo } from '@/shared/models/user';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';

type QuizRecord = {
  id: string;
  createdAt: string;
  count: number;
  questions: Array<{
    question: string;
    correctAnswer?: string | number;
    explanation?: string;
    type?: string;
  }>;
};

async function getQuizHistory(userId: string): Promise<QuizRecord[]> {
  const tasks = await getAITasks({
    userId,
    scene: 'ai_quiz',
    mediaType: 'text',
    limit: 30,
  });

  return tasks.map((task) => {
    let questions: QuizRecord['questions'] = [];
    let count = 0;
    try {
      const parsed = JSON.parse(task.taskResult || '{}');
      questions = parsed.questions || [];
      count = parsed.metadata?.count || questions.length;
    } catch (error) {
      console.warn('[Quiz] Failed to parse task result:', error);
    }

    return {
      id: task.id,
      createdAt: task.createdAt?.toISOString() || new Date().toISOString(),
      count,
      questions,
    };
  });
}

export default async function QuizzesPage({
  params,
}: {
  params: { locale: string };
}) {
  const user = await getUserInfo();
  if (!user) {
    notFound();
  }

  const records = await getQuizHistory(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Quizzes Library</h2>
          <p className="text-muted-foreground text-sm">
            回顾你生成过的所有测验题，随时下载或复制到题库工具中。
          </p>
        </div>
        <Link href={`/${params.locale}/quiz`}>
          <Button variant="outline">
            <Activity className="mr-2 h-4 w-4" />
            继续生成测验
          </Button>
        </Link>
      </div>

      {records.length === 0 ? (
        <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
          <div className="bg-muted mb-4 rounded-full p-4">
            <Activity className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="mb-2 text-xl font-semibold capitalize">
            Quizzes Library
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            目前还没有测验题记录，上传资料即可生成首套自测试题。
          </p>
          <Link href={`/${params.locale}/quiz`}>
            <Button variant="outline">生成新测验</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {records.map((record) => (
            <Card key={record.id} className="flex h-full flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base font-medium">
                  <span>测验组 · {record.count} 题</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(record.createdAt).toLocaleString()}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {record.questions.length === 0 ? (
                  <p className="text-muted-foreground">
                    解析记录为空，可以回到测验页重新生成。
                  </p>
                ) : (
                  record.questions.slice(0, 3).map((question, index) => (
                    <div
                      key={`${record.id}-${index}`}
                      className="rounded-lg border p-3"
                    >
                      <p className="font-semibold">
                        Q{index + 1}: {question.question}
                      </p>
                      {typeof question.correctAnswer !== 'undefined' && (
                        <p className="text-muted-foreground mt-2">
                          正确答案：{String(question.correctAnswer)}
                        </p>
                      )}
                      {question.explanation && (
                        <p className="text-xs text-primary mt-1">
                          解析：{question.explanation}
                        </p>
                      )}
                    </div>
                  ))
                )}
                {record.questions.length > 3 && (
                  <p className="text-muted-foreground text-xs">
                    ... 还有 {record.questions.length - 3} 道题，稍后支持导出为 CSV/QTI。
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

