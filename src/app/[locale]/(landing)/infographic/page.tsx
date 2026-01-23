'use client';

import { useRef, useState } from 'react';
import {
  parseFileAction,
  parseMultipleImagesAction,
  refundCreditsAction,
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
import { Progress } from '@/shared/components/ui/progress';
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

  /**
   * 智能文件解析：自动判断文件大小并选择最优策略
   * - 小文件（≤4.5MB）：直接解析
   * - 大文件（>4.5MB）：先上传到 R2，再从 URL 解析
   */
  const smartParseFile = async (file: File): Promise<string> => {
    const MAX_DIRECT_SIZE = 4.5 * 1024 * 1024; // 4.5MB
    
    if (file.size > MAX_DIRECT_SIZE) {
      console.log(`[Parse] Large file detected (${(file.size / 1024 / 1024).toFixed(2)}MB), uploading to R2 first...`);
      
      // 上传到 R2
      const uploadFormData = new FormData();
      uploadFormData.append('files', file);
      uploadFormData.append('path', 'uploads/documents');
      
      const uploadRes = await fetch('/api/storage/upload-file', {
        method: 'POST',
        body: uploadFormData,
      });
      
      const uploadData = await uploadRes.json();
      if (uploadData.code !== 0 || !uploadData.data?.urls?.[0]) {
        throw new Error(`${t('upload.upload_failed')}: ${uploadData.message || 'Unknown error'}`);
      }
      
      const fileUrl = uploadData.data.urls[0];
      console.log(`[Parse] File uploaded to R2:`, fileUrl);
      
      // 从 URL 解析
      return await parseFileAction({
        fileUrl,
        fileName: file.name,
        fileType: file.type,
      });
    } else {
      // 小文件直接解析
      const formData = new FormData();
      formData.append('file', file);
      return await parseFileAction(formData);
    }
  };
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

  // 进度条状态
  const [progress, setProgress] = useState(0);
  // 进度条定时器引用
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  // 新增：支持批量文件上传（参考 /slides 页面）
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isParsingFiles, setIsParsingFiles] = useState(false);
  const [parsingProgress, setParsingProgress] = useState<string>('');

  // 新增：参考图上传（用于图生图模式）
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string>('');
  const [isUploadingReference, setIsUploadingReference] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);

  // 新的文件上传处理逻辑：支持批量上传任意类型的文件（参考 /slides 页面）
  /**
   * 启动进度条模拟
   * @param duration 预计总耗时（毫秒）
   * @param startValue 起始进度值
   * @param targetValue 目标进度值（不建议设为100，留给完成时跳转）
   */
  const startProgressSimulation = (
    duration: number = 30000,
    startValue: number = 0,
    targetValue: number = 90
  ) => {
    // 先清除旧的定时器
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }

    setProgress(startValue);

    const startTime = Date.now();
    const updateInterval = 100; // 每100ms更新一次

    progressInterval.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      // 使用缓动函数让进度看起来更自然 (ease-out)
      // progress = start + (target - start) * (1 - e^(-5 * elapsed / duration))
      // 这里的公式是一个简单的渐进公式，随着时间推移越来越慢地接近 targetValue
      const ratio = Math.min(elapsed / duration, 1);

      // 简单的线性插值可能不够自然，这里用一个减速曲线
      // 当 ratio=0 时，value=0
      // 当 ratio=1 时，value=1
      // 曲线：1 - (1-x)^2 (ease out quad) 或类似
      // 这里简单点：
      const currentProgress =
        startValue + (targetValue - startValue) * (1 - Math.pow(1 - ratio, 2));

      if (currentProgress >= targetValue) {
        setProgress(targetValue);
        // 不自动清除，保持在 targetValue 等待
      } else {
        setProgress(currentProgress);
      }
    }, updateInterval);
  };

  const stopProgressSimulation = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  };

  /**
   * 处理参考图上传
   * 
   * 非程序员解释：
   * - 用户上传一张图片作为风格参考
   * - 图片会先上传到 R2 存储，获得一个公网可访问的 URL
   * - 后续生成时，会使用 fal-ai/nano-banana-pro/edit 模型（图生图）
   */
  const handleReferenceImageSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 检查文件大小（限制10MB）
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      toast.error(t('errors.reference_image_too_large'));
      return;
    }

    setIsUploadingReference(true);
    setError('');

    try {
      // 上传到 R2 存储
      const formData = new FormData();
      formData.append('files', file);
      formData.append('path', 'uploads/reference-images');

      const uploadRes = await fetch('/api/storage/upload-file', {
        method: 'POST',
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (uploadData.code !== 0 || !uploadData.data?.urls?.[0]) {
        throw new Error(uploadData.message || 'Upload failed');
      }

      const imageUrl = uploadData.data.urls[0];
      console.log('[Reference Image] 上传成功:', imageUrl);

      setReferenceImage(file);
      setReferenceImageUrl(imageUrl);
      toast.success(
        t('upload.reference_image_uploaded', { fileName: file.name })
      );
    } catch (error: any) {
      console.error('Upload reference image failed:', error);
      toast.error(t('upload.upload_failed', { error: error.message }));
      setReferenceImage(null);
      setReferenceImageUrl('');
    } finally {
      setIsUploadingReference(false);
      // 清空输入，允许重复选择相同文件
      if (referenceInputRef.current) {
        referenceInputRef.current.value = '';
      }
    }
  };

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
    setProgress(0); // 重置进度

    try {
      let contentToGenerate = sourceContent;

      // 处理批量文件上传（支持图片、PDF、DOCX等多种类型）
      if (uploadedFiles.length > 0) {
        setIsParsingFiles(true);
        // 解析文件时，给一点虚假进度 (0-10%)
        setProgress(5);
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
              const content = await smartParseFile(file);
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

        // Use smart parsing strategy (auto-detects file size)
        const parsedContent = await smartParseFile(uploadedFile);

        setIsParsingFiles(false);
        setParsingProgress('');

        // 如果用户同时输入了文字，将文件内容和用户输入结合起来
        if (sourceContent.trim()) {
          contentToGenerate = `${sourceContent}\n\n${t('upload.extracted_content_header')}\n${parsedContent}`;
        } else {
          contentToGenerate = parsedContent;
        }
      }

      // 开始生成阶段 - 启动第一阶段进度 (10% -> 90%)
      // 假设请求 API 需要 10-15 秒（如果是同步生成如 FAL）
      // 如果是异步，这个请求会很快返回，然后我们会跳转进度
      startProgressSimulation(90000, 10, 90);

      // 使用带托底的新API
      // 如果有参考图，将使用 fal-ai/nano-banana-pro/edit 模型（图生图）
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
          referenceImageUrl: referenceImageUrl || undefined, // 参考图URL（可选）
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
        // 成功！直接冲到 100%
        stopProgressSimulation();
        setProgress(100);

        setImageUrls(data.imageUrls);
        setIsGenerating(false);
        return;
      }

      // 否则开始轮询查询任务结果（异步API如KIE/Novita）
      // 进入第二阶段进度 (90% -> 99%)
      // KIE 生成可能需要 1-3 分钟，我们设定一个较慢的增长
      startProgressSimulation(60000, 90, 99);

      await pollInfographicResult(data.taskId, data.provider);
    } catch (err: any) {
      console.error('Generate infographic error:', err);
      setError(err instanceof Error ? err.message : t('errors.unknown'));
      stopProgressSimulation();
      setProgress(0);
    } finally {
      setIsGenerating(false);
      setIsParsingFiles(false);
      setParsingProgress('');
      // 确保清除定时器
      stopProgressSimulation();
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
    // KIE 生成 2K/4K 图片可能需要较长时间（200-300秒），因此大大延长轮询时间
    // 3秒/次 * 120次 = 360秒 (6分钟)
    const maxAttempts = 120;
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
          // 成功！冲刺到 100%
          setProgress(100);
          setImageUrls(urls);
          return;
        }

        if (status === 'FAILED') {
          // 🎯 修复：任务失败时自动退还积分
          const costPerInfographic = resolution === '4K' ? 12 : 6;
          console.log(
            `💰 信息图生成失败，尝试退还 ${costPerInfographic} 积分...`
          );
          try {
            await refundCreditsAction({
              credits: costPerInfographic,
              description: `信息图生成失败退还积分`,
            });
            toast.info(
              `生成失败，已自动退还 ${costPerInfographic} 积分`
            );
          } catch (refundError) {
            console.error(
              'Failed to refund credits for failed infographic:',
              refundError
            );
          }
          throw new Error(t('errors.generation_failed'));
        }
      } catch (err) {
        // 🎯 优化：如果是网络超时或临时错误，不要立即停止轮询，而是继续尝试
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isNetworkError = 
          errorMessage.includes('fetch') || 
          errorMessage.includes('NetworkError') || 
          errorMessage.includes('timeout') ||
          errorMessage.includes('Failed to fetch');

        if (isNetworkError && attempt < maxAttempts - 1) {
          console.warn(`[Poll] 轮询遇到网络波动 (${errorMessage})，${attempt + 1}/${maxAttempts} 次尝试，继续轮询...`);
          // 不 return，继续下一次循环
        } else {
          console.error('Poll infographic result error:', err);
          setError(err instanceof Error ? err.message : t('errors.poll_failed'));
          return;
        }
      }

      // 等待一段时间再继续下一次查询
      // 如果等待时间较长（超过20次，即1分钟），稍微减慢轮询频率到5秒
      const waitTime = attempt > 20 ? 5000 : 3000;
      await delay(waitTime);
    }

    // 🎯 修复：轮询超时时自动退还积分
    const costPerInfographic = resolution === '4K' ? 12 : 6;
    console.log(
      `💰 信息图生成超时，尝试退还 ${costPerInfographic} 积分...`
    );
    try {
      await refundCreditsAction({
        credits: costPerInfographic,
        description: `信息图生成超时退还积分`,
      });
      toast.info(
        `生成超时，已自动退还 ${costPerInfographic} 积分`
      );
    } catch (refundError) {
      console.error(
        'Failed to refund credits for timed out infographic:',
        refundError
      );
    }

    setError(
      t('errors.timeout', {
        defaultMessage:
          'Generation timed out. The model is taking longer than expected. Please check "My Generations" later.',
      })
    );
  };

  return (
    <div className="via-primary/5 min-h-screen bg-gradient-to-b from-background to-muted dark:from-gray-950 dark:to-gray-950">
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
              <p className="mx-auto max-w-3xl text-lg text-muted-foreground dark:text-gray-300 md:text-xl">
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
              className="border-primary/20 rounded-2xl border bg-background dark:bg-gray-900/60 p-6 backdrop-blur-sm"
            >
              <h2 className="mb-4 text-xl font-semibold text-foreground dark:text-white">
                {t('form.input_title')}
              </h2>

              {/* 文件上传 */}
              <div className="mb-4 space-y-3">
                {/* 内容文件上传 */}
                <div className="flex flex-wrap items-center gap-3">
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
                  <span className="text-xs text-muted-foreground dark:text-gray-400">
                    {t('upload.hint_batch')}
                  </span>
                </div>

                {/* 参考图上传（新功能）*/}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={referenceInputRef}
                    id="infographic-reference-input"
                    type="file"
                    accept="image/*,.jpg,.jpeg,.png,.webp"
                    onChange={handleReferenceImageSelect}
                    className="hidden"
                  />
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    disabled={isUploadingReference || isGenerating || isParsingFiles}
                    className="border-primary/40 text-primary/80 hover:border-primary/70"
                  >
                    <label
                      htmlFor="infographic-reference-input"
                      className="flex cursor-pointer items-center"
                    >
                      {isUploadingReference ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('upload.loading')}
                        </>
                      ) : (
                        <>
                          <FileImage className="mr-2 h-4 w-4" />
                          {t('upload.button_label_reference')}
                        </>
                      )}
                    </label>
                  </Button>
                  <span className="text-xs text-muted-foreground dark:text-gray-400">
                    {t('upload.hint_reference')}
                  </span>
                </div>
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
                      <FileText className="h-4 w-4 text-muted-foreground dark:text-gray-500" />
                    )}
                    <span className="text-sm font-medium text-foreground dark:text-white">
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
                      <span className="text-sm font-medium text-foreground dark:text-white">
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
                        <span className="text-muted-foreground dark:text-gray-300 text-xs">
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

              {/* 参考图预览 */}
              {referenceImage && referenceImageUrl && (
                <div className="bg-primary/5 border-primary/30 mb-3 rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileImage className="text-primary h-4 w-4" />
                      <span className="text-sm font-medium text-foreground dark:text-white">
                        {t('upload.reference_image_uploaded', {
                          fileName: referenceImage.name,
                        })}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setReferenceImage(null);
                        setReferenceImageUrl('');
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={referenceImageUrl}
                    alt="Reference"
                    className="h-auto w-full max-w-[200px] rounded-lg border object-contain"
                  />
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
                className="focus:border-primary mb-4 h-60 w-full resize-none rounded-lg border border-border dark:border-gray-600 bg-background/60 dark:bg-gray-800/60 p-4 text-sm text-foreground dark:text-white placeholder-muted-foreground dark:placeholder-gray-400 focus:outline-none"
              />

              {/* 参数设置：宽高比 / 分辨率 / 格式 */}
              <div className="mb-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-medium text-foreground/70 dark:text-gray-300">
                    {t('form.aspect_ratio_label')}
                  </label>
                  <select
                    value={aspectRatio}
                    onChange={(e) =>
                      setAspectRatio(e.target.value as AspectRatioOption)
                    }
                    className="focus:border-primary w-full rounded-lg border border-border dark:border-gray-600 bg-background/60 dark:bg-gray-800/60 p-2 text-xs text-foreground dark:text-white focus:outline-none"
                  >
                    {ASPECT_RATIO_OPTIONS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-foreground/70 dark:text-gray-300">
                    {t('form.resolution_label')}
                  </label>
                  <select
                    value={resolution}
                    onChange={(e) =>
                      setResolution(e.target.value as '1K' | '2K' | '4K')
                    }
                    className="focus:border-primary w-full rounded-lg border border-border dark:border-gray-600 bg-background/60 dark:bg-gray-800/60 p-2 text-xs text-foreground dark:text-white focus:outline-none"
                  >
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-foreground/70 dark:text-gray-300">
                    {t('form.format_label')}
                  </label>
                  <select
                    value={outputFormat}
                    onChange={(e) =>
                      setOutputFormat(e.target.value as 'png' | 'jpg')
                    }
                    className="focus:border-primary w-full rounded-lg border border-border dark:border-gray-600 bg-background/60 dark:bg-gray-800/60 p-2 text-xs text-foreground dark:text-white focus:outline-none"
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
                    setReferenceImage(null);
                    setReferenceImageUrl('');
                  }}
                  variant="outline"
                  className="border-border dark:border-gray-600 text-foreground/70 dark:text-gray-300 hover:border-foreground/50 dark:hover:border-gray-500"
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
              className="border-primary/20 rounded-2xl border bg-background dark:bg-gray-900/60 p-6 backdrop-blur-sm"
            >
              <h2 className="mb-4 text-xl font-semibold text-foreground dark:text-white">
                {t('result.title')}
              </h2>

              {!taskId && imageUrls.length === 0 && !error && !isGenerating && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-sm text-muted-foreground dark:text-gray-400">
                  <FileImage className="text-primary h-10 w-10" />
                  <p>{t('result.empty_desc')}</p>
                  <p className="text-xs text-gray-500">
                    {t('result.empty_hint')}
                  </p>
                </div>
              )}

              {isGenerating && (
                <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
                  <div className="relative">
                    <Loader2 className="text-primary h-12 w-12 animate-spin" />
                    <div className="bg-primary absolute top-1/2 left-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 blur-xl"></div>
                  </div>

                  <div className="w-full max-w-xs space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground dark:text-gray-400">
                      <span>{t('result.generating')}</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <p className="animate-pulse text-xs text-gray-500">
                      {progress < 30
                        ? t('result.status_preparing')
                        : progress < 60
                          ? t('result.status_drawing')
                          : t('result.status_refining')}
                    </p>
                  </div>
                </div>
              )}

              {!isGenerating && imageUrls.length > 0 && (
                <div className="space-y-4">
                  {imageUrls.map((url, idx) => (
                    <div
                      key={idx}
                      className="border-primary/30 overflow-hidden rounded-xl border bg-muted/80 dark:bg-gray-900/80"
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
                        onError={(e) => {
                          // 图片加载失败时显示占位图或重试
                          console.error('Image load failed:', url);
                          const img = e.currentTarget;
                          img.style.display = 'none'; // 临时隐藏
                          // 可以添加重试逻辑或显示错误占位符
                          toast.error(
                            t('errors.image_load_failed', {
                              defaultMessage: 'Failed to load image',
                            })
                          );
                        }}
                        onLoad={() => {
                          console.log('Image loaded successfully:', url);
                        }}
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
          className="border-primary/30 max-h-[95vh] max-w-[95vw] bg-background dark:bg-gray-900/95 p-0"
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
