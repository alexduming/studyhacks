'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  consumeCreditsAction,
  createKieTaskWithFallbackAction,
  parseFileAction,
  parseLinkContentAction,
  parseMultipleImagesAction,
  queryKieTaskWithFallbackAction,
  refundCreditsAction,
} from '@/app/actions/aippt';
import {
  createPresentationAction,
  getPresentationAction,
  updatePresentationAction,
} from '@/app/actions/presentation';
import { useCompletion } from '@ai-sdk/react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Crop,
  Download,
  Eye,
  FileText,
  History,
  Images,
  Loader2,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import {
  PPT_RATIOS,
  PPT_SIZES,
  SLIDES2_STYLE_PRESETS,
} from '@/config/aippt-slides2';
import { ConsoleLayout } from '@/shared/blocks/console/layout';
import { CreditsCost } from '@/shared/components/ai-elements/credits-display';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Switch } from '@/shared/components/ui/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';
import { Textarea } from '@/shared/components/ui/textarea';
import { useAppContext } from '@/shared/contexts/app';
import { cn } from '@/shared/lib/utils';

type SlideStatus = 'pending' | 'generating' | 'completed' | 'failed';

interface SlideData {
  id: string;
  title: string;
  content: string;
  status: SlideStatus;
  imageUrl?: string;
  provider?: string;
  fallbackUsed?: boolean;
}

interface SlideHistoryEntry {
  id: string;
  imageUrl: string;
  prompt: string;
  createdAt: number;
  provider?: string;
}

interface RegionDefinition {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  note: string;
  imageFile?: File;
  imagePreview?: string;
  uploadedUrl?: string;
}

