'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getInfographicTaskByIdAction,
  InfographicHistoryEntry,
  updateInfographicHistoryAction,
} from '@/app/actions/ai_task';
import {
  parseFileAction,
  parseMultipleImagesAction,
  refundCreditsAction,
} from '@/app/actions/aippt';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Download,
  FileImage,
  FileText,
  Images,
  Loader2,
  Pencil,
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

import { InfographicEditDialog } from './infographic-edit-dialog';

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

type StylePresetId =
  | 'adaptive_smart'
  | 'hand_drawn_infographic'
  | 'isometric_thick_line_macaron'
  | 'minimal_line_storytelling_compare'
  | 'flat_vector_education'
  | 'flat_design_modern';

type AdaptiveStyleIntensity = 'balanced' | 'artistic' | 'signature';

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

const STYLE_PRESET_OPTIONS: StylePresetId[] = [
  'adaptive_smart',
  'hand_drawn_infographic',
  'isometric_thick_line_macaron',
  'minimal_line_storytelling_compare',
  'flat_vector_education',
  'flat_design_modern',
];

const ADAPTIVE_STYLE_INTENSITY_OPTIONS: AdaptiveStyleIntensity[] = [
  'balanced',
  'artistic',
  'signature',
];

function normalizeStylePreset(value: unknown): StylePresetId {
  if (
    value === 'adaptive_smart' ||
    value === 'hand_drawn_infographic' ||
    value === 'isometric_thick_line_macaron' ||
    value === 'minimal_line_storytelling_compare' ||
    value === 'flat_vector_education' ||
    value === 'flat_design_modern'
  ) {
    return value;
  }
  return 'adaptive_smart';
}

function normalizeAdaptiveIntensity(value: unknown): AdaptiveStyleIntensity {
  if (value === 'balanced' || value === 'artistic' || value === 'signature') {
    return value;
  }
  return 'balanced';
}

const STYLE_PRESET_PREVIEW_CLASS: Record<
  StylePresetId,
  {
    card: string;
    line: string;
    dot: string;
  }
> = {
  adaptive_smart: {
    card: 'bg-gradient-to-br from-fuchsia-100 via-violet-100 to-cyan-100',
    line: 'bg-violet-800/70',
    dot: 'bg-cyan-500/80',
  },
  hand_drawn_infographic: {
    card: 'bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100',
    line: 'bg-orange-700/70',
    dot: 'bg-rose-500/70',
  },
  isometric_thick_line_macaron: {
    card: 'bg-gradient-to-br from-sky-100 via-pink-50 to-lime-100',
    line: 'bg-slate-900/75',
    dot: 'bg-pink-400/80',
  },
  minimal_line_storytelling_compare: {
    card: 'bg-gradient-to-br from-white via-stone-50 to-emerald-50',
    line: 'bg-zinc-900/80',
    dot: 'bg-emerald-500/80',
  },
  flat_vector_education: {
    card: 'bg-gradient-to-br from-blue-100 via-cyan-50 to-indigo-100',
    line: 'bg-blue-800/75',
    dot: 'bg-cyan-500/80',
  },
  flat_design_modern: {
    card: 'bg-gradient-to-br from-teal-100 via-emerald-50 to-yellow-100',
    line: 'bg-teal-800/75',
    dot: 'bg-yellow-500/80',
  },
};

const STYLE_PRESET_PREVIEW_IMAGE_URLS: Partial<Record<StylePresetId, string>> =
  {
    hand_drawn_infographic:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/hand_drawn_infographic.png',
    isometric_thick_line_macaron:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/isometric_thick_line_macaron.png',
    minimal_line_storytelling_compare:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/minimal_line_storytelling_compare.png',
    flat_vector_education:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/flat_vector_education.png',
    flat_design_modern:
      'https://cdn.studyhacks.ai/infographic/style-presets/v1/flat_design_modern.png',
  };

