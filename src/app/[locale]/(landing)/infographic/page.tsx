'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  FileImage,
  FileText,
  Loader2,
  Upload,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { readLearningFileContent } from '@/shared/lib/file-reader';

type AspectRatioOption =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9';

const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
];

const InfographicPage = () => {
  const t = useTranslations('infographic');
  const [sourceContent, setSourceContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('1:1');
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('1K');
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpg'>('png');
  const [fileInfo, setFileInfo] = useState<string>('');
  const [isFileLoading, setIsFileLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsFileLoading(true);
    setError('');
    setFileInfo('');

    try {
      const content = await readLearningFileContent(file);
      setSourceContent(content);
      setFileInfo(
        `已从文件「${file.name}」读取内容，下面文本框中的内容将用于生成信息图。`
      );
    } catch (err) {
      console.error('Error reading file for infographic:', err);
      setError('读取文件内容失败，请确认文件未损坏或格式受支持。');
    } finally {
      setIsFileLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGenerate = async () => {
    if (!sourceContent.trim()) {
      setError('请先上传文件或粘贴要转换为信息图的知识内容。');
      return;
    }

    setIsGenerating(true);
    setError('');
    setTaskId(null);
    setImageUrls([]);

    try {
      const resp = await fetch('/api/infographic/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: sourceContent,
          aspectRatio,
          resolution,
          outputFormat,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `生成信息图请求失败：${resp.status} ${resp.statusText || text}`
        );
      }

      const data = await resp.json();

      if (!data.success) {
        throw new Error(data.error || '生成信息图失败，请稍后重试。');
      }

      setTaskId(data.taskId);

      // 任务创建成功后，开始轮询查询任务结果
      await pollInfographicResult(data.taskId);
    } catch (err) {
      console.error('Generate infographic error:', err);
      setError(
        err instanceof Error
          ? err.message
          : '生成信息图时出现未知错误，请稍后重试。'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 轮询查询信息图任务结果
   *
   * 非程序员解释：
   * - nano-banana-pro 在后台慢慢画图，我们只能拿到一个 taskId
   * - 这里每隔几秒去问一次「画完了吗？有图片地址了吗？」
   * - 一旦拿到 resultUrls，就在右侧直接显示图片并支持下载
   */
  const pollInfographicResult = async (taskId: string) => {
    const maxAttempts = 20; // 最多轮询 20 次（例如每 3 秒一次，大约 1 分钟）
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const resp = await fetch(
          `/api/infographic/query?taskId=${encodeURIComponent(taskId)}`
        );

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(
            `查询任务失败：${resp.status} ${resp.statusText || text}`
          );
        }

        const data = await resp.json();
        if (!data.success) {
          throw new Error(data.error || '查询信息图任务失败');
        }

        const state = data.state as string;
        const urls = (data.resultUrls || []) as string[];

        if (state === 'success' && urls.length > 0) {
          setImageUrls(urls);
          return;
        }

        if (state === 'fail') {
          throw new Error('信息图生成失败，请稍后重试。');
        }
      } catch (err) {
        console.error('Poll infographic result error:', err);
        setError(
          err instanceof Error
            ? err.message
            : '查询信息图生成结果时出现错误，请稍后重试。'
        );
        return;
      }

      // 等待一段时间再继续下一次查询
      await delay(3000);
    }

    setError('查询超时：信息图生成时间过长，请稍后在 Kie 控制台查看任务状态。');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-purple-950/10 to-gray-950">
      {/* 背景装饰 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-purple-600/10 blur-3xl" />
        <div className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12">
        <ScrollAnimation>
          <div className="mb-12 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="mb-6 bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {t('title', { defaultMessage: 'AI 学习信息图生成器' })}
              </h1>
              <p className="mx-auto max-w-3xl text-lg text-gray-300 md:text-xl">
                {t('subtitle', {
                  defaultMessage:
                    '上传课件 / 笔记 / 文本，让 AI 自动为你生成扁平风格的学习信息图。',
                })}
              </p>
            </motion.div>
          </div>
        </ScrollAnimation>

        <ScrollAnimation delay={0.2}>
          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {/* 左侧：输入区域 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="rounded-2xl border border-purple-500/20 bg-gray-900/60 p-6 backdrop-blur-sm"
            >
              <h2 className="mb-4 text-xl font-semibold text-white">
                输入知识内容
              </h2>

              {/* 文件上传 */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  id="infographic-file-input"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={isFileLoading || isGenerating}
                  className="border-purple-500/40 text-purple-300 hover:border-purple-500/70"
                >
                  <label
                    htmlFor="infographic-file-input"
                    className="flex cursor-pointer items-center"
                  >
                    {isFileLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在读取文件...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        从文件读取内容（PDF / Word / TXT）
                      </>
                    )}
                  </label>
                </Button>
                <span className="text-xs text-gray-400">
                  也可以直接在下方粘贴或编辑要转换的信息。
                </span>
              </div>

              {fileInfo && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-2 text-xs text-purple-200">
                  <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{fileInfo}</span>
                </div>
              )}

              {/* 文本输入 */}
              <textarea
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                placeholder="粘贴你的学习笔记、知识点列表或课程内容，AI 会根据这些内容生成一张信息图。"
                className="mb-4 h-60 w-full resize-none rounded-lg border border-gray-600 bg-gray-800/60 p-4 text-sm text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
              />

              {/* 参数设置：宽高比 / 分辨率 / 格式 */}
              <div className="mb-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-300">
                    信息图宽高比
                  </label>
                  <select
                    value={aspectRatio}
                    onChange={(e) =>
                      setAspectRatio(e.target.value as AspectRatioOption)
                    }
                    className="w-full rounded-lg border border-gray-600 bg-gray-800/60 p-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                  >
                    {ASPECT_RATIO_OPTIONS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-300">
                    分辨率
                  </label>
                  <select
                    value={resolution}
                    onChange={(e) =>
                      setResolution(e.target.value as '1K' | '2K' | '4K')
                    }
                    className="w-full rounded-lg border border-gray-600 bg-gray-800/60 p-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-300">
                    输出格式
                  </label>
                  <select
                    value={outputFormat}
                    onChange={(e) =>
                      setOutputFormat(e.target.value as 'png' | 'jpg')
                    }
                    className="w-full rounded-lg border border-gray-600 bg-gray-800/60 p-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="png">PNG</option>
                    <option value="jpg">JPG</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  onClick={() => {
                    setSourceContent('');
                    setFileInfo('');
                    setError('');
                    setTaskId(null);
                    setImageUrls([]);
                  }}
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:border-gray-500"
                >
                  清空内容
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      AI 正在生成信息图任务...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      生成信息图（nano-banana-pro）
                    </>
                  )}
                </Button>
              </div>
            </motion.div>

            {/* 右侧：结果展示 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="rounded-2xl border border-purple-500/20 bg-gray-900/60 p-6 backdrop-blur-sm"
            >
              <h2 className="mb-4 text-xl font-semibold text-white">
                生成结果
              </h2>

              {!taskId && imageUrls.length === 0 && !error && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-sm text-gray-400">
                  <FileImage className="h-10 w-10 text-purple-400" />
                  <p>
                    填写左侧内容，并点击「生成信息图」，这里将显示
                    nano-banana-pro 返回的学习信息图。
                  </p>
                  <p className="text-xs text-gray-500">
                    提示：生成过程可能需要几秒钟，请耐心等待图片加载完成。
                  </p>
                </div>
              )}

              {isGenerating && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-sm text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                  <p>AI 正在生成信息图，请稍候...</p>
                </div>
              )}

              {!isGenerating && imageUrls.length > 0 && (
                <div className="space-y-4">
                  {imageUrls.map((url, idx) => (
                    <div
                      key={idx}
                      className="overflow-hidden rounded-xl border border-purple-500/30 bg-gray-900/80"
                    >
                      <div className="flex items-center justify-between border-b border-purple-500/20 bg-purple-500/10 px-4 py-2">
                        <span className="text-xs text-purple-100">
                          信息图 {idx + 1}
                        </span>
                        <a
                          href={url}
                          download={`infographic-${idx + 1}.png`}
                          className="inline-flex items-center gap-1 rounded-md border border-purple-500/40 px-2 py-1 text-[11px] text-purple-100 hover:border-purple-500/70"
                        >
                          <Download className="h-3 w-3" />
                          下载图片
                        </a>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Infographic ${idx + 1}`}
                        className="h-auto w-full bg-black/40 object-contain"
                      />
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </ScrollAnimation>
      </div>
    </div>
  );
};

export default InfographicPage;
