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

import { CreditsCost } from '@/shared/components/ai-elements/credits-display';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent } from '@/shared/components/ui/dialog';
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
  // 用于控制图片放大查看的模态框状态
  // 当用户点击图片时，这个状态会保存要显示的图片 URL
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
  // 记录使用的提供商和是否使用了托底服务
  const [provider, setProvider] = useState<string | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState<boolean>(false);

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
      // 使用带托底的新API
      const resp = await fetch('/api/infographic/generate-with-fallback', {
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
      setProvider(data.provider || null);
      setFallbackUsed(data.fallbackUsed || false);

      // 如果返回了imageUrls（同步API如Replicate/Together AI），直接显示
      if (data.imageUrls && data.imageUrls.length > 0) {
        setImageUrls(data.imageUrls);
        setIsGenerating(false);
        return;
      }

      // 否则开始轮询查询任务结果（异步API如KIE/Novita）
      await pollInfographicResult(data.taskId, data.provider);
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
   * - 新增：支持多提供商查询（KIE、Replicate、Together AI、Novita AI）
   */
  const pollInfographicResult = async (taskId: string, provider?: string) => {
    const maxAttempts = 20; // 最多轮询 20 次（例如每 3 秒一次，大约 1 分钟）
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // 使用带托底的查询API
        const queryUrl = `/api/infographic/query-with-fallback?taskId=${encodeURIComponent(taskId)}${provider ? `&provider=${encodeURIComponent(provider)}` : ''}`;
        const resp = await fetch(queryUrl);

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

        const status = data.status as string;
        const urls = (data.results || data.resultUrls || []) as string[];

        if (status === 'SUCCESS' && urls.length > 0) {
          setImageUrls(urls);
          return;
        }

        if (status === 'FAILED') {
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
    <div className="via-primary/5 min-h-screen bg-gradient-to-b from-gray-950 to-gray-950">
      {/* 背景装饰：改为统一的 primary 光晕，移除额外的蓝色主色块 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />
        <div className="bg-primary/5 absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-24">
        <ScrollAnimation>
          <div className="mb-12 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              {/* 标题渐变：白色 → primary，而不是白色 → 蓝色 */}
              <h1 className="via-primary/80 to-primary/60 mb-6 bg-gradient-to-r from-white bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
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
              className="border-primary/20 rounded-2xl border bg-gray-900/60 p-6 backdrop-blur-sm"
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
                  className="border-primary/40 text-primary/80 hover:border-primary/70"
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
                <div className="border-primary/30 bg-primary/5 text-primary/80 mb-3 flex items-start gap-2 rounded-lg border p-2 text-xs">
                  <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{fileInfo}</span>
                </div>
              )}

              {/* 文本输入 */}
              <textarea
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                placeholder="粘贴你的学习笔记、知识点列表或课程内容，AI 会根据这些内容生成一张信息图。"
                className="focus:border-primary mb-4 h-60 w-full resize-none rounded-lg border border-gray-600 bg-gray-800/60 p-4 text-sm text-white placeholder-gray-400 focus:outline-none"
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
                    className="focus:border-primary w-full rounded-lg border border-gray-600 bg-gray-800/60 p-2 text-xs text-white focus:outline-none"
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
                    className="focus:border-primary w-full rounded-lg border border-gray-600 bg-gray-800/60 p-2 text-xs text-white focus:outline-none"
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
                    className="focus:border-primary w-full rounded-lg border border-gray-600 bg-gray-800/60 p-2 text-xs text-white focus:outline-none"
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
                  className="from-primary hover:from-primary/90 to-primary/70 hover:to-primary/80 bg-gradient-to-r text-white"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      AI 正在生成信息图任务...
                    </>
                  ) : (
                    <>
                      <CreditsCost credits={3} />
                      <Zap className="mr-2 h-4 w-4" />
                      生成信息图
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
              className="border-primary/20 rounded-2xl border bg-gray-900/60 p-6 backdrop-blur-sm"
            >
              <h2 className="mb-4 text-xl font-semibold text-white">
                生成结果
              </h2>

              {!taskId && imageUrls.length === 0 && !error && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-sm text-gray-400">
                  <FileImage className="text-primary h-10 w-10" />
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
                  <Loader2 className="text-primary h-8 w-8 animate-spin" />
                  <p>AI 正在生成信息图，请稍候...</p>
                </div>
              )}

              {!isGenerating && imageUrls.length > 0 && (
                <div className="space-y-4">
                  {/* 显示使用的提供商信息 */}
                  {provider && (
                    <div className={`rounded-lg border px-3 py-2 text-xs ${
                      fallbackUsed 
                        ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                        : 'border-green-500/30 bg-green-500/10 text-green-300'
                    }`}>
                      {fallbackUsed ? '⚠️' : '✅'} 由 <strong>{provider}</strong> 生成
                      {fallbackUsed && ' （KIE服务不可用，已自动切换到托底服务）'}
                    </div>
                  )}
                  {imageUrls.map((url, idx) => (
                    <div
                      key={idx}
                      className="border-primary/30 overflow-hidden rounded-xl border bg-gray-900/80"
                    >
                      <div className="border-primary/20 bg-primary/10 flex items-center justify-between border-b px-4 py-2">
                        <span className="text-primary/90 text-xs">
                          信息图 {idx + 1}
                        </span>
                        <a
                          href={url}
                          download={`infographic-${idx + 1}.png`}
                          className="border-primary/40 text-primary/90 hover:border-primary/70 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                        >
                          <Download className="h-3 w-3" />
                          下载图片
                        </a>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Infographic ${idx + 1}`}
                        className="h-auto w-full cursor-pointer bg-black/40 object-contain transition-opacity hover:opacity-90"
                        onClick={() => setEnlargedImageUrl(url)}
                        title="点击图片可放大查看"
                      />
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </ScrollAnimation>
      </div>

      {/* 图片放大查看模态框 */}
      {/* 
        非程序员解释：
        - 当用户点击图片时，enlargedImageUrl 会被设置，这个模态框就会显示
        - 模态框会显示一个放大的图片，方便用户查看细节
        - 点击关闭按钮或背景区域可以关闭模态框
      */}
      <Dialog
        open={enlargedImageUrl !== null}
        onOpenChange={(open) => {
          // 当模态框关闭时，清空 enlargedImageUrl
          if (!open) {
            setEnlargedImageUrl(null);
          }
        }}
      >
        <DialogContent
          className="border-primary/30 max-h-[95vh] max-w-[95vw] bg-gray-900/95 p-0"
          showCloseButton={true}
        >
          {enlargedImageUrl && (
            <div className="relative flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enlargedImageUrl}
                alt="放大查看的信息图"
                className="h-auto max-h-[85vh] w-auto max-w-full rounded-lg object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InfographicPage;