const InfographicPage = () => {
  const t = useTranslations('infographic');
  const router = useRouter();
  const searchParams = useSearchParams();

  // 编辑模式相关状态
  const editTaskId = searchParams.get('edit');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoadingTask, setIsLoadingTask] = useState(false);
  const [originalTaskId, setOriginalTaskId] = useState<string | null>(null);

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
      console.log(
        `[Parse] Large file detected (${(file.size / 1024 / 1024).toFixed(2)}MB), uploading to R2 first...`
      );

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
        throw new Error(
          `${t('upload.upload_failed')}: ${uploadData.message || 'Unknown error'}`
        );
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
  const [stylePreset, setStylePreset] =
    useState<StylePresetId>('adaptive_smart');
  const [styleIntensity, setStyleIntensity] =
    useState<AdaptiveStyleIntensity>('balanced');
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

  // 🎯 编辑对话框状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);

  // 🎯 数据库记录 ID（用于编辑后保存历史）
  const [dbTaskId, setDbTaskId] = useState<string | null>(null);
  // 🎯 历史记录状态
  const [history, setHistory] = useState<InfographicHistoryEntry[]>([]);
  const [previewPopoverPreset, setPreviewPopoverPreset] =
    useState<StylePresetId | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const previewHoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 加载编辑任务数据
   *
   * 非程序员解释：
   * - 当用户从 Library 点击"编辑"按钮时，URL 会带上 ?edit=<taskId>
   * - 这个 useEffect 会检测到这个参数，然后加载原任务的数据
   * - 加载完成后，会预填充表单（提示词、参数、参考图）
   */
  useEffect(() => {
    if (editTaskId) {
      loadEditTask(editTaskId);
    }
  }, [editTaskId]);

  const loadEditTask = async (taskId: string) => {
    setIsLoadingTask(true);
    setError('');

    try {
      const task = await getInfographicTaskByIdAction(taskId);

      if (!task) {
        toast.error(
          t('errors.task_not_found', {
            defaultMessage: 'Task not found or access denied',
          })
        );
        router.push('/library/infographics');
        return;
      }

      // 进入编辑模式
      setIsEditMode(true);
      setOriginalTaskId(taskId);

      // 预填充提示词
      if (task.prompt) {
        setSourceContent(task.prompt);
      }

      // 预填充参数
      if (task.options) {
        try {
          const options = JSON.parse(task.options);
          if (options.aspectRatio) {
            setAspectRatio(options.aspectRatio as AspectRatioOption);
          }
          if (options.resolution) {
            setResolution(options.resolution as '1K' | '2K' | '4K');
          }
          if (options.outputFormat) {
            setOutputFormat(options.outputFormat as 'png' | 'jpg');
          }
          if (options.stylePreset) {
            setStylePreset(normalizeStylePreset(options.stylePreset));
          }
          if (options.styleIntensity) {
            setStyleIntensity(
              normalizeAdaptiveIntensity(options.styleIntensity)
            );
          }
        } catch (e) {
          console.warn('Failed to parse task options:', e);
        }
      }

      // 设置原图为参考图（用于图生图编辑）
      if (task.taskResult) {
        try {
          const result = JSON.parse(task.taskResult);
          if (result.imageUrls?.[0]) {
            setReferenceImageUrl(result.imageUrls[0]);
            // 创建一个虚拟的 File 对象用于显示（实际上传时使用 URL）
            setReferenceImage(
              new File([], 'original-image.png', { type: 'image/png' })
            );
          }
        } catch (e) {
          console.warn('Failed to parse task result:', e);
        }
      }

      toast.success(
        t('edit.loaded', {
          defaultMessage: 'Original infographic loaded for editing',
        })
      );
    } catch (error: any) {
      console.error('Failed to load edit task:', error);
      toast.error(
        t('errors.load_failed', { defaultMessage: 'Failed to load task' })
      );
    } finally {
      setIsLoadingTask(false);
    }
  };

  /**
   * 退出编辑模式，返回 Library
   */
  const handleCancelEdit = () => {
    router.push('/library/infographics');
  };

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

  const handleStylePreviewEnter = (presetId: StylePresetId) => {
    if (previewHoverTimerRef.current) {
      clearTimeout(previewHoverTimerRef.current);
    }

    previewHoverTimerRef.current = setTimeout(() => {
      setPreviewPopoverPreset(presetId);
    }, 2000);
  };

  const handleStylePreviewLeave = () => {
    if (previewHoverTimerRef.current) {
      clearTimeout(previewHoverTimerRef.current);
      previewHoverTimerRef.current = null;
    }

    setPreviewPopoverPreset(null);
  };

  const renderPresetPreviewPlaceholder = (
    presetId: StylePresetId,
    enlarged = false
  ) => {
    const preview = STYLE_PRESET_PREVIEW_CLASS[presetId];

    if (presetId === 'adaptive_smart') {
      return (
        <>
          <div className="absolute inset-0 bg-white dark:bg-slate-950" />
          <div className="bg-primary/12 absolute inset-x-3 top-3 h-px" />
          <div className="bg-primary/10 absolute inset-x-3 bottom-3 h-px" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.1),_transparent_56%)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`text-primary [font-family:var(--font-sans)] leading-none font-black uppercase ${
                enlarged
                  ? 'pl-[0.18em] text-[5rem] tracking-[0.18em]'
                  : 'pl-[0.14em] text-[2.6rem] tracking-[0.14em]'
              }`}
            >
              AI
            </span>
          </div>
        </>
      );
    }

    return (
      <>
        <div
          className={`absolute top-2 left-2 h-1 w-10 rounded ${preview.line}`}
        />
        <div
          className={`absolute top-5 left-2 h-1 w-14 rounded ${preview.line}`}
        />
        <div
          className={`absolute right-2 bottom-2 h-3 w-3 rounded-full ${preview.dot}`}
        />
        <div
          className={`text-foreground/80 absolute inset-0 flex items-center justify-center font-semibold dark:text-white/80 ${
            enlarged ? 'text-base' : 'text-[11px]'
          }`}
        >
          AI
        </div>
      </>
    );
  };

  useEffect(() => {
    return () => {
      if (previewHoverTimerRef.current) {
        clearTimeout(previewHoverTimerRef.current);
      }
    };
  }, []);

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
          stylePreset,
          styleIntensity,
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
      // 🎯 保存数据库记录 ID，用于编辑后保存历史
      setDbTaskId(data.dbTaskId || null);

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
          // 🎯 保存数据库记录 ID，用于编辑后保存历史
          if (data.dbTaskId) {
            setDbTaskId(data.dbTaskId);
          }
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
            toast.info(`生成失败，已自动退还 ${costPerInfographic} 积分`);
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
          console.warn(
            `[Poll] 轮询遇到网络波动 (${errorMessage})，${attempt + 1}/${maxAttempts} 次尝试，继续轮询...`
          );
          // 不 return，继续下一次循环
        } else {
          console.error('Poll infographic result error:', err);
          setError(
            err instanceof Error ? err.message : t('errors.poll_failed')
          );
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
    console.log(`💰 信息图生成超时，尝试退还 ${costPerInfographic} 积分...`);
    try {
      await refundCreditsAction({
        credits: costPerInfographic,
        description: `信息图生成超时退还积分`,
      });
      toast.info(`生成超时，已自动退还 ${costPerInfographic} 积分`);
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
    <div className="via-primary/5 from-background to-muted min-h-screen bg-gradient-to-b dark:from-gray-950 dark:to-gray-950">
      {/* 背景装饰：改为统一的 primary 光晕，移除额外的蓝色主色块 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />
        <div className="bg-primary/5 absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-24">
        <ScrollAnimation>
          <div className="mb-12 text-center">
            {/* 编辑模式：显示返回按钮 */}
            {isEditMode && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-4 flex justify-center"
              >
                <Button
                  variant="ghost"
                  onClick={handleCancelEdit}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('edit.back_to_library', {
                    defaultMessage: 'Back to Library',
                  })}
                </Button>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              {/* 标题渐变：白色 → primary，而不是白色 → 蓝色 */}
              <h1 className="via-primary/80 to-primary/60 mb-6 bg-gradient-to-r from-white bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {isEditMode
                  ? t('edit.title', { defaultMessage: 'Edit Infographic' })
                  : t('title', { defaultMessage: 'AI 学习信息图生成器' })}
              </h1>
              <p className="text-muted-foreground mx-auto max-w-3xl text-lg md:text-xl dark:text-gray-300">
                {isEditMode
                  ? t('edit.subtitle', {
                      defaultMessage:
                        'Modify the prompt and regenerate your infographic.',
                    })
                  : t('subtitle', {
                      defaultMessage:
                        '上传课件 / 笔记 / 文本，让 AI 自动为你生成扁平风格的学习信息图。',
                    })}
              </p>
            </motion.div>
          </div>
        </ScrollAnimation>

        {/* 加载中状态 */}
        {isLoadingTask && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="text-primary h-8 w-8 animate-spin" />
            <span className="text-muted-foreground ml-3">
              {t('edit.loading', {
                defaultMessage: 'Loading original infographic...',
              })}
            </span>
          </div>
        )}

        {!isLoadingTask && (
          <ScrollAnimation delay={0.2}>
            <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              {/* 左侧：输入区域 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="border-primary/20 bg-background rounded-2xl border p-6 backdrop-blur-sm dark:bg-gray-900/60"
              >
                <h2 className="text-foreground mb-4 text-xl font-semibold dark:text-white">
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
                    <span className="text-muted-foreground text-xs dark:text-gray-400">
                      {t('upload.hint_batch')}
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
                        <FileText className="text-muted-foreground h-4 w-4 dark:text-gray-500" />
                      )}
                      <span className="text-foreground text-sm font-medium dark:text-white">
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
                        <span className="text-foreground text-sm font-medium dark:text-white">
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
                          <span className="text-muted-foreground text-xs dark:text-gray-300">
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
                  className="focus:border-primary border-border bg-background/60 text-foreground placeholder-muted-foreground mb-4 h-60 w-full resize-none rounded-lg border p-4 text-sm focus:outline-none dark:border-gray-600 dark:bg-gray-800/60 dark:text-white dark:placeholder-gray-400"
                />

                {/* 参数设置：宽高比 / 分辨率 / 格式 / 参考图 */}
                <div className="mb-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-foreground/70 mb-2 block text-xs font-medium dark:text-gray-300">
                      {t('form.aspect_ratio_label')}
                    </label>
                    <select
                      value={aspectRatio}
                      onChange={(e) =>
                        setAspectRatio(e.target.value as AspectRatioOption)
                      }
                      className="focus:border-primary border-border bg-background/60 text-foreground w-full rounded-lg border p-2 text-xs focus:outline-none dark:border-gray-600 dark:bg-gray-800/60 dark:text-white"
                    >
                      {ASPECT_RATIO_OPTIONS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-foreground/70 mb-2 block text-xs font-medium dark:text-gray-300">
                      {t('form.resolution_label')}
                    </label>
                    <select
                      value={resolution}
                      onChange={(e) =>
                        setResolution(e.target.value as '1K' | '2K' | '4K')
                      }
                      className="focus:border-primary border-border bg-background/60 text-foreground w-full rounded-lg border p-2 text-xs focus:outline-none dark:border-gray-600 dark:bg-gray-800/60 dark:text-white"
                    >
                      <option value="1K">1K</option>
                      <option value="2K">2K</option>
                      <option value="4K">4K</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-foreground/70 mb-2 block text-xs font-medium dark:text-gray-300">
                      {t('form.format_label')}
                    </label>
                    <select
                      value={outputFormat}
                      onChange={(e) =>
                        setOutputFormat(e.target.value as 'png' | 'jpg')
                      }
                      className="focus:border-primary border-border bg-background/60 text-foreground w-full rounded-lg border p-2 text-xs focus:outline-none dark:border-gray-600 dark:bg-gray-800/60 dark:text-white"
                    >
                      <option value="png">PNG</option>
                      <option value="jpg">JPG</option>
                    </select>
                  </div>
                </div>

                {/* 风格设置：预设风格 + 参考图 */}
                <div className="mb-4">
                  <div className="border-primary/20 bg-primary/5 rounded-xl border p-4">
                    <div className="text-primary/90 mb-3 text-xs font-semibold tracking-wide uppercase">
                      {t('style.title')}
                    </div>

                    <div className="mb-4">
                      <div className="mt-1">
                        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                          {STYLE_PRESET_OPTIONS.map((presetId) => {
                            const preview =
                              STYLE_PRESET_PREVIEW_CLASS[presetId];
                            const previewImage =
                              STYLE_PRESET_PREVIEW_IMAGE_URLS[presetId];
                            const selected = stylePreset === presetId;
                            const showPopover =
                              previewPopoverPreset === presetId;
                            return (
                              <button
                                key={presetId}
                                type="button"
                                onClick={() => setStylePreset(presetId)}
                                onMouseEnter={() =>
                                  handleStylePreviewEnter(presetId)
                                }
                                onMouseLeave={handleStylePreviewLeave}
                                onBlur={handleStylePreviewLeave}
                                className={`relative rounded-lg border p-1.5 text-center transition-all ${
                                  selected
                                    ? 'border-primary bg-primary/10 shadow-sm'
                                    : 'border-border bg-background/60 hover:border-primary/40'
                                }`}
                                title={t(`style.presets.${presetId}.name`)}
                              >
                                {showPopover && (
                                  <div className="border-border/70 bg-background/95 pointer-events-none absolute top-0 left-1/2 z-30 w-44 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-2xl border p-2 shadow-2xl backdrop-blur">
                                    <div
                                      className={`relative aspect-[3/4] overflow-hidden rounded-xl ${preview.card}`}
                                    >
                                      {previewImage ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={previewImage}
                                          alt={t(
                                            `style.presets.${presetId}.name`
                                          )}
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        renderPresetPreviewPlaceholder(
                                          presetId,
                                          true
                                        )
                                      )}
                                    </div>
                                  </div>
                                )}
                                <div
                                  className={`relative mb-1.5 aspect-[3/4] overflow-hidden rounded ${preview.card}`}
                                >
                                  {previewImage ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={previewImage}
                                      alt={t(`style.presets.${presetId}.name`)}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    renderPresetPreviewPlaceholder(presetId)
                                  )}
                                </div>
                                <div className="text-foreground/90 line-clamp-2 text-[11px] leading-4 font-medium dark:text-gray-100">
                                  {t(`style.presets.${presetId}.name`)}
                                </div>
                                {selected && (
                                  <div className="text-primary mt-1 text-[9px]">
                                    {t('style.selected')}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-muted-foreground mt-3 text-xs leading-5 dark:text-gray-400">
                          {t(`style.presets.${stylePreset}.description`)}
                        </p>
                      </div>

                      <div className="border-primary/20 bg-background/50 mt-3 rounded-lg border p-3">
                        <label className="text-foreground/70 mb-2 block text-xs font-medium dark:text-gray-300">
                          {t('style.adaptive_intensity_label')}
                        </label>
                        <select
                          value={styleIntensity}
                          onChange={(e) =>
                            setStyleIntensity(
                              e.target.value as AdaptiveStyleIntensity
                            )
                          }
                          disabled={stylePreset !== 'adaptive_smart'}
                          className="focus:border-primary border-border bg-background/70 text-foreground w-full rounded-lg border p-2 text-xs focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800/60 dark:text-white"
                        >
                          {ADAPTIVE_STYLE_INTENSITY_OPTIONS.map((intensity) => (
                            <option key={intensity} value={intensity}>
                              {t(`style.adaptive_intensity.${intensity}.name`)}
                            </option>
                          ))}
                        </select>
                        <p className="text-muted-foreground mt-2 text-xs dark:text-gray-400">
                          {stylePreset === 'adaptive_smart'
                            ? t(
                                `style.adaptive_intensity.${styleIntensity}.description`
                              )
                            : t('style.adaptive_intensity_hint')}
                        </p>
                      </div>
                    </div>

                    <div className="mb-2 flex flex-wrap items-center gap-3">
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
                        disabled={
                          isUploadingReference || isGenerating || isParsingFiles
                        }
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

                      {referenceImage && referenceImageUrl && (
                        <div className="group border-primary/30 bg-muted/50 relative h-9 w-9 overflow-hidden rounded-md border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={referenceImageUrl}
                            alt="Reference Thumbnail"
                            className="h-full w-full cursor-pointer object-cover transition-transform group-hover:scale-110"
                            onClick={() =>
                              setEnlargedImageUrl(referenceImageUrl)
                            }
                            title={t('result.click_to_enlarge')}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReferenceImage(null);
                              setReferenceImageUrl('');
                            }}
                            className="absolute top-0 right-0 rounded-bl-md bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <span className="text-muted-foreground text-xs dark:text-gray-400">
                      {t('upload.hint_reference')}
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                    {error}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-3">
                  {/* 编辑模式下显示取消按钮 */}
                  {isEditMode ? (
                    <Button
                      onClick={handleCancelEdit}
                      variant="outline"
                      className="border-border text-foreground/70 hover:border-foreground/50 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500"
                    >
                      {t('edit.cancel', { defaultMessage: 'Cancel' })}
                    </Button>
                  ) : (
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
                        setStylePreset('adaptive_smart');
                        setStyleIntensity('balanced');
                        // 🎯 清除数据库记录 ID 和历史记录
                        setDbTaskId(null);
                        setHistory([]);
                      }}
                      variant="outline"
                      className="border-border text-foreground/70 hover:border-foreground/50 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500"
                    >
                      {t('actions.clear')}
                    </Button>
                  )}
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
                        {/* 编辑模式固定6积分，普通模式根据分辨率计算 */}
                        <CreditsCost
                          credits={
                            isEditMode ? 6 : resolution === '4K' ? 12 : 6
                          }
                        />
                        {isEditMode
                          ? t('edit.regenerate', {
                              defaultMessage: 'Regenerate',
                            })
                          : t('actions.generate')}
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
                className="border-primary/20 bg-background rounded-2xl border p-6 backdrop-blur-sm dark:bg-gray-900/60"
              >
                <h2 className="text-foreground mb-4 text-xl font-semibold dark:text-white">
                  {t('result.title')}
                </h2>

                {!taskId &&
                  imageUrls.length === 0 &&
                  !error &&
                  !isGenerating && (
                    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-4 text-center text-sm dark:text-gray-400">
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
                      <div className="text-muted-foreground flex justify-between text-xs dark:text-gray-400">
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
                        className="border-primary/30 bg-muted/80 overflow-hidden rounded-xl border dark:bg-gray-900/80"
                      >
                        <div className="border-primary/20 bg-primary/10 flex items-center justify-between border-b px-4 py-2">
                          <span className="text-primary/90 text-xs">
                            {t('result.image_title', { index: idx + 1 })}
                          </span>
                          <div className="flex items-center gap-2">
                            {/* 🎯 编辑按钮：点击后打开编辑对话框 */}
                            <button
                              onClick={() => {
                                setEditingImageUrl(url);
                                setEditDialogOpen(true);
                              }}
                              className="border-primary/40 text-primary/90 hover:border-primary/70 hover:bg-primary/10 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                              {t('edit.button', { defaultMessage: 'Edit' })}
                            </button>
                            <a
                              href={url}
                              download={`infographic-${idx + 1}.png`}
                              className="border-primary/40 text-primary/90 hover:border-primary/70 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                            >
                              <Download className="h-3 w-3" />
                              {t('result.download')}
                            </a>
                          </div>
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
        )}
      </div>

      {/* 🎯 信息图编辑对话框 */}
      {/*
        非程序员解释：
        - 当用户点击编辑按钮时，editDialogOpen 会被设置为 true
        - 这个对话框允许用户框选区域进行局部编辑，或整体重新生成
        - 编辑完成后，新图片会替换原图片，并保存到数据库历史记录
      */}
      {editingImageUrl && (
        <InfographicEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          imageUrl={editingImageUrl}
          aspectRatio={aspectRatio}
          resolution={resolution}
          history={history}
          onEditComplete={async (newImageUrl, editPrompt) => {
            // 编辑完成后，用新图片替换原图片
            setImageUrls((prev) =>
              prev.map((url) => (url === editingImageUrl ? newImageUrl : url))
            );
            setEditingImageUrl(null);
            setEditDialogOpen(false);

            // 🎯 保存编辑结果到数据库历史记录
            if (dbTaskId) {
              try {
                const result = await updateInfographicHistoryAction({
                  taskId: dbTaskId,
                  newImageUrl,
                  editPrompt: editPrompt || '编辑版本',
                });
                if (result.success && result.history) {
                  setHistory(result.history);
                }
                console.log('[Infographic] 编辑历史已保存到数据库');
              } catch (error) {
                console.error('[Infographic] 保存编辑历史失败:', error);
                // 即使保存失败也不影响用户体验，图片已经更新
              }
            }

            toast.success(
              t('edit.success', {
                defaultMessage: 'Infographic updated successfully!',
              })
            );
          }}
          onSwitchVersion={async (entry) => {
            // 🎯 切换历史版本
            setImageUrls([entry.imageUrl]);
            setEditingImageUrl(entry.imageUrl);
          }}
        />
      )}

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
          className="border-primary/30 bg-background max-h-[95vh] max-w-[95vw] p-0 dark:bg-gray-900/95"
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
