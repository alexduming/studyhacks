'use client';

import { useRef, useState } from 'react';
import {
  parseFileAction,
  parseMultipleImagesAction,
} from '@/app/actions/aippt';
import { motion } from 'framer-motion';
import {
  Download,
  FileImage,
  FileText,
  Images,
  Loader2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

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

  // 新增：支持批量文件上传（参考 /slides 页面）
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isParsingFiles, setIsParsingFiles] = useState(false);
  const [parsingProgress, setParsingProgress] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 新的文件上传处理逻辑：支持批量上传任意类型的文件（参考 /slides 页面）
  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setError('');
    setFileInfo('');

    // 说明：现在支持上传多个任意类型的文件，不仅限于图片
    // 这样用户可以一次性上传多个PDF、DOCX、图片等文件

    if (files.length > 1) {
      // 批量文件上传（支持任意类型：图片、PDF、DOCX等）
      setUploadedFiles(files);
      setUploadedFile(null);

      // 统计文件类型，给用户更友好的提示
      const imageCount = files.filter(
        (f) =>
          f.type.startsWith('image/') ||
          /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name)
      ).length;
      const pdfCount = files.filter((f) => f.name.endsWith('.pdf')).length;
      const docCount = files.filter((f) => f.name.endsWith('.docx')).length;
      const otherCount = files.length - imageCount - pdfCount - docCount;

      // 使用多语言文案构建文件类型统计信息
      const typeParts = [];
      if (imageCount > 0)
        typeParts.push(t('upload.file_type_images', { count: imageCount }));
      if (pdfCount > 0)
        typeParts.push(t('upload.file_type_pdfs', { count: pdfCount }));
      if (docCount > 0)
        typeParts.push(t('upload.file_type_docs', { count: docCount }));
      if (otherCount > 0)
        typeParts.push(t('upload.file_type_others', { count: otherCount }));

      // 使用多语言分隔符连接文件类型
      const fileTypesText = typeParts.join(t('upload.separator'));
      setFileInfo(
        t('upload.file_info', {
          fileName: `${t('upload.file_count', { count: files.length })}：${fileTypesText}`,
        })
      );
      toast.success(
        t('upload.files_selected_toast', {
          count: files.length,
          types: fileTypesText,
        })
      );
    } else if (files.length === 1) {
      // 单个文件上传
      setUploadedFile(files[0]);
      setUploadedFiles([]);
      setFileInfo(
        t('upload.file_info', {
          fileName: files[0].name,
        })
      );
    }

    // 清空文件输入，允许重复选择相同文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    // 检查是否至少有一种输入（文本、单个文件或多个文件）
    if (!sourceContent.trim() && !uploadedFile && uploadedFiles.length === 0) {
      setError(t('errors.no_content'));
      return;
    }

    setIsGenerating(true);
    setError('');
    setTaskId(null);
    setImageUrls([]);

    try {
      let contentToGenerate = sourceContent;

      // 处理批量文件上传（支持图片、PDF、DOCX等多种类型）
      if (uploadedFiles.length > 0) {
        setIsParsingFiles(true);
        setParsingProgress(
          t('upload.processing_files', { count: uploadedFiles.length })
        );

        // 检查是否全部是图片文件
        const allImages = uploadedFiles.every(
          (file) =>
            file.type.startsWith('image/') ||
            /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)
        );

        let parsedContent = '';

        if (allImages) {
          // 场景1：全部是图片 - 使用批量 OCR 处理（更高效）
          setParsingProgress(
            t('upload.recognizing_images', { count: uploadedFiles.length })
          );
          const formData = new FormData();
          uploadedFiles.forEach((file) => {
            formData.append('files', file);
          });
          parsedContent = await parseMultipleImagesAction(formData);
        } else {
          // 场景2：包含非图片文件 - 逐个解析每个文件
          const parsedContents: string[] = [];

          for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            setParsingProgress(
              t('upload.processing_file', {
                current: i + 1,
                total: uploadedFiles.length,
                fileName: file.name,
              })
            );

            try {
              const formData = new FormData();
              formData.append('file', file);
              const content = await parseFileAction(formData);
              parsedContents.push(
                `${t('upload.file_header', { index: i + 1, fileName: file.name })}\n${content}`
              );
            } catch (error: any) {
              console.error(
                t('upload.parse_file_failed', { fileName: file.name }),
                error
              );
              parsedContents.push(
                `${t('upload.file_header', { index: i + 1, fileName: file.name })}\n${t('upload.parse_failed_message', { error: error.message })}`
              );
            }
          }

          parsedContent = parsedContents.join('\n\n');
        }

        setIsParsingFiles(false);
        setParsingProgress('');

        // 如果用户同时输入了文字，将文件内容和用户输入结合起来
        // 用户输入的文字作为额外的说明或要求
        if (sourceContent.trim()) {
          contentToGenerate = `${sourceContent}\n\n${t('upload.extracted_content_header')}\n${parsedContent}`;
        } else {
          contentToGenerate = parsedContent;
        }
      }
      // 处理单个文件上传
      else if (uploadedFile) {
        setIsParsingFiles(true);
        setParsingProgress(
          t('upload.processing_single_file', { fileName: uploadedFile.name })
        );

        const formData = new FormData();
        formData.append('file', uploadedFile);
        // Use general file parser (supports PDF, DOCX, TXT, Image)
        const parsedContent = await parseFileAction(formData);

        setIsParsingFiles(false);
        setParsingProgress('');

        // 如果用户同时输入了文字，将文件内容和用户输入结合起来
        if (sourceContent.trim()) {
          contentToGenerate = `${sourceContent}\n\n${t('upload.extracted_content_header')}\n${parsedContent}`;
        } else {
          contentToGenerate = parsedContent;
        }
      }

      // 使用带托底的新API
      const resp = await fetch('/api/infographic/generate-with-fallback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: contentToGenerate,
          aspectRatio,
          resolution,
          outputFormat,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          // 这里抛出的错误只作为开发调试信息，真正给用户看的提示在下面统一处理
          `Generate infographic request failed: ${resp.status} ${resp.statusText || text}`
        );
      }

      const data = await resp.json();

      if (!data.success) {
        throw new Error(data.error || t('errors.generate_failed'));
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
    } catch (err: any) {
      console.error('Generate infographic error:', err);
      setError(err instanceof Error ? err.message : t('errors.unknown'));
    } finally {
      setIsGenerating(false);
      setIsParsingFiles(false);
      setParsingProgress('');
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
            // 同样这里记录的是更技术化的错误，方便排查
            `Query task failed: ${resp.status} ${resp.statusText || text}`
          );
        }

        const data = await resp.json();
        if (!data.success) {
          throw new Error(data.error || t('errors.poll_failed'));
        }

        const status = data.status as string;
        const urls = (data.results || data.resultUrls || []) as string[];

        if (status === 'SUCCESS' && urls.length > 0) {
          setImageUrls(urls);
          return;
        }

        if (status === 'FAILED') {
          throw new Error(t('errors.generation_failed'));
        }
      } catch (err) {
        console.error('Poll infographic result error:', err);
        setError(err instanceof Error ? err.message : t('errors.poll_failed'));
        return;
      }

      // 等待一段时间再继续下一次查询
      await delay(3000);
    }

    setError(t('errors.timeout'));
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
                {t('form.input_title')}
              </h2>

              {/* 文件上传 */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  id="infographic-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={isFileLoading || isGenerating || isParsingFiles}
                  className="border-primary/40 text-primary/80 hover:border-primary/70"
                >
                  <label
                    htmlFor="infographic-file-input"
                    className="flex cursor-pointer items-center"
                  >
                    {isFileLoading || isParsingFiles ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('upload.loading')}
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        {t('upload.button_label_batch')}
                      </>
                    )}
                  </label>
                </Button>
                <span className="text-xs text-gray-400">
                  {t('upload.hint_batch')}
                </span>
              </div>

              {/* 单个文件预览 */}
              {uploadedFile && (
                <div className="bg-muted/50 mb-3 flex items-center justify-between rounded-lg border px-4 py-2">
                  <div className="flex items-center gap-2">
                    {uploadedFile.name.endsWith('.pdf') ? (
                      <FileText className="h-4 w-4 text-red-500" />
                    ) : uploadedFile.name.endsWith('.docx') ? (
                      <FileText className="h-4 w-4 text-blue-500" />
                    ) : uploadedFile.type.startsWith('image/') ? (
                      <Images className="h-4 w-4 text-green-500" />
                    ) : (
                      <FileText className="h-4 w-4 text-gray-500" />
                    )}
                    <span className="text-sm font-medium text-white">
                      {uploadedFile.name}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setUploadedFile(null);
                      setFileInfo('');
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* 批量文件预览 */}
              {uploadedFiles.length > 0 && (
                <div className="bg-muted/50 mb-3 rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Images className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium text-white">
                        {t('upload.files_selected', {
                          count: uploadedFiles.length,
                        })}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setUploadedFiles([]);
                        setFileInfo('');
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="max-h-[120px] space-y-1 overflow-y-auto">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="hover:bg-muted flex items-center justify-between rounded px-2 py-1"
                      >
                        <span className="text-muted-foreground text-xs text-gray-300">
                          {index + 1}. {file.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => {
                            setUploadedFiles(
                              uploadedFiles.filter((_, i) => i !== index)
                            );
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 文件解析进度提示 */}
              {isParsingFiles && parsingProgress && (
                <div className="border-primary/30 bg-primary/10 text-primary/90 mb-3 flex items-start gap-2 rounded-lg border p-3 text-xs">
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin" />
                  <span>{parsingProgress}</span>
                </div>
              )}

              {fileInfo && !uploadedFile && uploadedFiles.length === 0 && (
                <div className="border-primary/30 bg-primary/5 text-primary/80 mb-3 flex items-start gap-2 rounded-lg border p-2 text-xs">
                  <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{fileInfo}</span>
                </div>
              )}

              {/* 文本输入 */}
              <textarea
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                placeholder={t('form.textarea_placeholder')}
                className="focus:border-primary mb-4 h-60 w-full resize-none rounded-lg border border-gray-600 bg-gray-800/60 p-4 text-sm text-white placeholder-gray-400 focus:outline-none"
              />

              {/* 参数设置：宽高比 / 分辨率 / 格式 */}
              <div className="mb-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-300">
                    {t('form.aspect_ratio_label')}
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
                    {t('form.resolution_label')}
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
                    {t('form.format_label')}
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
                    setUploadedFile(null);
                    setUploadedFiles([]);
                  }}
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:border-gray-500"
                >
                  {t('actions.clear')}
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="from-primary hover:from-primary/90 to-primary/70 hover:to-primary/80 bg-gradient-to-r text-white"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('actions.generating')}
                    </>
                  ) : (
                    <>
                      <CreditsCost credits={resolution === '4K' ? 12 : 6} />
                      {t('actions.generate')}
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
                {t('result.title')}
              </h2>

              {!taskId && imageUrls.length === 0 && !error && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-sm text-gray-400">
                  <FileImage className="text-primary h-10 w-10" />
                  <p>{t('result.empty_desc')}</p>
                  <p className="text-xs text-gray-500">
                    {t('result.empty_hint')}
                  </p>
                </div>
              )}

              {isGenerating && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-sm text-gray-400">
                  <Loader2 className="text-primary h-8 w-8 animate-spin" />
                  <p>{t('result.loading')}</p>
                </div>
              )}

              {!isGenerating && imageUrls.length > 0 && (
                <div className="space-y-4">
                  {imageUrls.map((url, idx) => (
                    <div
                      key={idx}
                      className="border-primary/30 overflow-hidden rounded-xl border bg-gray-900/80"
                    >
                      <div className="border-primary/20 bg-primary/10 flex items-center justify-between border-b px-4 py-2">
                        <span className="text-primary/90 text-xs">
                          {t('result.image_title', { index: idx + 1 })}
                        </span>
                        <a
                          href={url}
                          download={`infographic-${idx + 1}.png`}
                          className="border-primary/40 text-primary/90 hover:border-primary/70 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                        >
                          <Download className="h-3 w-3" />
                          {t('result.download')}
                        </a>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={t('modal.image_alt')}
                        className="h-auto w-full cursor-pointer bg-black/40 object-contain transition-opacity hover:opacity-90"
                        onClick={() => setEnlargedImageUrl(url)}
                        title={t('result.click_to_enlarge')}
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
                alt={t('modal.image_alt')}
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