interface PresentationData {
  id: string;
  title: string;
  content: string | null;
  status: string;
  styleId?: string | null;
  thumbnailUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

interface Slides2ClientProps {
  initialPresentation?: PresentationData | null;
}

const MAX_AUTO_SLIDES = 15;
const REGION_COLORS = ['#01c6b2', '#ff5f5f', '#f6c945', '#8b6cff'];
const AUTO_MODE_PREFIX =
  '你是一位高级视觉设计师，请根据下面文章内容制作一套PPT，你需要Step1：生成 PPT 大纲，将文章合理拆成多页内容（≤15页），【关键要求】：第一页必须是封面页，只包含大标题、副标题和必要的分享人/日期等元信息，设计需极简大气；后续页面每页包含：标题 + 简明要点，信息层级清晰，逻辑自然；Step2：将大纲拆分为独立页 Prompt，一页一张图，不可生成长图、每一页风格保持统一。';

export default function Slides2Client({
  initialPresentation,
}: Slides2ClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presentationId = searchParams.get('id');
  const { data: session } = useSession();
  const { user } = useAppContext();
  const t = useTranslations('library.sidebar');
  const locale = useLocale();

  // 判断是否为会员 (Plus 或 Pro)
  const isVip =
    user?.membership?.level === 'plus' ||
    user?.membership?.level === 'pro' ||
    user?.isAdmin ||
    (session?.user as any)?.roles?.some((role: any) =>
      ['plus', 'pro', 'admin', 'super_admin'].includes(
        String(role.name).toLowerCase()
      )
    );

  const [inputTab, setInputTab] = useState<'text' | 'upload' | 'link'>('text');
  const [pageMode, setPageMode] = useState<'auto' | 'fixed'>('auto');
  const [primaryInput, setPrimaryInput] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [linkPreview, setLinkPreview] = useState('');
  const [slides, setSlides] = useState<SlideData[]>(() => {
    if (initialPresentation?.content) {
      try {
        const parsed = JSON.parse(initialPresentation.content);
        if (Array.isArray(parsed)) {
          // 🎯 鲁棒性增强：修复状态不一致问题。如果已经有图片，状态应该是已完成
          return parsed.map((s: any) => ({
            ...s,
            status:
              s.imageUrl &&
              (s.status === 'pending' || s.status === 'generating')
                ? 'completed'
                : s.status,
          }));
        }
        return parsed;
      } catch (error) {
        console.error('Failed to parse saved presentation', error);
      }
    }
    return [];
  });
  const [slideCount, setSlideCount] = useState('10');
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(
    initialPresentation?.styleId || null
  );
  const [customStylePrompt, setCustomStylePrompt] = useState('');
  const [customImages, setCustomImages] = useState<string[]>([]);
  const [customImageFiles, setCustomImageFiles] = useState<File[]>([]);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('2K');
  const [language, setLanguage] = useState<'auto' | 'zh' | 'en'>('auto');
  const [contentControl, setContentControl] = useState<'expand' | 'strict'>(
    'expand'
  );
  const [innerTitleAlign, setInnerTitleAlign] = useState<'left' | 'center'>(
    'left'
  );
  const [watermarkText, setWatermarkText] = useState('Gen by StudyHacks');
  const [showWatermark, setShowWatermark] = useState(true);
  const [isEnhancedMode, setIsEnhancedMode] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsingFiles, setIsParsingFiles] = useState(false);
  const [parsingProgress, setParsingProgress] = useState('');
  const [isFetchingLink, setIsFetchingLink] = useState(false);
  const [autoPlanning, setAutoPlanning] = useState(false);
  const [historySlideId, setHistorySlideId] = useState<string | null>(null);
  const [slideHistories, setSlideHistories] = useState<
    Record<string, SlideHistoryEntry[]>
  >({});
  const [editingSlide, setEditingSlide] = useState<SlideData | null>(null);
  const [editingPrompt, setEditingPrompt] = useState('');
  const [editRegions, setEditRegions] = useState<RegionDefinition[]>([]);
  const [draftRegion, setDraftRegion] = useState<RegionDefinition | null>(null);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [pendingEditSubmit, setPendingEditSubmit] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const editCanvasRef = useRef<HTMLDivElement>(null);
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);
  const autoSourceRef = useRef<string>('');
  const [presentationRecordId, setPresentationRecordId] = useState<
    string | null
  >(initialPresentation?.id || null);

  const [hoveredStyle, setHoveredStyle] = useState<any | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const {
    complete,
    completion,
    isLoading: isAnalyzing,
    setCompletion,
  } = useCompletion({
    api: '/api/ai/analyze-ppt',
    streamProtocol: 'text',
    body: {
      slideCount: parseInt(slideCount) || 10,
    },
    onFinish: (_prompt, result) => {
      if (!result?.trim()) {
        toast.error('自动分页失败：空响应');
        return;
      }
      try {
        let clean = result
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();
        const first = clean.indexOf('[');
        if (first > -1) clean = clean.slice(first);
        const last = clean.lastIndexOf(']');
        if (last > -1) clean = clean.slice(0, last + 1);
        const parsed = JSON.parse(clean);
        if (!Array.isArray(parsed)) throw new Error('Invalid outline');
        const nextSlides: SlideData[] = parsed.map(
          (item: any, idx: number) => ({
            id: `slide-${Date.now()}-${idx}`,
            title: item.title || `第 ${idx + 1} 页`,
            content: item.content || '',
            status: 'pending',
          })
        );
        setSlides(nextSlides);
        setSlideCount(String(nextSlides.length));
        toast.success('自动分页完成');
      } catch (error: any) {
        console.error('Outline parse error', error);
        toast.error('自动分页结果解析失败：' + error.message);
      }
    },
    onError: (error) => {
      console.error('Outline error', error);
      toast.error('自动分页失败：' + error.message);
    },
  });

  useEffect(() => {
    if (logRef.current) {
      const scrollArea = logRef.current;
      const scrollContainer = scrollArea.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [completion, parsingProgress]);

  useEffect(() => {
    if (initialPresentation && initialPresentation.id === presentationId) {
      return;
    }
    if (presentationId) {
      (async () => {
        try {
          const data = await getPresentationAction(presentationId);
          if (data?.content) {
            const parsed = JSON.parse(data.content);
            const normalized = Array.isArray(parsed)
              ? parsed.map((s: any) => ({
                  ...s,
                  status:
                    s.imageUrl &&
                    (s.status === 'pending' || s.status === 'generating')
                      ? 'completed'
                      : s.status,
                }))
              : parsed;
            setSlides(normalized);
            setPresentationRecordId(data.id);
            if (data.styleId) setSelectedStyleId(data.styleId);
          }
        } catch (error) {
          console.error('Failed to load presentation', error);
          toast.error('加载演示失败，请稍后再试');
        }
      })();
    }
  }, [initialPresentation, presentationId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [completion, parsingProgress]);

  useEffect(() => {
    setIsEnhancedMode(contentControl === 'expand');
  }, [contentControl]);

  useEffect(() => {
    if (editingSlide) {
      setEditingPrompt(editingSlide.content);
      setEditRegions([]);
      setDraftRegion(null);
      setActiveRegionId(null);
    }
  }, [editingSlide]);

  const [viewMode, setViewMode] = useState<'studio' | 'preview'>(
    initialPresentation?.id ? 'preview' : 'studio'
  );
  const [mounted, setMounted] = useState(false);
  const [draggedRegionId, setDraggedRegionId] = useState<string | null>(null);
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleApiError = (error: any) => {
    const message =
      typeof error?.message === 'string'
        ? error.message
        : '操作失败，请稍后重试';
    toast.error(message);
  };

  /**
   * 🎯 下载为 PDF
   */
  const handleDownloadPDF = async () => {
    const completed = slides.filter(
      (slide) => slide.status === 'completed' && slide.imageUrl
    );
    if (completed.length === 0) {
      toast.error('还没有生成好的页面');
      return;
    }

    toast.loading('正在准备 PDF...', { id: 'pdf' });
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [1280, 720], // 16:9 比例
      });

      for (let i = 0; i < completed.length; i++) {
        const slide = completed[i];
        if (i > 0) doc.addPage([1280, 720], 'landscape');

        // 如果开启了水印，且不是 VIP 或主动开启，则添加水印
        let url = slide.imageUrl!;
        if (showWatermark) {
          url = await addWatermarkToImage(url, watermarkText);
        }

        const img = await loadImage(url);
        doc.addImage(img, 'PNG', 0, 0, 1280, 720);
      }

      doc.save(`presentation-${Date.now()}.pdf`);
      toast.success('PDF 下载成功', { id: 'pdf' });
    } catch (error) {
      console.error('PDF export failed', error);
      toast.error('PDF 导出失败', { id: 'pdf' });
    }
  };

  /**
   * 🎯 辅助函数：加载图片
   */
  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  /**
   * 🎯 辅助函数：给图片加水印
   */
  const addWatermarkToImage = async (
    url: string,
    text: string
  ): Promise<string> => {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return url;

    ctx.drawImage(img, 0, 0);

    // 水印样式
    const fontSize = Math.max(20, canvas.width / 40);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 4;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    ctx.fillText(text, canvas.width - 20, canvas.height - 20);

    return canvas.toDataURL('image/png');
  };

  // 🎯 将临时图片链接升级为 R2 永久在线链接，并同步更新数据库
  // 非程序员解释：
  // - 生成后的图片先用临时链接快速展示
  // - 后台把图片保存到 R2，并把数据库里的链接替换为永久链接
  const persistSlideImageToR2 = async (slideId: string, imageUrl: string) => {
    if (!presentationRecordId || !imageUrl) return;
    // 如果已经是永久链接，就不用重复保存
    if (imageUrl.includes('cdn.studyhacks.ai') || imageUrl.includes('r2')) {
      return;
    }
    try {
      await fetch('/api/presentation/replace-slide-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presentationId: presentationRecordId,
          slideId,
          imageUrl,
        }),
      });
    } catch (error) {
      console.warn('持久化到 R2 失败:', error);
    }
  };

  const getRegionLabel = (index: number) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let i = index;
    let label = '';
    do {
      label = alphabet[i % 26] + label;
      i = Math.floor(i / 26) - 1;
    } while (i >= 0);
    return label;
  };

  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 1920;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Compression failed'));
          },
          'image/jpeg',
          0.8
        );
      };
      img.onerror = reject;
    });
  };

  const uploadImageToStorage = async (
    blob: Blob,
    filename: string
  ): Promise<string> => {
    let finalBlob = blob;
    if (blob.size > 1024 * 1024 && blob instanceof File) {
      try {
        finalBlob = await compressImage(blob as File);
        filename = filename.replace(/\.[^/.]+$/, '.jpg');
      } catch (error) {
        console.warn('Image compression failed', error);
      }
    }
    const formData = new FormData();
    formData.append('files', finalBlob, filename);
    const res = await fetch('/api/storage/upload-image', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.message || 'Upload failed');
    return data.data.urls[0] as string;
  };

  const urlToBuffer = async (url: string): Promise<ArrayBuffer> => {
    const fetchBuffer = async (target: string) => {
      const res = await fetch(target);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    };
    if (url.startsWith('/') || url.startsWith(window.location.origin)) {
      return fetchBuffer(url);
    }
    try {
      return await fetchBuffer(
        `/api/storage/proxy-image?url=${encodeURIComponent(url)}`
      );
    } catch {
      return fetchBuffer(url);
    }
  };

  const triggerDownload = async (url: string, filename: string) => {
    try {
      let downloadUrl = url;
      // 🎯 如果开启水印，在下载单张图片时也加上
      if (showWatermark) {
        downloadUrl = await addWatermarkToImage(url, watermarkText);
      }
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Download failed', error);
    }
  };

  const appendHistory = (slideId: string, entry: SlideHistoryEntry) => {
    setSlideHistories((prev) => {
      const list = prev[slideId] || [];
      return {
        ...prev,
        [slideId]: [entry, ...list].slice(0, 20),
      };
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const gatherAllInputContent = async (): Promise<string> => {
    let combined = primaryInput.trim();
    if (inputTab === 'link') {
      if (!primaryInput.trim()) {
        throw new Error('请先粘贴要解析的链接');
      }
      setIsFetchingLink(true);
      try {
        combined = await parseLinkContentAction(primaryInput.trim());
        setLinkPreview(combined.slice(0, 100)); // Ensure it's truncated to 100 chars
      } finally {
        setIsFetchingLink(false);
      }
      return combined;
    }
    if (uploadedFiles.length > 0) {
      setIsParsingFiles(true);
      try {
        const allImages = uploadedFiles.every((file) =>
          file.type.startsWith('image/')
        );
        let parsed = '';
        if (allImages) {
          setParsingProgress(`正在识别 ${uploadedFiles.length} 张图片...`);
          const formData = new FormData();
          uploadedFiles.forEach((file) => formData.append('files', file));
          parsed = await parseMultipleImagesAction(formData);
        } else {
          const parts: string[] = [];
          for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            setParsingProgress(
              `解析 ${file.name} (${i + 1}/${uploadedFiles.length})`
            );
            const formData = new FormData();
            formData.append('file', file);
            const text = await parseFileAction(formData);
            parts.push(text);
          }
          parsed = parts.join('\n\n');
        }
        combined = combined ? `${combined}\n\n${parsed}` : parsed;
      } finally {
        setParsingProgress('');
        setIsParsingFiles(false);
      }
    }
    if (!combined.trim()) {
      throw new Error('请先输入内容或上传素材');
    }
    return combined.trim();
  };

  const buildAutoSlidesFromContent = (content: string): SlideData[] => {
    const paragraphs = content
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) {
      return Array.from({ length: 6 }).map((_, idx) => ({
        id: `auto-${Date.now()}-${idx}`,
        title: `第 ${idx + 1} 页`,
        content: '自动模式',
        status: 'pending',
      }));
    }
    const chunkSize = Math.ceil(
      paragraphs.length / Math.min(MAX_AUTO_SLIDES, paragraphs.length)
    );
    const slides: SlideData[] = [];
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      const chunk = paragraphs.slice(i, i + chunkSize);
      const title = chunk[0]?.slice(0, 24) || `第 ${slides.length + 1} 页`;
      slides.push({
        id: `auto-${Date.now()}-${i}`,
        title,
        content: chunk.join('\n'),
        status: 'pending',
      });
      if (slides.length >= MAX_AUTO_SLIDES) break;
    }
    return slides;
  };

  const buildStyleInstruction = () => {
    if (selectedStyleId) {
      const preset = SLIDES2_STYLE_PRESETS.find(
        (style) => style.id === selectedStyleId
      );
      if (preset) {
        // 🎯 响应用户优化：不再拼接标题和副标题，直接使用简化的 prompt
        return preset.prompt;
      }
    }
    if (customStylePrompt.trim()) {
      return `Custom style direction: ${customStylePrompt.trim()}`;
    }
    return '你是一位专家级UI、UX演示设计师，请采用专业、信息密集的PPT视觉系统，并保持一致的排版。';
  };

  const buildRegionInstructions = (regions?: RegionDefinition[]) => {
    if (!regions?.length) return null;
    return regions
      .map((region) => {
        const note = region.note || '请根据整体语境细化画面';
        const imageLine = region.uploadedUrl
          ? `参考图像：${region.uploadedUrl}`
          : '';
        return `区域 ${region.label}: ${note}${
          imageLine ? `\n${imageLine}` : ''
        }`;
      })
      .join('\n');
  };

  const buildSlidePrompt = (
    slide: SlideData,
    options?: {
      overrideContent?: string;
      regions?: RegionDefinition[];
      sourceContent?: string;
      index?: number;
      total?: number;
    }
  ) => {
    const baseContent = options?.overrideContent?.trim() || slide.content;
    const languageInstruction =
      language === 'auto'
        ? 'Keep the same language as the outline.'
        : language === 'zh'
          ? 'Output all copy in Simplified Chinese.'
          : 'Output all copy in English.';
    const contentControlInstruction =
      contentControl === 'expand'
        ? 'Intelligently expand bullet points and refine layout for better storytelling.'
        : 'Strictly follow the provided outline without inventing new facts.';
    const regionInstruction = buildRegionInstructions(options?.regions);

    return [
      options?.sourceContent
        ? `${AUTO_MODE_PREFIX}\n\n文章内容:\n${options.sourceContent}`
        : null,
      options?.index !== undefined && options?.total !== undefined
        ? `当前渲染第 ${options.index + 1}/${options.total} 页，需确保整体视觉一致。`
        : null,
      `Slide Title: "${slide.title}"`,
      `Key Content:\n${baseContent}`,
      languageInstruction,
      contentControlInstruction,
      `Inner title alignment: ${innerTitleAlign.toUpperCase()}.`,
      // ⚠️ 移除 AI 生成水印，改为由前端代码添加
      'DO NOT include any visible watermarks or brand text in the generated image. The final watermark will be applied externally.',
      regionInstruction ? `局部调整指令:\n${regionInstruction}` : null,
      buildStyleInstruction(),
    ]
      .filter(Boolean)
      .join('\n\n');
  };

  const generateSlide = async (
    slide: SlideData,
    options?: {
      overrideContent?: string;
      regions?: RegionDefinition[];
      cachedStyleImages?: string[];
      sourceContent?: string;
      index?: number;
      total?: number;
      /** 🎯 锚定图片URL：用于保持视觉一致性 */
      anchorImageUrl?: string;
    }
  ) => {
    const styleImages =
      options?.cachedStyleImages ??
      (selectedStyleId
        ? []
        : await Promise.all(
            customImageFiles.map((file) =>
              uploadImageToStorage(file, file.name)
            )
          ).catch(() => []));

    let regionPayload = options?.regions;
    if (regionPayload?.length) {
      // Upload region images sequentially
      const updatedRegions: RegionDefinition[] = [];
      for (const region of regionPayload) {
        if (region.imageFile && !region.uploadedUrl) {
          try {
            const uploadedUrl = await uploadImageToStorage(
              region.imageFile,
              region.imageFile.name
            );
            updatedRegions.push({ ...region, uploadedUrl });
          } catch (error) {
            console.error('Failed to upload region image', region.id, error);
            updatedRegions.push(region);
          }
        } else {
          updatedRegions.push(region);
        }
      }
      regionPayload = updatedRegions;
    }

    const prompt = buildSlidePrompt(slide, {
      overrideContent: options?.overrideContent,
      regions: regionPayload,
      sourceContent: options?.sourceContent,
      index: options?.index,
      total: options?.total,
    });

    const task = await createKieTaskWithFallbackAction({
      prompt,
      styleId: selectedStyleId || undefined,
      customImages: styleImages,
      aspectRatio,
      imageSize: resolution,
      preferredProvider: 'FAL',
      isEnhancedMode,
      outputLanguage: language,
      refundCredits: resolution === '4K' ? 12 : 6,
      // 🎯 关键：传递Deck上下文以保持一致性
      deckContext:
        options?.index !== undefined && options?.total !== undefined
          ? {
              currentSlide: options.index + 1, // 从1开始计数
              totalSlides: options.total,
              anchorImageUrl: options.anchorImageUrl,
            }
          : undefined,
    });

    // 类型安全地获取imageUrl
    let imageUrl = 'imageUrl' in task ? task.imageUrl : undefined;
    if (!imageUrl) {
      const result = await pollTask(task.task_id!, task.provider);
      imageUrl = result;
    }

    if (!imageUrl) {
      throw new Error('生成超时，请重试当前页面');
    }

    setSlides((prev) =>
      prev.map((s) =>
        s.id === slide.id
          ? {
              ...s,
              imageUrl,
              status: 'completed',
              provider: task.provider,
              fallbackUsed: task.fallbackUsed,
            }
          : s
      )
    );
    appendHistory(slide.id, {
      id: `${slide.id}-${Date.now()}`,
      imageUrl,
      prompt,
      createdAt: Date.now(),
      provider: task.provider,
    });

    // 🎯 异步持久化到 R2（不阻塞 UI）
    // 非程序员解释：先给用户看到结果，再悄悄把图片存到我们自己的永久仓库
    void persistSlideImageToR2(slide.id, imageUrl);

    return imageUrl;
  };

  const pollTask = async (taskId: string, provider?: string) => {
    const maxAttempts = 33;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const status = await queryKieTaskWithFallbackAction(taskId, provider);
      if (status.data?.status === 'FAILED') break;
      if (status.data?.results?.length) {
        return status.data.results[0];
      }
    }
    throw new Error('生成超时');
  };

  /**
   * 调用 analyze-ppt API 让AI决定分页数和每页内容
   * 非程序员解释：
   * - 这个函数会调用AI分析接口，让AI根据内容智能决定应该分成几页
   * - 返回AI分析后的分页结果（每页的标题和内容）
   */
  const analyzeContentForPagination = async (
    content: string,
    preferredSlideCount?: number
  ): Promise<SlideData[]> => {
    try {
      // 调用 analyze-ppt API，不使用流式，直接等待完整结果
      const response = await fetch('/api/ai/analyze-ppt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: content,
          slideCount: preferredSlideCount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `分析失败：HTTP ${response.status}`);
      }

      // 读取流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }

      // 解析JSON结果
      let clean = result
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const first = clean.indexOf('[');
      if (first > -1) clean = clean.slice(first);
      const last = clean.lastIndexOf(']');
      if (last > -1) clean = clean.slice(0, last + 1);

      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) {
        throw new Error('AI返回的分页结果格式不正确');
      }

      // 转换为 SlideData 格式
      return parsed.map((item: any, idx: number) => ({
        id: `slide-${Date.now()}-${idx}`,
        title: item.title || `第 ${idx + 1} 页`,
        content: item.content || '',
        status: 'pending',
      }));
    } catch (error: any) {
      console.error('分析内容分页失败:', error);
      throw error;
    }
  };

  const handleAutoPaginate = async () => {
    try {
      setSlides([]);
      setCompletion('');
      const payload = await gatherAllInputContent();
      // 🚀 触发流式分页分析
      complete(payload, {
        body: {
          slideCount:
            pageMode === 'fixed' ? parseInt(slideCount) || 10 : undefined,
        },
      });
    } catch (error) {
      handleApiError(error);
    }
  };

  const handleStartGeneration = async () => {
    // 🚀 立即设置生成状态，提升 UI 响应速度，防止重复点击
    setIsGenerating(true);
    try {
      // 🎯 修复：无论什么模式，生成前必须先有大纲
      if (slides.length === 0) {
        toast.error('请先执行第一步：开始分页');
        return;
      }

      // 1. 检查积分 & 扣除 (自动模式将在生成后扣除)
      const costPerSlide = resolution === '4K' ? 12 : 6;
      let totalCost = slides.length * costPerSlide;

      try {
        await consumeCreditsAction({
          credits: totalCost,
          description: `生成 ${slides.length} 页 PPT`,
        });
      } catch (err: any) {
        if (err.message.includes('Insufficient credits')) {
          toast.error('积分不足，请充值');
          return;
        }
        throw err;
      }

      let workingSlides: SlideData[] = [...slides];

      let recordId = presentationRecordId;
      if (!recordId) {
        const record = await createPresentationAction({
          title: workingSlides[0]?.title || 'AI Slides',
          content: JSON.stringify(workingSlides),
          status: 'generating',
          styleId: selectedStyleId || 'custom',
        });
        recordId = record.id;
        setPresentationRecordId(record.id);
      }

      const sharedStyleImages = [];

      // 🎯 核心优化：如果选择了内置风格，自动提取该风格的参考图
      if (selectedStyleId) {
        const style = SLIDES2_STYLE_PRESETS.find(
          (s) => s.id === selectedStyleId
        );
        if (style?.refs && style.refs.length > 0) {
          sharedStyleImages.push(...style.refs);
          console.log(
            `[风格库] 已自动添加风格「${style.title}」的参考图:`,
            style.refs
          );
        }
      }

      if (customImageFiles.length > 0) {
        // Upload images sequentially to R2 to ensure stability
        for (const file of customImageFiles) {
          try {
            const url = await uploadImageToStorage(file, file.name);
            sharedStyleImages.push(url);
          } catch (error) {
            console.error(
              'Failed to upload custom style image to R2',
              file.name,
              error
            );
          }
        }
      }

      // ============================================================
      // 🎯 一致性锚定机制 (Consistency Anchoring)
      // ============================================================
      // 策略：记录第二张（第一张内页）成功生成的图片URL，传递给后续内页生成
      // 第一页（封面）不作为锚定源
      // ============================================================
      let anchorImageUrl: string | undefined;

      let successCount = 0;

      for (let i = 0; i < workingSlides.length; i++) {
        const slide = workingSlides[i];
        setSlides((prev) =>
          prev.map((s) =>
            s.id === slide.id ? { ...s, status: 'generating' } : s
          )
        );
        try {
          // 🎯 优化：在自动模式下，如果已经有AI分析的分页结果（slide有具体内容），就不传完整内容
          // 非程序员解释：
          // - 如果AI已经分析好了每页的标题和内容，就直接用这些内容生成，不需要再传完整内容
          // - 只有在降级方案（AI分析失败，使用占位符）时，才需要传完整内容让NANO BANANA PRO自己推断
          const shouldUseSourceContent =
            pageMode === 'auto' &&
            (slide.content === 'Wait for generation...' ||
              !slide.content ||
              slide.title === `Page ${i + 1}`);

          const resultUrl = await generateSlide(slide, {
            cachedStyleImages: sharedStyleImages,
            sourceContent: shouldUseSourceContent
              ? autoSourceRef.current
              : undefined,
            index: i, // 始终传递index，用于视觉一致性
            total: workingSlides.length, // 始终传递total
            // 🎯 从第三页（index 2）开始，使用锚定图片（锚定源为index 1）
            anchorImageUrl: i > 1 ? anchorImageUrl : undefined,
          });

          // 🎯 关键修复：立即更新本地对象引用
          if (resultUrl) {
            slide.imageUrl = resultUrl;
            slide.status = 'completed';

            // 🎯 增量保存：每生成一张，就同步更新一次数据库，防止预览失效
            if (recordId) {
              await updatePresentationAction(recordId, {
                content: JSON.stringify(workingSlides),
                thumbnailUrl:
                  workingSlides.find((s) => s.imageUrl)?.imageUrl || resultUrl,
              });
            }
          }

          // 🎯 第一张内页（index 1）生成成功后，记录其URL作为锚定
          if (i === 1 && resultUrl) {
            anchorImageUrl = resultUrl;
            console.log('📌 内页锚定成功 (Index 1):', anchorImageUrl);
          }

          successCount++;
        } catch (error) {
          console.error('Slide generation failed', slide.id, error);
          slide.status = 'failed';
          setSlides((prev) =>
            prev.map((s) =>
              s.id === slide.id ? { ...s, status: 'failed' } : s
            )
          );

          // 🎯 修复：固定模式下，单页生成失败自动退费
          if (pageMode !== 'auto') {
            const costPerSlide = resolution === '4K' ? 12 : 6;
            console.log(
              `💰 固定模式下单页生成失败，尝试退还 ${costPerSlide} 积分...`
            );
            try {
              await refundCreditsAction({
                credits: costPerSlide,
                description: `退还失败页面的积分: ${slide.title || '未命名页面'}`,
              });
              toast.info(
                `页面「${slide.title}」生成失败，已退还 ${costPerSlide} 积分`
              );
            } catch (refundError) {
              console.error(
                'Failed to refund credits for failed slide:',
                refundError
              );
            }
          }
        }
      }

      // Auto mode: Consume credits based on success count
      if (pageMode === 'auto' && successCount > 0) {
        const autoCost = successCount * costPerSlide;
        try {
          await consumeCreditsAction({
            credits: autoCost,
            description: `Auto Generated ${successCount} slides`,
          });
        } catch (e) {
          console.error('Failed to consume credits for auto generation', e);
          toast.error('积分扣除异常，请联系客服');
        }
      }

      if (recordId) {
        // 🎯 对最终结果做一次完整收敛，避免“已完成却无封面/无内容”的历史遗留问题
        const anyFailed = workingSlides.some(
          (slide) => slide.status === 'failed'
        );
        const finalStatus = anyFailed ? 'failed' : 'completed';
        const firstSuccess = workingSlides.find(
          (slide) => slide.status === 'completed' && slide.imageUrl
        );
        const finalThumbnail = firstSuccess?.imageUrl;

        await updatePresentationAction(recordId, {
          status: finalStatus,
          content: JSON.stringify(workingSlides),
          thumbnailUrl: finalThumbnail || undefined,
        });
      }

      toast.success('全部页面生成完成');
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsGenerating(false);
      setAutoPlanning(false);
    }
  };

  const handleDownloadImages = async () => {
    const completed = slides.filter(
      (slide) => slide.status === 'completed' && slide.imageUrl
    );
    if (completed.length === 0) {
      toast.error('还没有生成好的页面');
      return;
    }
    toast.loading('正在打包所有图片...', { id: 'zip' });
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      await Promise.all(
        completed.map(async (slide, idx) => {
          let url = slide.imageUrl!;
          // 🎯 只要开启水印，且用户没有手动关闭，就在下载时打入图片
          if (showWatermark) {
            url = await addWatermarkToImage(url, watermarkText);
          }
          const response = await fetch(url);
          const blob = await response.blob();
          zip.file(`slide-${String(idx + 1).padStart(2, '0')}.png`, blob);
        })
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `slides-${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('已下载全部图片', { id: 'zip' });
    } catch (error) {
      console.error('zip error', error);
      toast.error('打包失败，请稍后重试', { id: 'zip' });
    }
  };

  const handleDownloadPPTX = async () => {
    const completed = slides.filter(
      (slide) => slide.status === 'completed' && slide.imageUrl
    );
    if (completed.length === 0) {
      toast.error('没有可导出的已完成页面');
      return;
    }
    toast.loading('正在生成 PPTX...', { id: 'pptx' });
    try {
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pres = new PptxGenJS();
      for (const slide of completed) {
        const pptSlide = pres.addSlide();
        let url = slide.imageUrl!;
        // 🎯 只要开启水印，且用户没有手动关闭，就在导出 PPTX 时打入背景图
        if (showWatermark) {
          url = await addWatermarkToImage(url, watermarkText);
        }
        pptSlide.background = { path: url };
      }
      const blob = (await pres.write({ outputType: 'blob' })) as Blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `presentation-${Date.now()}.pptx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('PPTX 导出成功', { id: 'pptx' });
    } catch (error) {
      console.error('PPTX export failed', error);
      toast.error('PPTX 导出失败', { id: 'pptx' });
    }
  };

  const handleFilesDrop = (files: FileList | null) => {
    if (!files?.length) return;
    setUploadedFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const handleAddSlide = () => {
    setSlides((prev) => [
      ...prev,
      {
        id: `slide-${Date.now()}`,
        title: `新页面 ${prev.length + 1}`,
        content: '请在此编写要点',
        status: 'pending',
      },
    ]);
  };

  const handleRemoveSlide = (id: string) => {
    setSlides((prev) => prev.filter((slide) => slide.id !== id));
  };

  const handleSlideChange = (
    id: string,
    key: 'title' | 'content',
    value: string
  ) => {
    setSlides((prev) =>
      prev.map((slide) =>
        slide.id === id ? { ...slide, [key]: value } : slide
      )
    );
  };

  const renderStepTitle = (
    label: string,
    title: string,
    description: string
  ) => (
    <div className="mb-2 space-y-1">
      <p className="text-xs font-semibold tracking-[0.4em] text-white/40 uppercase">
        {label}
      </p>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-sm text-white/60">{description}</p>
    </div>
  );

  const renderStep1Input = () => (
    <Card className="border-white/5 bg-gradient-to-b from-[#0E1424]/90 to-[#06070D]/90 p-6 text-white shadow-2xl">
      {renderStepTitle('Step 1', '输入素材', ' ')}
      <div className="space-y-4">
        <section className="space-y-3">
          <Tabs
            value={inputTab}
            onValueChange={(v) => setInputTab(v as any)}
            className="w-full"
          >
            <TabsList className="mb-4 grid grid-cols-3 rounded-xl bg-white/10 text-white">
              <TabsTrigger className="h-9 text-xs" value="text">
                TEXT
              </TabsTrigger>
              <TabsTrigger className="h-9 text-xs" value="upload">
                UPLOAD
              </TabsTrigger>
              <TabsTrigger className="h-9 text-xs" value="link">
                LINK
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text">
              <Textarea
                value={primaryInput}
                onChange={(e) => setPrimaryInput(e.target.value)}
                rows={8}
                placeholder="例如：气候变化的原因和影响..."
                className="border-white/10 bg-black/30 text-sm text-white"
              />
            </TabsContent>

            <TabsContent value="upload" className="space-y-3">
              <div
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 px-4 py-10 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFilesDrop(e.dataTransfer.files);
                }}
              >
                <Upload className="text-primary mb-3 h-10 w-10" />
                <Button
                  variant="secondary"
                  className="mt-3 h-9 rounded-full px-5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  上传参考图
                </Button>
                <input
                  type="file"
                  multiple
                  hidden
                  ref={fileInputRef}
                  onChange={(e) => handleFilesDrop(e.target.files)}
                />
              </div>
              {uploadedFiles.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs">
                  <div className="mb-2 flex items-center justify-between text-white/60">
                    <span>已选择 {uploadedFiles.length} 个文件</span>
                    <button
                      className="text-white/40 hover:text-white/80"
                      onClick={() => setUploadedFiles([])}
                    >
                      清空
                    </button>
                  </div>
                  <ScrollArea className="h-24 pr-2">
                    <div className="space-y-2">
                      {uploadedFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
                        >
                          <span className="line-clamp-1 text-white/80">
                            {file.name}
                          </span>
                          <button
                            className="hover:text-destructive text-white/40"
                            onClick={() =>
                              setUploadedFiles((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </TabsContent>

            <TabsContent value="link" className="space-y-3">
              <Input
                value={primaryInput}
                onChange={(e) => setPrimaryInput(e.target.value)}
                placeholder="https://example.com/article"
                className="border-white/10 bg-black/30 text-white"
              />
              <Button
                variant="outline"
                className="h-9 rounded-full px-5 text-xs"
                onClick={async () => {
                  try {
                    setIsFetchingLink(true);
                    const text = await parseLinkContentAction(
                      primaryInput.trim()
                    );
                    setLinkPreview(text.slice(0, 100));
                    toast.success('网页内容抓取成功');
                  } catch (error) {
                    handleApiError(error);
                  } finally {
                    setIsFetchingLink(false);
                  }
                }}
              >
                {isFetchingLink ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    抓取中...
                  </>
                ) : linkPreview ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    抓取成功
                  </>
                ) : (
                  <>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    抓取网页内容
                  </>
                )}
              </Button>
              {linkPreview && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/70">
                  {linkPreview}...
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>

        <section className="mt-4 space-y-4 border-t border-white/10 pt-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold tracking-wider text-indigo-300 uppercase">
              Page Count
            </h3>
            <span className="text-xs font-medium text-white/70">
              {pageMode === 'auto' ? 'AI Auto' : `${slideCount} Pages`}
            </span>
          </div>

          {/* Toggle Buttons */}
          <div className="flex rounded-xl bg-black/40 p-1">
            <button
              onClick={() => setPageMode('auto')}
              className={cn(
                'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all',
                pageMode === 'auto'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-white/40 hover:text-white/60'
              )}
            >
              Auto
            </button>
            <button
              onClick={() => setPageMode('fixed')}
              className={cn(
                'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all',
                pageMode === 'fixed'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-white/40 hover:text-white/60'
              )}
            >
              Fixed
            </button>
          </div>

          {/* Slider & Input Group */}
          <div
            className={cn(
              'flex items-center gap-4 transition-all duration-300',
              pageMode === 'auto'
                ? 'pointer-events-none opacity-20'
                : 'opacity-100'
            )}
          >
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={slideCount}
              onChange={(e) => setSlideCount(e.target.value)}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-white/10 accent-indigo-500"
            />
            <input
              type="number"
              min="1"
              max="30"
              value={slideCount}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) {
                  setSlideCount(String(Math.min(30, Math.max(1, val))));
                }
              }}
              className="h-8 w-12 rounded-lg border border-white/10 bg-black/40 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Start Pagination Button */}
          <Button
            className="h-10 w-full rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500"
            onClick={handleAutoPaginate}
            disabled={isAnalyzing || isParsingFiles || isFetchingLink}
          >
            {isAnalyzing || isParsingFiles ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在分页中...
              </>
            ) : (
              <>
                {/* 显示自动分页功能消耗的积分额度：3积分 */}
                <CreditsCost
                  credits={3}
                  className="mr-2 bg-white/20 text-white"
                />
                开始分页
              </>
            )}
          </Button>
        </section>

        {(parsingProgress || completion) && (
          <ScrollArea
            ref={logRef as any}
            className="h-40 w-full rounded-xl border border-white/10 bg-black/25 p-4 text-xs text-white/70"
          >
            <div className="space-y-1">
              {parsingProgress && <p>{parsingProgress}</p>}
              {completion
                .split('\n')
                .filter(Boolean)
                .map((line, idx) => (
                  <p key={`${line}-${idx}`}>{line}</p>
                ))}
            </div>
          </ScrollArea>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-wide text-white/80">
              逐页大纲
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              onClick={handleAddSlide}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              新增页面
            </Button>
          </div>
          {slides.length === 0 ? (
            <Card className="border-dashed border-white/15 bg-black/20 p-5 text-xs text-white/55">
              暂无大纲
            </Card>
          ) : (
            <div className="space-y-4">
              {slides.map((slide, idx) => (
                <div
                  key={slide.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="mb-2 flex items-center justify-between text-[11px] tracking-[0.2em] text-white/45 uppercase">
                    <span>
                      Page {idx + 1} ·{' '}
                      {
                        {
                          pending: '待生成',
                          generating: '生成中',
                          completed: '已完成',
                          failed: '失败',
                        }[slide.status]
                      }
                    </span>
                    <button
                      className="hover:text-destructive text-white/40"
                      onClick={() => handleRemoveSlide(slide.id)}
                    >
                      删除
                    </button>
                  </div>
                  <Input
                    value={slide.title}
                    onChange={(e) =>
                      handleSlideChange(slide.id, 'title', e.target.value)
                    }
                    className="mb-3 border-white/10 bg-black/30 text-white"
                  />
                  <Textarea
                    value={slide.content}
                    onChange={(e) =>
                      handleSlideChange(slide.id, 'content', e.target.value)
                    }
                    rows={4}
                    className="border-white/10 bg-black/20 text-sm text-white"
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Card>
  );

  const renderStep2Style = () => (
    <Card className="border-white/5 bg-gradient-to-b from-[#0A1427]/90 to-[#05080F]/90 p-6 text-white shadow-2xl">
      {renderStepTitle('Step 2', '风格与参数', ' ')}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-white/60">输出比例</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="mt-1 border-white/10 bg-black/30 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black/90 text-white">
                {PPT_RATIOS.map((ratio) => (
                  <SelectItem key={ratio.value} value={ratio.value}>
                    {ratio.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-white/60">分辨率</Label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger className="mt-1 border-white/10 bg-black/30 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black/90 text-white">
                {PPT_SIZES.map((size) => (
                  <SelectItem key={size.value} value={size.value}>
                    {size.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-white/60">语言</Label>
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v as any)}
            >
              <SelectTrigger className="mt-1 border-white/10 bg-black/30 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black/90 text-white">
                <SelectItem value="auto">智能匹配</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-white/60">内容控制</Label>
            <Select
              value={contentControl}
              onValueChange={(v) => setContentControl(v as any)}
            >
              <SelectTrigger className="mt-1 h-10 rounded-xl border-white/10 bg-black/30 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black/90 text-white">
                <SelectItem value="expand">智能扩写</SelectItem>
                <SelectItem value="strict">遵循大纲</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label className="text-xs text-white/60">标题位置</Label>
            <div className="mt-2 flex gap-2">
              {(['left', 'center'] as const).map((align) => (
                <button
                  key={align}
                  className={cn(
                    'flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-all',
                    innerTitleAlign === align
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'hover:border-primary/40 border-white/10 bg-black/30 text-white/60'
                  )}
                  onClick={() => setInnerTitleAlign(align)}
                >
                  {align.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] tracking-[0.2em] text-white/45 uppercase">
            <span>风格库 (点击图片预览 & 选择)</span>
            <span>{SLIDES2_STYLE_PRESETS.length} styles</span>
          </div>
          <ScrollArea className="h-[400px] w-full pr-2">
            <div className="grid grid-cols-2 gap-3 pr-3">
              {SLIDES2_STYLE_PRESETS.map((style) => (
                <button
                  key={style.id}
                  onClick={() =>
                    setSelectedStyleId(
                      selectedStyleId === style.id ? null : style.id
                    )
                  }
                  className={cn(
                    'group relative aspect-[16/10] overflow-hidden rounded-xl border transition-all',
                    selectedStyleId === style.id
                      ? 'border-primary ring-primary/50 ring-2'
                      : 'border-white/10 bg-black/30 hover:border-white/30'
                  )}
                >
                  {style.preview && (
                    <img
                      src={style.preview}
                      alt={style.title}
                      className={cn(
                        'h-full w-full object-cover transition-transform duration-500',
                        selectedStyleId === style.id
                          ? 'scale-110'
                          : 'group-hover:scale-110'
                      )}
                    />
                  )}
                  <div
                    className={cn(
                      'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 transition-opacity',
                      selectedStyleId === style.id
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    )}
                  >
                    <p className="truncate text-[11px] font-medium text-white">
                      {style.title}
                    </p>
                  </div>
                  {selectedStyleId === style.id && (
                    <div className="bg-primary absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full text-white shadow-lg">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] text-white/45 uppercase">
            CUSTOM STYLE
          </p>
          <Textarea
            value={customStylePrompt}
            onChange={(e) => {
              setCustomStylePrompt(e.target.value);
              if (e.target.value.trim()) setSelectedStyleId(null);
            }}
            rows={2}
            placeholder="输入风格描述..."
            className="mt-2 border-white/10 bg-black/30 text-white"
          />
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] text-white/45 uppercase">
            REFERENCE IMAGES
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <div className="relative aspect-square">
              <input
                type="file"
                accept="image/*"
                multiple
                className="absolute inset-0 z-10 cursor-pointer opacity-0"
                onChange={(e) => {
                  const files = e.target.files
                    ? Array.from(e.target.files)
                    : [];
                  if (files.length + customImageFiles.length > 8) {
                    toast.error('最多上传 8 张参考图');
                    return;
                  }
                  setCustomImageFiles((prev) => [...prev, ...files]);
                  files.forEach((file) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      setCustomImages((prev) => [
                        ...prev,
                        ev.target?.result as string,
                      ]);
                    };
                    reader.readAsDataURL(file);
                  });
                  setSelectedStyleId(null);
                }}
              />
              <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-white/20 bg-black/30 text-white/40 transition-colors hover:border-white/40 hover:text-white/60">
                <Plus className="h-6 w-6" />
              </div>
            </div>

            {customImages.map((src, idx) => (
              <div
                key={`${src}-${idx}`}
                className="group relative aspect-square overflow-hidden rounded-xl border border-white/10"
              >
                <img src={src} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    className="rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-red-500/80"
                    onClick={() => {
                      setCustomImages((prev) =>
                        prev.filter((_, i) => i !== idx)
                      );
                      setCustomImageFiles((prev) =>
                        prev.filter((_, i) => i !== idx)
                      );
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 水印控制区域 (会员功能) */}
        <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-white/80">
                水印控制
              </Label>
              <p className="text-xs text-white/40">
                Plus/Pro 会员可自定义或关闭
              </p>
            </div>
            <Switch
              checked={showWatermark}
              onCheckedChange={(checked) => {
                if (!isVip) {
                  toast.info('升级 Plus/Pro 会员即可关闭水印');
                  return;
                }
                setShowWatermark(checked);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-white/60">水印文字</Label>
            <Input
              value={watermarkText}
              onChange={(e) => {
                if (!isVip) {
                  toast.info('升级 Plus/Pro 会员即可修改水印');
                  return;
                }
                setWatermarkText(e.target.value);
              }}
              placeholder="输入水印文字..."
              disabled={!isVip}
              className="border-white/10 bg-black/30 text-xs text-white"
            />
          </div>
        </div>

        <Button
          className="mt-4 w-full py-6 text-lg"
          size="lg"
          disabled={
            isGenerating ||
            (pageMode === 'fixed' && slides.length === 0 && !isAnalyzing)
          }
          onClick={handleStartGeneration}
        >
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : pageMode === 'auto' ? (
            <div className="mr-2 rounded-full bg-black/30 px-3 py-1 text-sm font-semibold text-white/80">
              ?
            </div>
          ) : (
            <CreditsCost
              credits={slides.length * (resolution === '4K' ? 12 : 6)}
              className="mr-2 bg-white/20 text-white"
            />
          )}
          一键生成
        </Button>
      </div>
    </Card>
  );

  const renderSlideCard = (slide: SlideData, index: number) => (
    <Card key={slide.id} className="overflow-hidden bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between text-xs tracking-[0.2em] text-white/50 uppercase">
        <span className="text-white/80">Page {index + 1}</span>
        <Badge
          variant="outline"
          className={cn(
            'border-white/20 text-[10px]',
            slide.status === 'completed' &&
              'border-emerald-400 text-emerald-200',
            slide.status === 'failed' && 'border-destructive text-destructive',
            slide.status === 'generating' && 'border-primary text-primary'
          )}
        >
          {
            {
              pending: '待生成',
              generating: '生成中',
              completed: '已完成',
              failed: '失败',
            }[slide.status]
          }
        </Badge>
      </div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        {slide.status === 'completed' && slide.imageUrl ? (
          <div className="relative h-full w-full">
            <Image
              src={slide.imageUrl}
              alt={slide.title}
              fill
              className="cursor-zoom-in object-cover transition-transform hover:scale-[1.02]"
              unoptimized
              onClick={() => setLightboxUrl(slide.imageUrl!)}
            />
            {/* 前端固定位置水印 */}
            {showWatermark && (
              <div className="absolute right-3 bottom-3 z-10 rounded bg-black/40 px-2 py-1 text-[10px] font-medium text-white/60 backdrop-blur-sm">
                {watermarkText}
              </div>
            )}
          </div>
        ) : slide.status === 'generating' ? (
          <div className="flex h-full flex-col items-center justify-center text-sm text-white/60">
            <Loader2 className="mb-2 h-6 w-6 animate-spin" />
            正在生成...
          </div>
        ) : slide.status === 'failed' ? (
          <div className="text-destructive flex h-full flex-col items-center justify-center text-sm">
            生成失败
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-sm text-white/60">
            待生成
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => openEditDialog(slide)}
          disabled={slide.status === 'generating'}
        >
          <WandSparkles className="mr-1 h-4 w-4" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => openHistory(slide.id)}
          disabled={!slideHistories[slide.id]?.length}
        >
          <History className="mr-1 h-4 w-4" />
          History
        </Button>
      </div>
    </Card>
  );

  const renderStep3Preview = () => (
    <div className="space-y-4">
      <Card className="border-white/5 bg-gradient-to-b from-[#0B0F1D]/90 to-[#040609]/90 p-5 text-white shadow-2xl">
        {renderStepTitle('Step 3', '生成预览', ' ')}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-4 text-xs"
              onClick={handleDownloadPDF}
            >
              <FileText className="mr-2 h-4 w-4" />
              下载为 PDF
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-4 text-xs"
              onClick={handleDownloadImages}
            >
              <Images className="mr-2 h-4 w-4" />
              下载全部图片
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-4 text-xs"
              onClick={handleDownloadPPTX}
            >
              <Download className="mr-2 h-4 w-4" />
              导出 PPTX
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full px-4 text-xs"
            onClick={() => router.push('/library/presentations')}
            disabled
            style={{ display: 'none' }}
          >
            查看历史演示
          </Button>
        </div>
        {autoPlanning && (
          <div className="mb-4 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            正在根据全文自动规划页数...
          </div>
        )}
        {slides.length === 0 ? (
          <Card className="border-dashed border-white/15 bg-white/[0.03] p-10 text-center text-sm text-white/55">
            等待生成结果
          </Card>
        ) : (
          <div className="space-y-4">
            {slides.map((slide, index) => renderSlideCard(slide, index))}
          </div>
        )}
      </Card>
    </div>
  );

  const openEditDialog = (slide: SlideData) => {
    setEditingSlide(slide);
    setEditingPrompt(slide.content);
    setEditRegions([]);
    setDraftRegion(null);
    setActiveRegionId(null);
  };

  const openHistory = (slideId: string) => {
    setHistorySlideId(slideId);
  };

  const handleCanvasPointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!editingSlide) return;
    const bounds = editCanvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;

    // 检查是否点击了现有选区的调整手柄或内部
    for (let i = editRegions.length - 1; i >= 0; i--) {
      const region = editRegions[i];
      const margin = 0.02; // 点击余量
      const isInside =
        x >= region.x &&
        x <= region.x + region.width &&
        y >= region.y &&
        y <= region.y + region.height;

      if (isInside) {
        setActiveRegionId(region.id);
        // 检查是否在右下角进行缩放
        const isCorner =
          x >= region.x + region.width - margin &&
          y >= region.y + region.height - margin;
        if (isCorner) {
          setResizeCorner(region.id);
        } else {
          setDraggedRegionId(region.id);
          dragStartPosRef.current = { x: x - region.x, y: y - region.y };
        }
        return;
      }
    }

    // 如果没点到现有选区，则开始绘制新选区
    drawingStartRef.current = { x, y };
    setDraftRegion({
      id: `draft-${Date.now()}`,
      label: '',
      x,
      y,
      width: 0,
      height: 0,
      note: '',
    });
  };

  const handleCanvasPointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const bounds = editCanvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const currentX = (event.clientX - bounds.left) / bounds.width;
    const currentY = (event.clientY - bounds.top) / bounds.height;

    if (resizeCorner) {
      setEditRegions((prev) =>
        prev.map((r) =>
          r.id === resizeCorner
            ? {
                ...r,
                width: Math.max(0.02, Math.min(1 - r.x, currentX - r.x)),
                height: Math.max(0.02, Math.min(1 - r.y, currentY - r.y)),
              }
            : r
        )
      );
      return;
    }

    if (draggedRegionId) {
      const startOffset = dragStartPosRef.current;
      if (!startOffset) return;
      setEditRegions((prev) =>
        prev.map((r) => {
          if (r.id === draggedRegionId) {
            let nextX = currentX - startOffset.x;
            let nextY = currentY - startOffset.y;
            // 边界约束
            nextX = Math.max(0, Math.min(1 - r.width, nextX));
            nextY = Math.max(0, Math.min(1 - r.height, nextY));
            return { ...r, x: nextX, y: nextY };
          }
          return r;
        })
      );
      return;
    }

    if (drawingStartRef.current) {
      const start = drawingStartRef.current;
      const x = Math.min(start.x, currentX);
      const y = Math.min(start.y, currentY);
      const width = Math.abs(start.x - currentX);
      const height = Math.abs(start.y - currentY);
      setDraftRegion((prev) =>
        prev
          ? {
              ...prev,
              x: Math.max(0, Math.min(1, x)),
              y: Math.max(0, Math.min(1, y)),
              width: Math.min(1 - x, width),
              height: Math.min(1 - y, height),
            }
          : prev
      );
    }
  };

  const finalizeRegion = () => {
    if (draggedRegionId || resizeCorner) {
      setDraggedRegionId(null);
      setResizeCorner(null);
      dragStartPosRef.current = null;
      return;
    }

    if (!draftRegion || draftRegion.width < 0.02 || draftRegion.height < 0.02) {
      setDraftRegion(null);
      drawingStartRef.current = null;
      return;
    }
    const label = getRegionLabel(editRegions.length);
    setEditRegions((prev) => [
      ...prev,
      { ...draftRegion, id: label, label, note: '' },
    ]);
    setDraftRegion(null);
    drawingStartRef.current = null;
  };

  const renderRegionsOverlay = () => {
    return (
      <>
        {editRegions.map((region, index) => (
          <div
            key={region.id}
            className={cn(
              'absolute border-2 transition-colors',
              activeRegionId === region.id ? 'z-20' : 'z-10'
            )}
            style={{
              left: `${region.x * 100}%`,
              top: `${region.y * 100}%`,
              width: `${region.width * 100}%`,
              height: `${region.height * 100}%`,
              borderColor: REGION_COLORS[index % REGION_COLORS.length],
              backgroundColor: `${REGION_COLORS[index % REGION_COLORS.length]}10`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setActiveRegionId(region.id);
            }}
          >
            <span
              className="absolute top-1 left-1 rounded bg-black/70 px-1 text-[10px]"
              style={{ color: REGION_COLORS[index % REGION_COLORS.length] }}
            >
              {region.label}
            </span>
            {/* 缩放手柄 */}
            <div
              className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
              style={{
                background: `linear-gradient(135deg, transparent 50%, ${REGION_COLORS[index % REGION_COLORS.length]} 50%)`,
              }}
            />
          </div>
        ))}
        {draftRegion && (
          <div
            className="absolute border-2 border-dashed border-white/70"
            style={{
              left: `${draftRegion.x * 100}%`,
              top: `${draftRegion.y * 100}%`,
              width: `${draftRegion.width * 100}%`,
              height: `${draftRegion.height * 100}%`,
            }}
          />
        )}
      </>
    );
  };

  const renderRegionList = () => (
    <div className="space-y-3">
      {editRegions.map((region, index) => (
        <div
          key={region.id}
          className={cn(
            'rounded-lg border p-3',
            activeRegionId === region.id
              ? 'border-primary/50 bg-primary/5'
              : 'border-white/5 bg-white/[0.02]'
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-xs font-medium"
              style={{ color: REGION_COLORS[index % REGION_COLORS.length] }}
            >
              {region.label}
            </span>
            <button
              className="text-xs text-white/40 transition-colors hover:text-red-400"
              onClick={() =>
                setEditRegions((prev) =>
                  prev.filter((item) => item.id !== region.id)
                )
              }
            >
              删除
            </button>
          </div>
          <Textarea
            value={region.note}
            onChange={(e) =>
              setEditRegions((prev) =>
                prev.map((item) =>
                  item.id === region.id
                    ? { ...item, note: e.target.value }
                    : item
                )
              )
            }
            rows={2}
            placeholder="描述修改需求..."
            className="focus:border-primary/30 border-white/5 bg-white/[0.02] text-xs text-white/80 placeholder:text-white/30 focus:bg-white/[0.04]"
          />
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                setEditRegions((prev) =>
                  prev.map((item) =>
                    item.id === region.id
                      ? {
                          ...item,
                          imageFile: file,
                          imagePreview: ev.target?.result as string,
                        }
                      : item
                  )
                );
              };
              reader.readAsDataURL(file);
            }}
            className="mt-2 border-white/5 bg-white/[0.02] text-xs text-white/60"
          />
          {region.imagePreview && (
            <img
              src={region.imagePreview}
              className="mt-2 h-16 w-full rounded-md object-cover"
            />
          )}
        </div>
      ))}
      {editRegions.length < 8 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed border-white/5 text-xs text-white/50 hover:border-white/10 hover:text-white/70"
          onClick={() => {
            const label = getRegionLabel(editRegions.length);
            setEditRegions((prev) => [
              ...prev,
              {
                id: label,
                label,
                x: 0.1,
                y: 0.1,
                width: 0.3,
                height: 0.2,
                note: '',
              },
            ]);
            setActiveRegionId(label);
          }}
        >
          <Crop className="mr-2 h-3.5 w-3.5" />
          添加选区
        </Button>
      )}
    </div>
  );

  const renderHistoryDialog = () => {
    if (!historySlideId) return null;
    const slide = slides.find((s) => s.id === historySlideId);
    const records = slideHistories[historySlideId] || [];
    return (
      <Dialog open onOpenChange={() => setHistorySlideId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>「{slide?.title}」历史记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {records.length === 0 ? (
              <p className="text-muted-foreground text-sm">暂无历史版本</p>
            ) : (
              records.map((entry) => (
                <div
                  key={entry.id}
                  className="flex gap-4 rounded-xl border border-white/10 p-3"
                >
                  <img
                    src={entry.imageUrl}
                    className="h-24 w-40 rounded-lg object-cover"
                  />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                    <p className="line-clamp-3 text-xs text-white/60">
                      {entry.prompt}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          triggerDownload(
                            entry.imageUrl,
                            `${slide?.title ?? 'slide'}-${entry.id}.png`
                          )
                        }
                      >
                        下载
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSlides((prev) =>
                            prev.map((s) =>
                              s.id === historySlideId
                                ? {
                                    ...s,
                                    imageUrl: entry.imageUrl,
                                    status: 'completed',
                                  }
                                : s
                            )
                          );
                          setHistorySlideId(null);
                        }}
                      >
                        设为当前
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const renderEditDialog = () => {
    if (!editingSlide) return null;
    return (
      <Dialog open onOpenChange={() => setEditingSlide(null)}>
        <DialogContent className="max-h-[96vh] w-[80vw] max-w-[80vw] gap-0 overflow-hidden border-white/10 bg-[#0E1424]/98 p-0 shadow-[0_0_100px_rgba(0,0,0,0.8)] backdrop-blur-3xl sm:max-w-[80vw]">
          <div className="flex h-full flex-col">
            <div className="grid flex-1 overflow-hidden lg:grid-cols-[5fr_380px]">
              {/* 左侧：视觉编辑核心区 */}
              <div className="flex flex-col overflow-hidden bg-black/40 p-6">
                <div className="flex flex-1 flex-col gap-6 overflow-hidden">
                  {/* 1. 待编辑图片 - 撑满宽度 */}
                  <div className="relative flex min-h-120 flex-1 flex-col">
                    <div
                      ref={editCanvasRef}
                      className="group hover:border-primary/20 relative h-full w-full cursor-crosshair overflow-hidden rounded-2xl border border-white/5 bg-black/60 shadow-[0_40px_100px_rgba(0,0,0,0.6)] transition-all"
                      onPointerDown={handleCanvasPointerDown}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={finalizeRegion}
                      onPointerLeave={finalizeRegion}
                    >
                      {editingSlide.imageUrl ? (
                        <div className="relative h-full w-full">
                          <Image
                            src={editingSlide.imageUrl}
                            alt={editingSlide.title}
                            fill
                            className="pointer-events-none object-contain"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center space-y-4 text-white/20">
                          <Images className="h-16 w-16 opacity-10" />
                        </div>
                      )}
                      {renderRegionsOverlay()}
                    </div>
                  </div>

                  {/* 2. 文案修改区 */}
                  <div className="shrink-0 space-y-3">
                    <Label className="text-sm font-medium text-white/70">
                      文案修改
                    </Label>
                    <Textarea
                      value={editingPrompt}
                      onChange={(e) => setEditingPrompt(e.target.value)}
                      rows={4}
                      className="focus:border-primary/30 min-h-[100px] w-full resize-none rounded-xl border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-white/90 transition-all placeholder:text-white/30 focus:bg-white/[0.05] focus:ring-0"
                      placeholder="输入新的文案要点..."
                    />
                  </div>
                </div>
              </div>

              {/* 右侧：指令侧边栏 */}
              <div className="flex flex-col overflow-hidden border-l border-white/5 bg-[#0A0D18]/50">
                <div className="flex min-h-0 flex-1 flex-col p-6">
                  <div className="mb-6">
                    <Label className="text-sm font-medium text-white/70">
                      局部修改指令
                    </Label>
                    <p className="mt-1 text-xs leading-relaxed text-white/50">
                      描述框选区域的修改需求
                    </p>
                  </div>

                  <ScrollArea className="-mx-2 flex-1 px-2">
                    <div className="space-y-4 pb-6">
                      {editRegions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/5 bg-white/[0.01] py-16 text-center">
                          <Plus className="mb-3 h-6 w-6 text-white/20" />
                          <p className="text-xs text-white/40">
                            在左侧图片中拖拽创建选区
                          </p>
                        </div>
                      ) : (
                        renderRegionList()
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Footer Action */}
                <div className="border-t border-white/5 bg-[#080A12] p-6">
                  <Button
                    className="bg-primary hover:bg-primary/90 h-12 w-full rounded-xl text-base font-semibold text-white transition-all active:scale-[0.98]"
                    disabled={pendingEditSubmit}
                    onClick={async () => {
                      if (!editingSlide) return;
                      setPendingEditSubmit(true);
                      toast.loading('正在重新生成...', {
                        id: editingSlide.id,
                      });
                      try {
                        await generateSlide(editingSlide, {
                          overrideContent: editingPrompt,
                          regions: editRegions,
                        });
                        toast.success('重新生成成功', {
                          id: editingSlide.id,
                        });
                      } catch (error) {
                        handleApiError(error);
                        toast.error('生成失败', { id: editingSlide.id });
                      } finally {
                        setPendingEditSubmit(false);
                        setEditingSlide(null);
                      }
                    }}
                  >
                    {pendingEditSubmit ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <WandSparkles className="mr-2 h-5 w-5" />
                    )}
                    重新生成
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  /**
   * 🎯 详情页视图 (参考 podcasts 详情页风格，使用 ConsoleLayout)
   */
  const renderDetailView = () => {
    const title = t('title');
    const nav = t.raw('nav');
    const topNav = t.raw('top_nav');

    return (
      <ConsoleLayout
        title={title}
        nav={nav}
        topNav={topNav}
        className="py-16 md:py-20"
      >
        <div className="mx-auto max-w-4xl px-4 py-8">
          {/* 头部导航 */}
          <div className="mb-8">
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground mb-4 -ml-2"
              onClick={() => router.push('/library/presentations')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to library
            </Button>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge
                  variant="secondary"
                  className="rounded-md px-2 py-1 font-medium"
                >
                  Presentation
                </Badge>
                {initialPresentation?.createdAt && (
                  <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      {new Date(
                        initialPresentation.createdAt
                      ).toLocaleDateString(locale)}
                    </span>
                  </div>
                )}
              </div>

              <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
                {initialPresentation?.title || '演示文档详情'}
              </h1>
            </div>
          </div>

          {/* 操作按钮区域 */}
          <div className="mb-10 flex flex-wrap items-center gap-4">
            <Button
              variant="outline"
              className="h-11 rounded-xl px-6"
              onClick={handleDownloadPDF}
            >
              <FileText className="mr-2 h-4 w-4" />
              下载 PDF
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl px-6"
              onClick={handleDownloadPPTX}
            >
              <Download className="mr-2 h-4 w-4" />
              导出 PPTX
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl px-6"
              onClick={handleDownloadImages}
            >
              <Images className="mr-2 h-4 w-4" />
              下载图片集
            </Button>
            <Button
              className="h-11 rounded-xl px-8 font-bold"
              onClick={() => setViewMode('studio')}
            >
              <WandSparkles className="mr-2 h-4 w-4" />
              Edit (进入编辑器)
            </Button>
          </div>

          {/* 幻灯片网格 */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {slides.map((slide, index) => (
              <div key={slide.id} className="group space-y-3">
                <div
                  className="border-border/50 bg-card hover:border-primary/40 hover:shadow-primary/10 relative aspect-[16/9] cursor-zoom-in overflow-hidden rounded-2xl border transition-all hover:shadow-lg"
                  onClick={() =>
                    slide.imageUrl && setLightboxUrl(slide.imageUrl)
                  }
                >
                  {slide.imageUrl ? (
                    <>
                      <Image
                        src={slide.imageUrl}
                        alt={slide.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        unoptimized
                      />
                      {showWatermark && (
                        <div className="absolute right-3 bottom-3 z-10 rounded bg-black/40 px-2 py-1 text-[10px] text-white/60 backdrop-blur-sm">
                          {watermarkText}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-muted-foreground flex h-full flex-col items-center justify-center text-xs">
                      <Images className="mb-2 h-8 w-8 opacity-20" />
                      未生成图片
                    </div>
                  )}
                  <div className="bg-background/80 text-foreground absolute top-3 left-3 flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold backdrop-blur-md">
                    {index + 1}
                  </div>
                </div>
                <div className="px-1">
                  <h3 className="group-hover:text-primary text-foreground line-clamp-1 text-sm font-semibold transition-colors">
                    {slide.title}
                  </h3>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                    {slide.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ConsoleLayout>
    );
  };

  return (
    <>
      {viewMode === 'preview' ? (
        <>
          {renderDetailView()}
          {renderEditDialog()}
          {lightboxUrl && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
              onClick={() => setLightboxUrl(null)}
            >
              <button
                className="hover:text-primary absolute top-6 right-6 text-white"
                onClick={() => setLightboxUrl(null)}
              >
                <X className="h-8 w-8" />
              </button>
              <img
                src={lightboxUrl}
                className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
              />
            </div>
          )}
        </>
      ) : (
        <div className="min-h-screen bg-[#030409] text-white">
          <div className="mx-auto max-w-[1500px] px-4 pt-24 pb-12 lg:px-8">
            <div className="relative mb-10 flex items-center justify-center">
              <h1 className="bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                AI Slides Studio
              </h1>
              {presentationId && (
                <Button
                  variant="ghost"
                  onClick={() => setViewMode('preview')}
                  className="absolute right-0 text-white/40 hover:text-white"
                >
                  返回预览模式
                </Button>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[340px_360px_minmax(0,1fr)] lg:items-start">
              {renderStep1Input()}
              {renderStep2Style()}
              {renderStep3Preview()}
            </div>
          </div>

          {renderHistoryDialog()}
          {renderEditDialog()}

          {lightboxUrl && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
              onClick={() => setLightboxUrl(null)}
            >
              <button
                className="hover:text-primary absolute top-6 right-6 text-white"
                onClick={() => setLightboxUrl(null)}
              >
                <X className="h-8 w-8" />
              </button>
              <img
                src={lightboxUrl}
                className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
