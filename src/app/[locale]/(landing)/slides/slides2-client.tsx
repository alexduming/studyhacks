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
import { Progress } from '@/shared/components/ui/progress';
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
import { calculatePPTXCoords, pxToPoint } from '@/shared/lib/ocr-utils';
import { cn } from '@/shared/lib/utils';

type SlideStatus = 'pending' | 'generating' | 'completed' | 'failed';

interface SlideHistoryEntry {
  id: string;
  imageUrl: string;
  prompt: string;
  createdAt: number;
  provider?: string;
}

interface SlideData {
  id: string;
  title: string;
  content: string;
  status: SlideStatus;
  imageUrl?: string;
  provider?: string;
  fallbackUsed?: boolean;
  /** 🎯 编辑历史记录（持久化保存） */
  history?: SlideHistoryEntry[];
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
  const t_aippt = useTranslations('aippt');
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

  // 🎯 PPTX 导出进度状态
  const [pptxExportProgress, setPptxExportProgress] = useState({
    isOpen: false,
    currentSlide: 0,
    totalSlides: 0,
    currentStep: '',
    overallProgress: 0,
    logs: [] as string[],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const editCanvasRef = useRef<HTMLDivElement>(null);
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);
  const autoSourceRef = useRef<string>('');
  const slidesRef = useRef<SlideData[]>(slides); // 🎯 追踪最新的 slides 状态
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
        toast.error(t_aippt('v2.empty_response'));
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
            title:
              item.title || `${t_aippt('outline_step.slide_title')} ${idx + 1}`,
            content: item.content || '',
            status: 'pending',
          })
        );
        setSlides(nextSlides);
        setSlideCount(String(nextSlides.length));
        toast.success(t_aippt('v2.pagination_completed'));
      } catch (error: any) {
        console.error('Outline parse error', error);
        toast.error(t_aippt('v2.parse_failed') + error.message);
      }
    },
    onError: (error) => {
      console.error('Outline error', error);
      toast.error(t_aippt('v2.pagination_failed') + error.message);
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
          toast.error(t_aippt('v2.pagination_failed'));
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
    initialPresentation?.id || presentationId ? 'preview' : 'studio'
  );
  const [mounted, setMounted] = useState(false);
  const [draggedRegionId, setDraggedRegionId] = useState<string | null>(null);
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 🎯 保持 slidesRef 与 slides 状态同步
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  // 🎯 从加载的 slides 中初始化 slideHistories（向后兼容）
  useEffect(() => {
    const initialHistories: Record<string, SlideHistoryEntry[]> = {};
    let hasAnyHistory = false;

    for (const slide of slides) {
      if (slide.history && slide.history.length > 0) {
        initialHistories[slide.id] = slide.history;
        hasAnyHistory = true;
      }
    }

    if (hasAnyHistory) {
      setSlideHistories((prev) => ({
        ...prev,
        ...initialHistories,
      }));
    }
  }, [slides.length]); // 只在 slides 数量变化时运行（避免频繁更新）

  const handleApiError = (error: any) => {
    const message =
      typeof error?.message === 'string'
        ? error.message
        : t_aippt('errors.general_failed');
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
      toast.error(t_aippt('v2.no_completed_slides'));
      return;
    }

    toast.loading(t_aippt('v2.preparing_pdf'), { id: 'pdf' });
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
      toast.success(t_aippt('v2.pdf_success'), { id: 'pdf' });
    } catch (error) {
      console.error('PDF export failed', error);
      toast.error(t_aippt('v2.pdf_failed'), { id: 'pdf' });
    }
  };

  /**
   * 🎯 辅助函数：加载图片（使用代理避免 CORS 问题）
   */
  const loadImage = async (url: string): Promise<HTMLImageElement> => {
    return new Promise(async (resolve, reject) => {
      try {
        // 对于外部 URL，使用代理获取图片
        let imageUrl = url;
        if (!url.startsWith('/') && !url.startsWith(window.location.origin)) {
          const buffer = await urlToBuffer(url);
          const blob = new Blob([buffer], { type: 'image/png' });
          imageUrl = URL.createObjectURL(blob);
        }

        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl;
      } catch (error) {
        reject(error);
      }
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

  // 🎯 更新历史记录 - 直接存储在 slide 对象中以便持久化
  const appendHistory = (slideId: string, entry: SlideHistoryEntry) => {
    setSlides((prev) =>
      prev.map((slide) => {
        if (slide.id === slideId) {
          const currentHistory = slide.history || [];
          // 新记录放在前面，最多保留 20 条
          const newHistory = [entry, ...currentHistory].slice(0, 20);
          return { ...slide, history: newHistory };
        }
        return slide;
      })
    );

    // 同时更新旧的 slideHistories 状态（兼容性）
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
        throw new Error(t_aippt('v2.link_required'));
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
          setParsingProgress(
            t_aippt('input_step.recognizing_images', {
              count: uploadedFiles.length,
            })
          );
          const formData = new FormData();
          uploadedFiles.forEach((file) => formData.append('files', file));
          parsed = await parseMultipleImagesAction(formData);
        } else {
          const parts: string[] = [];
          for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            setParsingProgress(
              t_aippt('v2.parsing_file', {
                name: file.name,
                current: i + 1,
                total: uploadedFiles.length,
              })
            );
            
            // 智能策略：大文件（>4.5MB）先上传到 R2
            const MAX_DIRECT_SIZE = 4.5 * 1024 * 1024; // 4.5MB
            let text: string;
            
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
                throw new Error(`上传失败: ${uploadData.message || 'Unknown error'}`);
              }
              
              const fileUrl = uploadData.data.urls[0];
              console.log(`[Parse] File uploaded to R2:`, fileUrl);
              
              // 从 URL 解析
              text = await parseFileAction({
                fileUrl,
                fileName: file.name,
                fileType: file.type,
              });
            } else {
              // 小文件直接解析
              const formData = new FormData();
              formData.append('file', file);
              text = await parseFileAction(formData);
            }
            
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
      throw new Error(t_aippt('v2.content_required'));
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
        title: `${t_aippt('outline_step.slide_title')} ${idx + 1}`,
        content: t_aippt('v2.auto_mode'),
        status: 'pending',
      }));
    }
    const chunkSize = Math.ceil(
      paragraphs.length / Math.min(MAX_AUTO_SLIDES, paragraphs.length)
    );
    const slides: SlideData[] = [];
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      const chunk = paragraphs.slice(i, i + chunkSize);
      const title =
        chunk[0]?.slice(0, 24) ||
        `${t_aippt('outline_step.slide_title')} ${slides.length + 1}`;
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
    return t_aippt('v2.default_style_prompt');
  };

  const buildRegionInstructions = (regions?: RegionDefinition[]) => {
    if (!regions?.length) return null;
    return regions
      .map((region) => {
        const note = region.note || t_aippt('v2.region_note_default');
        const imageLine = region.uploadedUrl
          ? `参考图像：${region.uploadedUrl}`
          : '';
        return `区域 ${region.label}: ${note}${
          imageLine ? `\n${imageLine}` : ''
        }`;
      })
      .join('\n');
  };

  /**
   * 🎯 构建 Slide 提示词
   * 
   * ⚠️ 重要注意事项：
   * - 页码信息（index, total）仅用于传递给 deckContext，不应直接添加到 prompt 中
   * - 如果在 prompt 中包含类似"当前渲染第 X/Y 页"的文案，AI 可能会将其渲染到图片上
   * - 风格一致性通过 anchorImageUrl（锚定图片）和参考图实现，无需在 prompt 中声明
   * 
   * 非程序员解释：
   * - 这个函数负责生成传递给 AI 的指令文本
   * - 我们不在指令中包含"第几页"这样的信息，因为 AI 可能会把它画到图片上
   * - 风格一致性是通过提供参考图片来实现的，不是通过文字指令
   */
  const buildSlidePrompt = (
    slide: SlideData,
    options?: {
      overrideContent?: string;
      regions?: RegionDefinition[];
      sourceContent?: string;
      /** ⚠️ 仅用于传递给 deckContext，不得添加到 prompt 中 */
      index?: number;
      /** ⚠️ 仅用于传递给 deckContext，不得添加到 prompt 中 */
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

    // ⚠️ 注意：不要在这里添加 index/total 相关的文案！
    // 风格一致性由 anchorImageUrl 参数（在 generateSlide 中传递）保证
    return [
      options?.sourceContent
        ? `${AUTO_MODE_PREFIX}\n\n文章内容:\n${options.sourceContent}`
        : null,
      `Slide Title: "${slide.title}"`,
      `Key Content:\n${baseContent}`,
      languageInstruction,
      contentControlInstruction,
      `Inner title alignment: ${innerTitleAlign.toUpperCase()}.`,
      // ⚠️ 移除 AI 生成水印，改为由前端代码添加
      'DO NOT include any visible watermarks or brand text in the generated image. The final watermark will be applied externally.',
      regionInstruction
        ? `${t_aippt('v2.regional_edit_instruction')}:\n${regionInstruction}`
        : null,
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
      /** 🎯 整体修改模式：仅使用当前图片+提示词，不传风格参考 */
      isGlobalEdit?: boolean;
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

    // 🎯 编辑模式：精简方案（只传图片+坐标+提示词）
    if (regionPayload && regionPayload.length > 0 && slide.imageUrl) {
      try {
        console.log('[Edit Mode] 开始精简版局部编辑');
        console.log('[Edit Mode] 选区数量:', regionPayload.length);

        // 🎯 首次编辑前，先把原始图片存入历史记录
        const existingHistory = slide.history || [];
        if (existingHistory.length === 0) {
          console.log('[Edit Mode] 首次编辑，保存原始图片到历史');
          appendHistory(slide.id, {
            id: `${slide.id}-original`,
            imageUrl: slide.imageUrl,
            prompt: '原始版本',
            createdAt: Date.now() - 1, // 稍早一点，确保排在编辑结果之后
            provider: slide.provider,
          });
        }

        const { editImageRegionAction } = await import('@/app/actions/aippt');

        // 获取原图尺寸
        const imageWidth = resolution === '4K' ? 3840 : 1920;
        const imageHeight = resolution === '4K' ? 2160 : 1080;

        // 🎯 调用精简版编辑 API
        // 只传递：原图 + 选区坐标和描述 + 分辨率
        const editResult = await editImageRegionAction({
          imageUrl: slide.imageUrl,
          regions: regionPayload.map((region) => ({
            label: region.label,
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
            note: region.note || '',
          })),
          imageWidth,
          imageHeight,
          resolution,
        });

        console.log('[Edit Mode] ✅ 编辑完成');

        // 更新 slide - 直接使用返回的图片
        setSlides((prev) =>
          prev.map((s) =>
            s.id === slide.id
              ? {
                  ...s,
                  imageUrl: editResult.imageUrl,
                  status: 'completed',
                  provider: editResult.provider,
                }
              : s
          )
        );

        appendHistory(slide.id, {
          id: `${slide.id}-${Date.now()}`,
          imageUrl: editResult.imageUrl,
          prompt: regionPayload.map((r) => `[${r.label}] ${r.note}`).join('; '),
          createdAt: Date.now(),
          provider: editResult.provider,
        });

        return editResult.imageUrl;
      } catch (error) {
        console.error('[Edit Mode] 局部编辑失败:', error);
        throw error;
      }
    }

    // 🎯 整体修改模式：仅使用当前图片+提示词，不传风格参考
    if (
      options?.isGlobalEdit &&
      slide.imageUrl &&
      options?.overrideContent?.trim()
    ) {
      try {
        console.log('[Global Edit Mode] 开始整体修改');
        console.log(
          '[Global Edit Mode] 提示词:',
          options.overrideContent.substring(0, 100)
        );

        // 🎯 首次编辑前，先把原始图片存入历史记录
        const existingHistory = slide.history || [];
        if (existingHistory.length === 0) {
          console.log('[Global Edit Mode] 首次编辑，保存原始图片到历史');
          appendHistory(slide.id, {
            id: `${slide.id}-original`,
            imageUrl: slide.imageUrl,
            prompt: '原始版本',
            createdAt: Date.now() - 1,
            provider: slide.provider,
          });
        }

        // 🎯 整体修改：只传当前图片作为参考 + 提示词
        const task = await createKieTaskWithFallbackAction({
          prompt: options.overrideContent,
          customImages: [slide.imageUrl], // 仅当前图片作为参考
          aspectRatio,
          imageSize: resolution,
          preferredProvider: 'FAL',
          isEnhancedMode,
          outputLanguage: language,
          refundCredits: resolution === '4K' ? 12 : 6,
          // 不传 styleId，不传 deckContext
        });

        let imageUrl = 'imageUrl' in task ? task.imageUrl : undefined;
        if (!imageUrl) {
          const result = await pollTask(task.task_id!, task.provider);
          imageUrl = result;
        }

        if (!imageUrl) {
          throw new Error(t_aippt('v2.generation_timeout'));
        }

        console.log('[Global Edit Mode] ✅ 整体修改完成');

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
          prompt: `[整体修改] ${options.overrideContent}`,
          createdAt: Date.now(),
          provider: task.provider,
        });

        void persistSlideImageToR2(slide.id, imageUrl);

        return imageUrl;
      } catch (error) {
        console.error('[Global Edit Mode] 整体修改失败:', error);
        throw error;
      }
    }

    // 🎯 正常生成模式（无选区）
    // 
    // 非程序员解释 - 智能风格锚定机制：
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 问题：多页 PPT 如何保持品牌一致性，同时避免千篇一律？
    // 
    // 解决方案：智能锚定机制（Smart Anchoring）
    // 1. 第 1-2 页：使用风格模板的参考图（通常 6 张）
    // 2. 第 3 页开始：在参考图基础上，添加第 2 页生成的图片作为"锚定图片"
    //    - 例如：原本 6 张参考图 → 现在变成 7 张（第 2 页的图 + 原有 6 张）
    // 3. AI 会参考锚定图片，但分两类处理：
    //    ✅ 严格锚定：标题样式（位置、字体、字号、颜色）和整体配色
    //    ❌ 灵活调整：内容区域的布局（列表、图表、表格等根据内容选择）
    // 4. 结果：标题一致让人认出是同一套 PPT，但内容区域因页而异
    // 
    // 🎯 微调目标（2026-01-23）：
    // - 品牌一致性：标题样式统一
    // - 内容灵活性：布局根据信息需求调整
    // - 避免死板：不要所有页面看起来完全一样
    // 
    // ⚠️ 重要：风格一致性通过 anchorImageUrl（图片参考）实现
    //    不需要在 prompt 中添加"第几页"等文字说明
    //    文字说明可能会被 AI 渲染到图片上！
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
      // 🎯 传递 Deck 上下文以保持一致性
      // - currentSlide/totalSlides: 当前页码信息（仅用于后端日志）
      // - anchorImageUrl: 锚定图片 URL（第 3 页开始会传入第 1 页的 URL）
      deckContext:
        options?.index !== undefined && options?.total !== undefined
          ? {
              currentSlide: options.index + 1, // 从1开始计数
              totalSlides: options.total,
              anchorImageUrl: options.anchorImageUrl, // 🔑 核心：锚定图片
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
      throw new Error(t_aippt('v2.generation_timeout'));
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
    throw new Error(t_aippt('v2.generation_timeout'));
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
        throw new Error(
          errorData.error ||
            `${t_aippt('errors.general_failed')}: HTTP ${response.status}`
        );
      }

      // 读取流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error(t_aippt('errors.general_failed'));
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
        throw new Error(t_aippt('errors.invalid_outline'));
      }

      // 转换为 SlideData 格式
      return parsed.map((item: any, idx: number) => ({
        id: `slide-${Date.now()}-${idx}`,
        title:
          item.title || `${t_aippt('outline_step.slide_title')} ${idx + 1}`,
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
        toast.error(t_aippt('v2.step1_first'));
        return;
      }

      // 1. 检查积分 & 扣除 (自动模式将在生成后扣除)
      const costPerSlide = resolution === '4K' ? 12 : 6;
      let totalCost = slides.length * costPerSlide;

      try {
        await consumeCreditsAction({
          credits: totalCost,
          description: t_aippt('style_step.generating'),
        });
      } catch (err: any) {
        if (err.message.includes('Insufficient credits')) {
          toast.error(t_aippt('v2.insufficient_credits'));
          return;
        }
        throw err;
      }

      let workingSlides: SlideData[] = [...slides];

      let recordId = presentationRecordId;
      if (!recordId) {
        const record = await createPresentationAction({
          title: workingSlides[0]?.title || t_aippt('v2.title'),
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
      // 🎯 智能风格锚定机制 (Smart Style Anchoring)
      // ============================================================
      // 非程序员解释：
      // 
      // 问题：生成多页 PPT 时，如何保持品牌一致性，同时避免千篇一律？
      // 
      // 解决方案：使用"锚定图片"参考标题样式和整体风格，但内容区域灵活调整
      // 
      // 具体流程：
      // 1. 第 1 页（封面）：使用风格模板的参考图生成（6-8张参考图）
      // 2. 第 2 页（第一张内页）：同样使用风格模板的参考图生成
      // 3. 第 3 页开始：
      //    - 将第 2 页生成的图片作为"锚定图片"
      //    - 连同原有的风格参考图一起传递给 AI（共 7-9 张）
      //    - AI 会参考锚定图片的：
      //      ✅ 标题样式（位置、字体、字号、颜色）← 严格遵循
      //      ✅ 整体风格（配色方案、设计语言）← 严格遵循
      //      ❌ 内容区域布局（列表、图表等）← 根据内容灵活调整
      //    - 确保标题一致，但内容区域因页而异
      // 
      // 为什么选择第 2 页作为锚定源？
      // - 第 1 页通常是封面，排版与内页差异较大
      // - 第 2 页是第一张内页，更能代表整体 PPT 的视觉风格
      // 
      // 🎯 微调目标（2026-01-23）：
      // - 保持品牌一致性：标题样式让人一眼认出是同一套 PPT
      // - 优化信息传达：内容区域根据实际信息需求灵活设计
      // - 避免千篇一律：不要所有页面看起来像复制粘贴
      // 
      // ⚠️ 注意：锚定是通过传递图片 URL 实现的，不是通过文字指令！
      //    不要在 prompt 中添加类似"当前第 X 页"的文案，AI 会把它画到图片上！
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
              slide.title ===
                `${t_aippt('outline_step.slide_title')} ${i + 1}`);

          const resultUrl = await generateSlide(slide, {
            cachedStyleImages: sharedStyleImages,
            sourceContent: shouldUseSourceContent
              ? autoSourceRef.current
              : undefined,
            // ⚠️ 重要：index 和 total 仅用于后端日志，不会出现在 prompt 中
            index: i,
            total: workingSlides.length,
            // 🎯 风格锚定：从第 3 页（index 2）开始，传入第 2 页的图片作为锚定
            // - i = 0（第 1 页）: 无锚定，使用风格模板参考图
            // - i = 1（第 2 页）: 无锚定，使用风格模板参考图
            // - i >= 2（第 3 页起）: 使用 anchorImageUrl（第 2 页的图片）
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

          // 🎯 第 2 页（index 1）生成成功后，记录其 URL 作为后续页面的锚定参考
          // 非程序员解释：
          // - 第 2 页是第一张内页，代表了 PPT 的主要视觉风格
          // - 将它的 URL 保存下来，后续页面生成时会作为参考图传递给 AI
          // - 这样 AI 就能保持整个 PPT 的视觉一致性
          if (i === 1 && resultUrl) {
            anchorImageUrl = resultUrl;
            console.log('📌 风格锚定已设置（使用第 2 页作为参考）:', anchorImageUrl);
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
                description: `${t_aippt('v2.refund_failed_slide')}: ${slide.title || 'Untitled'}`,
              });
              toast.info(
                t_aippt('v2.refund_success_hint', {
                  title: slide.title,
                  cost: costPerSlide,
                })
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
          toast.error(t_aippt('errors.general_failed'));
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

      toast.success(t_aippt('v2.all_completed'));
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
      toast.error(t_aippt('v2.no_completed_slides'));
      return;
    }
    toast.loading(t_aippt('v2.packaging_images'), { id: 'zip' });
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
          // 🎯 使用代理避免 CORS 问题
          let blob: Blob;
          if (url.startsWith('data:')) {
            // 如果是 data URL（水印后的图片），直接转换
            const response = await fetch(url);
            blob = await response.blob();
          } else if (
            !url.startsWith('/') &&
            !url.startsWith(window.location.origin)
          ) {
            // 外部 URL，使用代理
            const buffer = await urlToBuffer(url);
            blob = new Blob([buffer], { type: 'image/png' });
          } else {
            // 本地 URL，直接 fetch
            const response = await fetch(url);
            blob = await response.blob();
          }
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
      toast.success(t_aippt('result_step.download_success'), { id: 'zip' });
    } catch (error) {
      console.error('zip error', error);
      toast.error(t_aippt('result_step.zip_creation_failed'), { id: 'zip' });
    }
  };

  /**
   * 🎯 导出为可编辑 PPTX - 完整版本
   * 流程：
   * 1. OCR 识别文字位置和样式
   * 2. 使用 inpainting 清理背景上的文字区域
   * 3. 将清理后的背景作为底层图片
   * 4. 在正确位置添加可编辑文本框
   */
  const handleDownloadPPTX = async () => {
    console.log('[PPTX Export] 🚀 开始导出流程...');

    const completed = slides.filter(
      (slide) => slide.status === 'completed' && slide.imageUrl
    );

    console.log('[PPTX Export] 找到已完成的幻灯片:', completed.length);

    if (completed.length === 0) {
      toast.error(t_aippt('v2.no_completed_slides'));
      return;
    }

    // 🎯 立即打开进度对话框
    console.log('[PPTX Export] 正在打开进度对话框...');

    // 🔧 显示 toast 提示确认代码执行
    toast.info('开始导出 PPTX，请稍候...');

    setPptxExportProgress({
      isOpen: true,
      currentSlide: 0,
      totalSlides: completed.length,
      currentStep: '正在初始化...',
      overallProgress: 0,
      logs: ['🚀 开始导出 PPTX...'],
    });

    // 🎯 关键：使用 requestAnimationFrame + 较长延迟确保 DOM 更新完成
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 500); // 增加延迟确保对话框完全渲染
        });
      });
    });
    console.log('[PPTX Export] 进度对话框应该已显示');

    const addLog = (msg: string) => {
      console.log(`[PPTX] ${msg}`);
      setPptxExportProgress((prev) => ({
        ...prev,
        logs: [...prev.logs.slice(-20), msg], // 保留最后20条日志
      }));
    };

    const updateProgress = (
      slideIndex: number,
      step: string,
      stepProgress: number
    ) => {
      // 每张幻灯片有4个主要步骤
      const stepsPerSlide = 4;
      const baseProgress = (slideIndex / completed.length) * 100;
      const stepIncrement =
        (1 / completed.length) * (stepProgress / stepsPerSlide) * 100;
      const overallProgress = Math.min(100, baseProgress + stepIncrement);

      setPptxExportProgress((prev) => ({
        ...prev,
        currentSlide: slideIndex + 1,
        currentStep: step,
        overallProgress: Math.round(overallProgress),
      }));
    };

    try {
      addLog(t_aippt('v2.pptx_export.loading_lib'));
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pres = new PptxGenJS();

      // 🎯 设置演示文稿尺寸（16:9）
      pres.layout = 'LAYOUT_16x9';
      const slideWidth = 10; // 英寸
      const slideHeight = 5.625; // 英寸

      addLog(`✅ ${t_aippt('v2.pptx_export.preparing_slides', { count: completed.length })}`);

      // 🎯 逐个处理幻灯片
      for (let i = 0; i < completed.length; i++) {
        const slide = completed[i];
        const pptSlide = pres.addSlide();
        let backgroundUrl = slide.imageUrl!;

        addLog(`========== ${t_aippt('v2.pptx_export.slide_progress', { current: i + 1, total: completed.length })} ==========`);

        // 🎯 步骤1: 先执行 OCR 识别文本
        updateProgress(i, t_aippt('v2.pptx_export.slide_progress', { current: i + 1, total: completed.length }), 0);
        addLog(`  ${t_aippt('v2.pptx_export.analyzing_text')}`);

        let ocrData: any = null;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          const response = await fetch('/api/ai/ocr-tencent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: slide.imageUrl }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            if (data?.success && data.blocks?.length > 0) {
              ocrData = data;
              addLog(`  ✅ ${t_aippt('v2.pptx_export.text_found', { count: data.blocks.length })}`);
            } else {
              addLog(`  ⚠️ ${t_aippt('v2.pptx_export.no_text_found')}`);
            }
          }
        } catch (e) {
          addLog(`  ⚠️ ${t_aippt('v2.pptx_export.processing_failed')}`);
        }

        // 🎯 步骤2: 用 OCR 结果精确移除文字（串行执行，确保精确性）
        addLog(`  ${t_aippt('v2.pptx_export.cleaning_background')}`);
        updateProgress(i, t_aippt('v2.pptx_export.cleaning_background'), 1);

        // 提取 OCR 识别出的所有文本内容
        const ocrTexts: string[] = ocrData?.blocks?.map((block: any) => block.text) || [];

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 120000);
          const response = await fetch('/api/image/inpaint-lama', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: slide.imageUrl,
              textBoxes: [],
              imageSize: { width: 1920, height: 1080 },
              ocrTexts: ocrTexts, // 传入 OCR 识别的文本，用于精确移除
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            if (data?.success && data.imageUrl) {
              backgroundUrl = data.imageUrl;
            }
          }
        } catch (e) {
          // 静默处理，使用原图
        }

        // 如果是第一张幻灯片且 OCR 失败，提示用户
        if (i === 0 && !ocrData?.blocks?.length) {
          addLog(`⚠️ ${t_aippt('v2.pptx_export.first_slide_warning')}`);
        }

        // 🎯 步骤3: 添加水印（如果开启）
        if (showWatermark) {
          addLog(t_aippt('v2.pptx_export.adding_watermark'));
          try {
            backgroundUrl = await addWatermarkToImage(
              backgroundUrl,
              watermarkText
            );
            addLog(`✅ ${t_aippt('v2.pptx_export.watermark_done')}`);
          } catch (wmError) {
            addLog(`⚠️ ${t_aippt('v2.pptx_export.watermark_failed')}`);
          }
        }

        // 🎯 步骤4: 将背景添加到 PPTX
        updateProgress(i, t_aippt('v2.pptx_export.building_slide'), 2);
        addLog(t_aippt('v2.pptx_export.building_slide'));
        console.log(
          `[PPTX Export] 步骤4: 处理背景图片 URL:`,
          backgroundUrl.substring(0, 80)
        );

        try {
          // 转换为 base64
          let imageData: string;
          if (backgroundUrl.startsWith('data:')) {
            imageData = backgroundUrl.split(',')[1];
          } else {
            let buffer: ArrayBuffer;
            console.log(`[PPTX Export] 开始下载图片...`);

            try {
              if (
                !backgroundUrl.startsWith('/') &&
                !backgroundUrl.startsWith(window.location.origin)
              ) {
                buffer = await urlToBuffer(backgroundUrl);
              } else {
                const response = await fetch(backgroundUrl);
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }
                buffer = await response.arrayBuffer();
              }
              console.log(
                `[PPTX Export] 图片下载完成，大小:`,
                buffer.byteLength
              );
            } catch (downloadError) {
              console.error(`[PPTX Export] 图片下载失败:`, downloadError);
              throw downloadError;
            }

            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunkSize = 0x8000;
            for (let j = 0; j < bytes.length; j += chunkSize) {
              const chunk = bytes.subarray(
                j,
                Math.min(j + chunkSize, bytes.length)
              );
              binary += String.fromCharCode.apply(null, Array.from(chunk));
            }
            imageData = btoa(binary);
          }

          // 添加背景图片
          pptSlide.addImage({
            data: `image/png;base64,${imageData}`,
            x: 0,
            y: 0,
            w: slideWidth,
            h: slideHeight,
          });
          console.log(`[PPTX Export] ✅ 背景图片已添加`);
        } catch (imgError) {
          console.error(`[PPTX Export] ❌ 背景图片处理失败:`, imgError);
          addLog(`⚠️ ${t_aippt('v2.pptx_export.processing_failed')}`);
          // 继续处理，不中断导出
        }

        // 🎯 步骤5: 添加可编辑文本框
        updateProgress(i, t_aippt('v2.pptx_export.adding_text'), 3);

        if (ocrData?.success && ocrData.blocks && ocrData.blocks.length > 0) {
          addLog(t_aippt('v2.pptx_export.adding_text'));

          const imgWidth = ocrData.imageSize?.width || 1920;
          const imgHeight = ocrData.imageSize?.height || 1080;

          for (const block of ocrData.blocks) {
            try {
              // 计算坐标
              const coords = calculatePPTXCoords(
                block.bbox,
                { width: imgWidth, height: imgHeight },
                slideWidth,
                slideHeight,
                block.alignment || 'left'
              );

              // 转换字号
              const fontSizePt = pxToPoint(block.fontSizePx || 24);

              // 处理颜色（OCR API 已根据背景亮度返回正确的颜色）
              let colorHex = (block.color || '#000000')
                .replace('#', '')
                .toUpperCase();
              if (!/^[0-9A-F]{6}$/i.test(colorHex)) {
                colorHex = '000000';
              }

              // 选择字体
              const hasChineseChar = /[\u4e00-\u9fa5]/.test(block.text);
              const fontFace = hasChineseChar ? 'Microsoft YaHei' : 'Arial';

              // 添加文本框
              // 注意：坐标直接使用 OCR 返回的精确位置，不添加额外系数
              // align 和 valign 设为 left/top 确保文字从左上角开始
              pptSlide.addText(block.text, {
                x: coords.x,
                y: coords.y,
                w: coords.w || 1,
                h: coords.h || 0.5,
                fontSize: fontSizePt,
                fontFace: fontFace,
                color: colorHex,
                bold: block.isBold || false,
                align: 'left', // 始终左对齐，因为 OCR bbox 已经是精确位置
                valign: 'top',
                autoFit: false,
                lineSpacingMultiple: block.lineHeight || 1.0,
                fill: { type: 'none' },
              });
            } catch (textError) {
              // 静默处理，不显示给用户
              console.warn(`Text box add failed: ${block.text?.substring(0, 20)}...`);
            }
          }
          addLog(`✅ ${t_aippt('v2.pptx_export.text_added', { count: ocrData.blocks.length })}`);
        }

        // 完成这张幻灯片
        updateProgress(i, t_aippt('v2.pptx_export.slide_progress', { current: i + 1, total: completed.length }), 4);
        console.log(
          `[PPTX Export] ✅ 幻灯片 ${i + 1}/${completed.length} 处理完成`
        );
      }

      // 🎯 所有幻灯片处理完毕，开始生成文件
      console.log('[PPTX Export] ========== 所有幻灯片处理完毕 ==========');
      addLog(t_aippt('v2.pptx_export.generating_file'));
      updateProgress(completed.length - 1, t_aippt('v2.pptx_export.generating_file'), 4);

      console.log('[PPTX Export] 正在调用 pres.write()...');
      const blob = (await pres.write({ outputType: 'blob' })) as Blob;
      console.log('[PPTX Export] pres.write() 完成，blob 大小:', blob.size);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `presentation-${Date.now()}.pptx`;
      link.click();
      URL.revokeObjectURL(downloadUrl);

      addLog(`✅ ${t_aippt('v2.pptx_export.complete')}`);

      // 延迟关闭对话框，让用户看到成功消息
      setTimeout(() => {
        setPptxExportProgress((prev) => ({ ...prev, isOpen: false }));
        toast.success(t_aippt('v2.pptx_success'));
      }, 1500);
    } catch (error) {
      console.error('PPTX export failed', error);
      addLog(`❌ ${t_aippt('v2.pptx_failed')}`);

      setTimeout(() => {
        setPptxExportProgress((prev) => ({ ...prev, isOpen: false }));
        toast.error(t_aippt('v2.pptx_failed'));
      }, 2000);
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
        title: `${t_aippt('v2.new_page')} ${prev.length + 1}`,
        content: t_aippt('v2.content_placeholder'),
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
      <p className="text-muted-foreground text-xs font-semibold tracking-[0.4em] uppercase">
        {label}
      </p>
      <h2 className="text-foreground text-2xl font-semibold">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );

  const renderStep1Input = () => (
    <Card className="border-border from-card/90 to-muted/90 text-foreground bg-gradient-to-b p-6 shadow-2xl dark:from-[#0E1424]/90 dark:to-[#06070D]/90">
      {renderStepTitle(
        `${t_aippt('v2.step_prefix')} 1`,
        t_aippt('v2.step1_title'),
        ' '
      )}
      <div className="space-y-4">
        <section className="space-y-3">
          <Tabs
            value={inputTab}
            onValueChange={(v) => setInputTab(v as any)}
            className="w-full"
          >
            <TabsList className="bg-muted text-foreground mb-4 grid grid-cols-3 rounded-xl">
              <TabsTrigger className="h-9 text-xs" value="text">
                {t_aippt('v2.tab_text')}
              </TabsTrigger>
              <TabsTrigger className="h-9 text-xs" value="upload">
                {t_aippt('v2.tab_upload')}
              </TabsTrigger>
              <TabsTrigger className="h-9 text-xs" value="link">
                {t_aippt('v2.tab_link')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text">
              <Textarea
                value={primaryInput}
                onChange={(e) => setPrimaryInput(e.target.value)}
                rows={8}
                placeholder={t_aippt('input_step.placeholder')}
                className="border-border bg-muted/50 text-foreground text-sm dark:bg-black/30"
              />
            </TabsContent>

            <TabsContent value="upload" className="space-y-3">
              <div
                className="border-border flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center"
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
                  {t_aippt('v2.upload_reference')}
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
                <div className="border-border bg-muted/50 rounded-xl border p-4 text-xs dark:bg-black/20">
                  <div className="text-muted-foreground mb-2 flex items-center justify-between">
                    <span>
                      {
                        t_aippt('input_step.files_selected_batch', {
                          count: uploadedFiles.length,
                          types: '',
                        }).split(':')[0]
                      }
                    </span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setUploadedFiles([])}
                    >
                      {t_aippt('v2.clear')}
                    </button>
                  </div>
                  <ScrollArea className="h-24 pr-2">
                    <div className="space-y-2">
                      {uploadedFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className="bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2 dark:bg-white/5"
                        >
                          <span className="text-foreground line-clamp-1">
                            {file.name}
                          </span>
                          <button
                            className="text-muted-foreground hover:text-destructive"
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
                className="border-border bg-muted/50 text-foreground dark:bg-black/30"
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
                    toast.success(t_aippt('v2.fetch_success'));
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
                    {t_aippt('v2.fetching')}
                  </>
                ) : linkPreview ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    {t_aippt('v2.fetch_success')}
                  </>
                ) : (
                  <>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {t_aippt('v2.fetch_web_content')}
                  </>
                )}
              </Button>
              {linkPreview && (
                <div className="border-border bg-muted/50 text-muted-foreground rounded-xl border p-4 text-xs dark:bg-black/20 dark:text-white/70">
                  {linkPreview}...
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>

        <section className="border-border mt-4 space-y-4 border-t pt-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-primary text-[11px] font-bold tracking-wider uppercase">
              {t_aippt('v2.page_count')}
            </h3>
            <span className="text-muted-foreground text-xs font-medium">
              {pageMode === 'auto'
                ? t_aippt('v2.language_auto')
                : `${slideCount} ${t_aippt('v2.pages')}`}
            </span>
          </div>

          {/* Toggle Buttons */}
          <div className="bg-muted flex rounded-xl p-1 dark:bg-black/40">
            <button
              onClick={() => setPageMode('auto')}
              className={cn(
                'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all',
                pageMode === 'auto'
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t_aippt('v2.auto_mode')}
            </button>
            <button
              onClick={() => setPageMode('fixed')}
              className={cn(
                'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all',
                pageMode === 'fixed'
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t_aippt('v2.fixed_mode')}
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
              max="50"
              step="1"
              value={slideCount}
              onChange={(e) => setSlideCount(e.target.value)}
              className="accent-primary [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:bg-primary h-0.5 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-300 dark:bg-white/10 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-lg [&::-moz-range-track]:bg-gray-300 dark:[&::-moz-range-track]:bg-white/10 [&::-webkit-slider-runnable-track]:h-0.5 [&::-webkit-slider-runnable-track]:rounded-lg [&::-webkit-slider-runnable-track]:bg-gray-300 dark:[&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-thumb]:-mt-1.75 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm"
            />
            <input
              type="number"
              min="1"
              max="50"
              value={slideCount}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) {
                  setSlideCount(String(Math.min(50, Math.max(1, val))));
                }
              }}
              className="border-border bg-muted text-foreground focus:border-primary/50 h-8 w-12 rounded-lg border text-center text-xs font-bold outline-none dark:bg-black/40"
            />
          </div>

          {/* Start Pagination Button */}
          <Button
            className="bg-primary text-primary-foreground shadow-primary/20 hover:bg-primary/90 h-10 w-full rounded-xl shadow-lg"
            onClick={handleAutoPaginate}
            disabled={isAnalyzing || isParsingFiles || isFetchingLink}
          >
            {isAnalyzing || isParsingFiles ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t_aippt('v2.pagination_in_progress')}
              </>
            ) : (
              <>
                {/* 显示自动分页功能消耗的积分额度：3积分 */}
                <CreditsCost
                  credits={3}
                  className="bg-primary-foreground/20 text-primary-foreground mr-2"
                />
                {t_aippt('v2.start_pagination')}
              </>
            )}
          </Button>
        </section>

        {(parsingProgress || completion) && (
          <ScrollArea
            ref={logRef as any}
            className="border-border bg-muted/50 text-muted-foreground h-40 w-full rounded-xl border p-4 text-xs dark:bg-black/25 dark:text-white/70"
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
            <h3 className="text-foreground text-sm font-semibold tracking-wide">
              {t_aippt('v2.outline')}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              onClick={handleAddSlide}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t_aippt('v2.add_slide')}
            </Button>
          </div>
          {slides.length === 0 ? (
            <Card className="border-border bg-muted/50 text-muted-foreground border-dashed p-5 text-xs dark:bg-black/20 dark:text-white/55">
              {t_aippt('v2.no_outline')}
            </Card>
          ) : (
            <div className="space-y-4">
              {slides.map((slide, idx) => (
                <div
                  key={slide.id}
                  className="border-border bg-muted/50 rounded-2xl border p-4 dark:bg-black/20"
                >
                  <div className="text-muted-foreground mb-2 flex items-center justify-between text-[11px] tracking-[0.2em] uppercase">
                    <span>
                      {t_aippt('outline_step.slide_title')} {idx + 1} ·{' '}
                      {
                        {
                          pending: t_aippt('result_step.status.pending'),
                          generating: t_aippt('result_step.status.generating'),
                          completed: t_aippt('result_step.download_success'),
                          failed: t_aippt('result_step.status.failed'),
                        }[slide.status]
                      }
                    </span>
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveSlide(slide.id)}
                    >
                      {t_aippt('v2.remove')}
                    </button>
                  </div>
                  <Input
                    value={slide.title}
                    onChange={(e) =>
                      handleSlideChange(slide.id, 'title', e.target.value)
                    }
                    className="border-border bg-muted/50 text-foreground mb-3 dark:bg-black/30"
                  />
                  <Textarea
                    value={slide.content}
                    onChange={(e) =>
                      handleSlideChange(slide.id, 'content', e.target.value)
                    }
                    rows={4}
                    className="border-border bg-muted/30 text-foreground text-sm dark:bg-black/20"
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
    <Card className="border-border from-card/90 to-muted/90 text-foreground bg-gradient-to-b p-6 shadow-2xl dark:from-[#0A1427]/90 dark:to-[#05080F]/90">
      {renderStepTitle(
        `${t_aippt('v2.step_prefix')} 2`,
        t_aippt('v2.step2_title'),
        ' '
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-muted-foreground text-xs">
              {t_aippt('v2.output_ratio')}
            </Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="border-border bg-muted/50 text-foreground mt-1 dark:bg-black/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground dark:bg-black/90">
                {PPT_RATIOS.map((ratio) => (
                  <SelectItem key={ratio.value} value={ratio.value}>
                    {ratio.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">
              {t_aippt('v2.resolution')}
            </Label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger className="border-border bg-muted/50 text-foreground mt-1 dark:bg-black/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground dark:bg-black/90">
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
            <Label className="text-muted-foreground text-xs">
              {t_aippt('v2.language')}
            </Label>
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v as any)}
            >
              <SelectTrigger className="border-border bg-muted/50 text-foreground mt-1 dark:bg-black/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground dark:bg-black/90">
                <SelectItem value="auto">
                  {t_aippt('v2.language_auto')}
                </SelectItem>
                <SelectItem value="zh">{t_aippt('v2.language_zh')}</SelectItem>
                <SelectItem value="en">{t_aippt('v2.language_en')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">
              {t_aippt('v2.content_control')}
            </Label>
            <Select
              value={contentControl}
              onValueChange={(v) => setContentControl(v as any)}
            >
              <SelectTrigger className="border-border bg-muted/50 text-foreground mt-1 h-10 rounded-xl dark:bg-black/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground dark:bg-black/90">
                <SelectItem value="expand">
                  {t_aippt('v2.expand_content')}
                </SelectItem>
                <SelectItem value="strict">
                  {t_aippt('v2.strict_outline')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label className="text-muted-foreground text-xs">
              {t_aippt('v2.title_position')}
            </Label>
            <div className="mt-2 flex gap-2">
              {(['left', 'center'] as const).map((align) => (
                <button
                  key={align}
                  className={cn(
                    'flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-all',
                    innerTitleAlign === align
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-foreground dark:bg-black/30 dark:text-white/60'
                  )}
                  onClick={() => setInnerTitleAlign(align)}
                >
                  {align === 'left' ? t_aippt('v2.left') : t_aippt('v2.center')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-muted-foreground flex items-center justify-between text-[11px] tracking-[0.2em] uppercase">
            <span>{t_aippt('v2.style_library')}</span>
            <span>
              {t_aippt('v2.styles_count', {
                count: SLIDES2_STYLE_PRESETS.length,
              })}
            </span>
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
                      : 'border-border bg-muted/50 hover:border-primary/50 dark:bg-black/30 dark:hover:border-white/30'
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
                      'from-background/80 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-2 pt-6 transition-opacity dark:from-black/80',
                      selectedStyleId === style.id
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    )}
                  >
                    <p className="text-foreground truncate text-[11px] font-medium">
                      {style.title}
                    </p>
                  </div>
                  {selectedStyleId === style.id && (
                    <div className="bg-primary text-primary-foreground absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full shadow-lg">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div>
          <p className="text-muted-foreground text-[11px] tracking-[0.2em] uppercase">
            {t_aippt('v2.custom_style')}
          </p>
          <Textarea
            value={customStylePrompt}
            onChange={(e) => {
              setCustomStylePrompt(e.target.value);
              if (e.target.value.trim()) setSelectedStyleId(null);
            }}
            rows={2}
            placeholder={t_aippt('v2.style_placeholder')}
            className="border-border bg-muted/50 text-foreground mt-2 dark:bg-black/30"
          />
        </div>

        <div>
          <p className="text-muted-foreground text-[11px] tracking-[0.2em] uppercase">
            {t_aippt('v2.reference_images')}
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
                    toast.error(t_aippt('v2.upload_reference_limit'));
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
              <div className="border-border bg-muted/50 text-muted-foreground hover:border-primary/50 hover:text-foreground flex h-full w-full items-center justify-center rounded-xl border border-dashed transition-colors dark:bg-black/30 dark:text-white/40 dark:hover:border-white/40 dark:hover:text-white/60">
                <Plus className="h-6 w-6" />
              </div>
            </div>

            {customImages.map((src, idx) => (
              <div
                key={`${src}-${idx}`}
                className="group border-border relative aspect-square overflow-hidden rounded-xl border"
              >
                <img src={src} className="h-full w-full object-cover" />
                <div className="bg-background/80 absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 dark:bg-black/40">
                  <button
                    className="bg-destructive/80 text-destructive-foreground hover:bg-destructive rounded-full p-1.5 transition-colors"
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
        <div className="border-border mt-6 space-y-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-foreground text-sm font-semibold">
                {t_aippt('v2.watermark_control')}
              </Label>
              <p className="text-muted-foreground text-xs">
                {t_aippt('v2.watermark_vip_hint')}
              </p>
            </div>
            <Switch
              checked={showWatermark}
              onCheckedChange={(checked) => {
                if (!isVip) {
                  toast.info(t('membership_required'));
                  return;
                }
                setShowWatermark(checked);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">
              {t_aippt('v2.watermark_text')}
            </Label>
            <Input
              value={watermarkText}
              onChange={(e) => {
                if (!isVip) {
                  toast.info(t('membership_required'));
                  return;
                }
                setWatermarkText(e.target.value);
              }}
              placeholder={t_aippt('v2.watermark_text')}
              disabled={!isVip}
              className="border-border bg-muted/50 text-foreground text-xs dark:bg-black/30"
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
            <div className="bg-muted text-foreground mr-2 rounded-full px-3 py-1 text-sm font-semibold">
              ?
            </div>
          ) : (
            <CreditsCost
              credits={slides.length * (resolution === '4K' ? 12 : 6)}
              className="bg-muted text-foreground mr-2"
            />
          )}
          {t_aippt('v2.one_click_generate')}
        </Button>
      </div>
    </Card>
  );

  const renderSlideCard = (slide: SlideData, index: number) => {
    // 🎯 使用 slide 内置的 history（持久化），同时兼容旧的 slideHistories
    const histories = slide.history || slideHistories[slide.id] || [];

    return (
      <Card
        key={slide.id}
        className="bg-card/50 overflow-hidden p-4 dark:bg-white/[0.03]"
      >
        <div className="text-muted-foreground mb-3 flex items-center justify-between text-xs tracking-[0.2em] uppercase">
          <span className="text-foreground">
            {t_aippt('outline_step.slide_title')} {index + 1}
          </span>
          <Badge
            variant="outline"
            className={cn(
              'border-border text-[10px]',
              slide.status === 'completed' &&
                'border-emerald-400 text-emerald-600 dark:text-emerald-200',
              slide.status === 'failed' &&
                'border-destructive text-destructive',
              slide.status === 'generating' && 'border-primary text-primary'
            )}
          >
            {
              {
                pending: t_aippt('result_step.status.pending'),
                generating: t_aippt('result_step.status.generating'),
                completed: t_aippt('result_step.download_success'),
                failed: t_aippt('result_step.status.failed'),
              }[slide.status]
            }
          </Badge>
        </div>
        <div className="border-border bg-muted/50 relative aspect-[16/9] overflow-hidden rounded-2xl border dark:bg-black/20">
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
                <div className="bg-background/80 text-muted-foreground absolute right-3 bottom-3 z-10 rounded px-2 py-1 text-[10px] font-medium backdrop-blur-sm dark:bg-black/40 dark:text-white/60">
                  {watermarkText}
                </div>
              )}
            </div>
          ) : slide.status === 'generating' ? (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center text-sm">
              <Loader2 className="mb-2 h-6 w-6 animate-spin" />
              {t_aippt('v2.generating')}
            </div>
          ) : slide.status === 'failed' ? (
            <div className="text-destructive flex h-full flex-col items-center justify-center text-sm">
              {t_aippt('errors.generation_failed')}
            </div>
          ) : (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center text-sm">
              {t_aippt('result_step.status.pending')}
            </div>
          )}
        </div>

        {/* 🎯 历史记录缩略图区域 */}
        <div className="mt-3 flex items-center gap-2">
          {/* 历史缩略图滚动区域 */}
          <div className="flex-1 overflow-hidden">
            {/* 🎯 始终显示历史区域，包含原始图和编辑历史 */}
            <div className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/20 flex gap-2 overflow-x-auto pb-1">
              {/* 🎯 首先显示所有编辑历史（新的在前） */}
              {histories.map((entry, historyIndex) => (
                <button
                  key={entry.id}
                  className={cn(
                    'group hover:border-primary relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all',
                    slide.imageUrl === entry.imageUrl
                      ? 'border-primary shadow-[0_0_0_2px_rgba(139,108,255,0.3)]'
                      : 'border-border/50 hover:border-primary/60'
                  )}
                  onClick={() => {
                    // 切换到历史版本
                    setSlides((prev) =>
                      prev.map((s) =>
                        s.id === slide.id
                          ? { ...s, imageUrl: entry.imageUrl }
                          : s
                      )
                    );
                  }}
                  title={`版本 ${histories.length - historyIndex} - ${new Date(entry.createdAt).toLocaleString()}`}
                >
                  <img
                    src={entry.imageUrl}
                    alt={`历史版本 ${historyIndex + 1}`}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  {/* 版本标记 */}
                  <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5">
                    <span className="text-[8px] font-medium text-white">
                      v{histories.length - historyIndex}
                    </span>
                  </div>
                  {/* 当前选中标记 - 只用边框高亮，不用蒙版 */}
                  {slide.imageUrl === entry.imageUrl && (
                    <div className="absolute top-0.5 right-0.5">
                      <Check className="text-primary h-3 w-3 drop-shadow-md" />
                    </div>
                  )}
                </button>
              ))}
              {/* 🎯 如果没有编辑历史但有当前图片，显示当前图作为"原始版本" */}
              {histories.length === 0 && slide.imageUrl && (
                <div
                  className="border-primary relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border-2 shadow-[0_0_0_2px_rgba(139,108,255,0.3)]"
                  title="原始版本"
                >
                  <img
                    src={slide.imageUrl}
                    alt="原始版本"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5">
                    <span className="text-[8px] font-medium text-white">
                      原始
                    </span>
                  </div>
                  <div className="absolute top-0.5 right-0.5">
                    <Check className="text-primary h-3 w-3 drop-shadow-md" />
                  </div>
                </div>
              )}
              {/* 如果没有图片，显示空状态 */}
              {!slide.imageUrl && histories.length === 0 && (
                <div className="text-muted-foreground/50 flex h-12 items-center text-xs">
                  {t_aippt('v2.no_history')}
                </div>
              )}
            </div>
          </div>

          {/* 编辑按钮 */}
          <Button
            variant="outline"
            size="sm"
            className="h-10 flex-shrink-0 rounded-xl px-4 text-xs"
            onClick={() => openEditDialog(slide)}
            disabled={slide.status === 'generating'}
          >
            <WandSparkles className="mr-1.5 h-4 w-4" />
            {t_aippt('v2.edit')}
          </Button>
        </div>
      </Card>
    );
  };

  const renderStep3Preview = () => (
    <div className="space-y-4">
      <Card className="border-border from-card/90 to-muted/90 text-foreground bg-gradient-to-b p-5 shadow-2xl dark:from-[#0B0F1D]/90 dark:to-[#040609]/90">
        {renderStepTitle(
          `${t_aippt('v2.step_prefix')} 3`,
          t_aippt('v2.step3_title'),
          ' '
        )}
        <div className="border-border bg-muted/50 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 dark:bg-black/20">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-4 text-xs"
              onClick={handleDownloadPDF}
            >
              <FileText className="mr-2 h-4 w-4" />
              {t_aippt('v2.download_pdf')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-4 text-xs"
              onClick={handleDownloadImages}
            >
              <Images className="mr-2 h-4 w-4" />
              {t_aippt('v2.download_images')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-4 text-xs"
              onClick={handleDownloadPPTX}
            >
              <Download className="mr-2 h-4 w-4" />
              {t_aippt('v2.export_pptx')}
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
            {t('presentation_history')}
          </Button>
        </div>
        {autoPlanning && (
          <div className="border-border bg-muted/50 text-muted-foreground mb-4 rounded-xl border border-dashed px-4 py-3 text-sm dark:bg-black/20 dark:text-white/70">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            {t_aippt('v2.planning_pages')}
          </div>
        )}
        {slides.length === 0 ? (
          <Card className="border-border bg-muted/50 text-muted-foreground border-dashed p-10 text-center text-sm dark:bg-white/[0.03] dark:text-white/55">
            {t_aippt('v2.waiting_for_generation')}
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
              className="bg-background/90 absolute top-1 left-1 rounded px-1 text-[10px] dark:bg-black/70"
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
            className="border-primary/70 absolute border-2 border-dashed"
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
              : 'border-border bg-muted/30 dark:bg-white/[0.02]'
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
              className="text-muted-foreground hover:text-destructive text-xs transition-colors"
              onClick={() =>
                setEditRegions((prev) =>
                  prev.filter((item) => item.id !== region.id)
                )
              }
            >
              {t_aippt('v2.remove')}
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
            placeholder="描述此区域的修改需求..."
            className="border-border bg-background/50 text-foreground ring-offset-background placeholder:text-muted-foreground/60 focus:border-primary focus:ring-primary/20 w-full resize-none rounded-lg border p-3 text-xs transition-all focus:ring-2 focus:outline-none dark:bg-black/30 dark:text-white/80 dark:placeholder:text-white/30"
          />
          {/* 上传参考图 */}
          <div className="mt-2">
            <label className="border-border bg-muted/20 text-muted-foreground hover:border-primary/50 hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs transition-all dark:bg-white/[0.01] dark:hover:bg-white/[0.03]">
              <Upload className="h-3.5 w-3.5" />
              <span>上传参考图</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
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
              />
            </label>
          </div>
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
          className="border-border text-muted-foreground hover:border-primary/50 hover:text-foreground w-full border-dashed text-xs"
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
          {t_aippt('v2.add_region_button')}
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
            <DialogTitle>
              {t_aippt('v2.history_title', { title: slide?.title || '' })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {records.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t_aippt('v2.no_history')}
              </p>
            ) : (
              records.map((entry) => (
                <div
                  key={entry.id}
                  className="border-border bg-card flex gap-4 rounded-xl border p-3"
                >
                  <img
                    src={entry.imageUrl}
                    className="h-24 w-40 rounded-lg object-cover"
                  />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                    <p className="text-muted-foreground line-clamp-3 text-xs">
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
                        {t_aippt('result_step.download')}
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
                        {t_aippt('v2.set_current')}
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
        <DialogContent 
          size="full"
          className="border-border bg-background/98 h-[90vh] w-[90vw] max-w-[1800px] gap-0 overflow-hidden p-0 shadow-[0_0_100px_rgba(0,0,0,0.8)] backdrop-blur-3xl dark:bg-[#0E1424]/98"
        >
          <div className="flex h-full flex-col overflow-hidden">
            {/* 移除了顶部标题栏，保留 DialogContent 默认的关闭按钮 */}
            
            <div className="grid h-0 min-h-full overflow-hidden lg:grid-cols-[5fr_520px] lg:grid-rows-[minmax(0,1fr)]">
              {/* 左侧：视觉编辑核心区（增加了宽度比例：从 5fr 改为 7fr，右侧从 380px 改为 340px） */}
              <div className="bg-muted/30 flex flex-col overflow-hidden p-6 dark:bg-black/40">
                <div className="flex flex-1 flex-col gap-6 overflow-hidden">
                  {/* 1. 待编辑图片 - 撑满宽度 */}
                  <div className="relative flex min-h-120 flex-1 flex-col">
                    <div
                      ref={editCanvasRef}
                      className="group hover:border-primary/20 border-border bg-muted/50 relative h-full w-full cursor-crosshair overflow-hidden rounded-2xl border shadow-lg transition-all dark:bg-black/60 dark:shadow-[0_40px_100px_rgba(0,0,0,0.6)]"
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
                        <div className="text-muted-foreground/50 flex h-full flex-col items-center justify-center space-y-4">
                          <Images className="h-16 w-16 opacity-10" />
                        </div>
                      )}
                      {renderRegionsOverlay()}
                    </div>
                  </div>

                  {/* 2. 整体修改区 - 针对整个画面的修改 */}
                  <div className="border-border bg-card/50 shrink-0 space-y-3 rounded-xl border p-4 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <Label className="text-foreground text-sm font-medium">
                        整体修改
                      </Label>
                      <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-[10px] font-medium">
                        全局
                      </span>
                    </div>
                    <div className="relative">
                      <Textarea
                        value={editingPrompt}
                        onChange={(e) => setEditingPrompt(e.target.value)}
                        rows={3}
                        className="border-border bg-background/50 text-foreground ring-offset-background placeholder:text-muted-foreground/60 focus:border-primary focus:ring-primary/20 min-h-[80px] w-full resize-none rounded-xl border p-4 text-sm leading-relaxed transition-all focus:ring-2 focus:outline-none dark:bg-black/30 dark:text-white/90 dark:placeholder:text-white/30"
                        placeholder="描述针对整个画面的修改需求，如：把整体色调改为暖色系、增加科技感氛围..."
                      />
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      无需框选区域，直接输入修改描述即可对整张图进行调整
                    </p>
                  </div>
                </div>
              </div>

              {/* 右侧：指令侧边栏 - 固定三段式布局 */}
              <div className="border-border bg-muted/20 flex h-0 min-h-full flex-col border-l dark:bg-[#0A0D18]/50">
                {/* 顶部标题区域 - 固定不滚动 */}
                <div className="flex-none border-b border-border/50 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Crop className="text-primary h-4 w-4" />
                    <Label className="text-foreground text-sm font-medium">
                      {t_aippt('v2.edit_dialog_title')}
                    </Label>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    {t_aippt('v2.edit_dialog_desc')}
                  </p>
                </div>

                {/* 中间可滚动区域 - 强制滚动 */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  <div className="space-y-4 p-5">
                    {editRegions.length === 0 ? (
                      <div className="border-border bg-muted/30 flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center dark:bg-white/[0.01]">
                        <Crop className="text-muted-foreground/30 mb-3 h-8 w-8 dark:text-white/20" />
                        <p className="text-muted-foreground text-xs dark:text-white/40">
                          {t_aippt('v2.drag_to_select')}
                        </p>
                        <p className="text-muted-foreground/60 mt-1 text-[10px]">
                          在左侧图片上拖拽框选区域
                        </p>
                      </div>
                    ) : (
                      renderRegionList()
                    )}
                  </div>
                </div>

                {/* 底部按钮区域 - 固定在底部不滚动 */}
                <div className="border-border bg-muted/30 flex-none border-t px-5 py-3 dark:bg-[#080A12]">
                  <Button
                    className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 w-full rounded-xl text-base font-semibold transition-all active:scale-[0.98]"
                    disabled={pendingEditSubmit}
                    onClick={async () => {
                      if (!editingSlide) return;
                      setPendingEditSubmit(true);
                      toast.loading(t_aippt('v2.generating'), {
                        id: editingSlide.id,
                      });
                      try {
                        // 🎯 判断编辑模式：
                        // - 有选区 → 局部编辑
                        // - 无选区但有整体修改提示词 → 整体修改
                        const hasRegions = editRegions.length > 0;
                        const hasGlobalPrompt = editingPrompt.trim().length > 0;

                        await generateSlide(editingSlide, {
                          overrideContent: editingPrompt,
                          regions: editRegions,
                          // 🎯 无选区但有提示词时，启用整体修改模式
                          isGlobalEdit: !hasRegions && hasGlobalPrompt,
                        });
                        toast.success(t_aippt('result_step.download_success'), {
                          id: editingSlide.id,
                        });

                        // 🎯 编辑成功后，保存更新后的 slides 到数据库（包含历史记录）
                        if (presentationRecordId) {
                          // 使用 setTimeout 确保 state 更新完成，然后通过 ref 获取最新状态
                          setTimeout(async () => {
                            try {
                              // 使用 ref 获取最新的 slides 状态
                              const currentSlides = slidesRef.current;
                              await updatePresentationAction(
                                presentationRecordId,
                                {
                                  content: JSON.stringify(currentSlides),
                                }
                              );
                              console.log('[Edit] 历史记录已保存到数据库');
                            } catch (saveError) {
                              console.error(
                                '[Edit] 保存历史记录失败:',
                                saveError
                              );
                            }
                          }, 500);
                        }
                      } catch (error) {
                        handleApiError(error);
                        toast.error(t_aippt('result_step.status.failed'), {
                          id: editingSlide.id,
                        });
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
                    {t_aippt('v2.re_generate')}
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
    const title = t_aippt('v2.presentation_detail');
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
              {t_aippt('v2.back_to_library')}
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
                {initialPresentation?.title ||
                  t_aippt('v2.presentation_detail')}
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
              {t_aippt('v2.download_pdf')}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl px-6"
              onClick={handleDownloadPPTX}
            >
              <Download className="mr-2 h-4 w-4" />
              {t_aippt('v2.export_pptx')}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl px-6"
              onClick={handleDownloadImages}
            >
              <Images className="mr-2 h-4 w-4" />
              {t_aippt('v2.download_images')}
            </Button>
            <Button
              className="h-11 rounded-xl px-8 font-bold"
              onClick={() => setViewMode('studio')}
            >
              <WandSparkles className="mr-2 h-4 w-4" />
              {t_aippt('v2.edit_in_studio')}
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
                        onClick={() => setLightboxUrl(slide.imageUrl!)}
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
                      {t_aippt('v2.no_images_generated')}
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
              className="bg-background/95 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm dark:bg-black/90"
              onClick={() => setLightboxUrl(null)}
            >
              <button
                className="hover:text-primary text-foreground absolute top-6 right-6"
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
        <div className="bg-background text-foreground min-h-screen dark:bg-[#030409]">
          <div className="mx-auto max-w-[1500px] px-4 pt-24 pb-12 lg:px-8">
            <div className="relative mb-10 flex items-center justify-center">
              <h1 className="from-foreground via-foreground/80 to-foreground/60 bg-gradient-to-r bg-clip-text text-4xl font-bold text-transparent md:text-5xl dark:from-white dark:via-slate-100 dark:to-slate-400">
                {t_aippt('v2.title')}
              </h1>
              {presentationId && (
                <Button
                  variant="ghost"
                  onClick={() => setViewMode('preview')}
                  className="text-muted-foreground hover:text-foreground absolute right-0"
                >
                  {t_aippt('v2.back_to_preview')}
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
              className="bg-background/95 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm dark:bg-black/90"
              onClick={() => setLightboxUrl(null)}
            >
              <button
                className="hover:text-primary text-foreground absolute top-6 right-6"
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

      {/* 🎯 PPTX 导出进度对话框 - 移到顶层确保在所有视图模式下都可见 */}
      <Dialog
        open={pptxExportProgress.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPptxExportProgress((prev) => ({ ...prev, isOpen: false }));
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              导出可编辑 PPTX
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 总体进度 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  幻灯片 {pptxExportProgress.currentSlide}/
                  {pptxExportProgress.totalSlides}
                </span>
                <span className="font-medium">
                  {pptxExportProgress.overallProgress}%
                </span>
              </div>
              <Progress
                value={pptxExportProgress.overallProgress}
                className="h-3"
              />
            </div>

            {/* 当前步骤 */}
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="text-primary h-4 w-4 animate-spin" />
              <span>{pptxExportProgress.currentStep}</span>
            </div>

            {/* 日志滚动区域 */}
            <div className="border-border bg-muted/30 rounded-lg border p-3">
              <ScrollArea className="h-48">
                <div className="space-y-1 font-mono text-xs">
                  {pptxExportProgress.logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'py-0.5',
                        log.includes('✅') &&
                          'text-green-600 dark:text-green-400',
                        log.includes('❌') && 'text-red-600 dark:text-red-400',
                        log.includes('⚠️') &&
                          'text-yellow-600 dark:text-yellow-400',
                        log.includes('===') && 'text-foreground font-semibold'
                      )}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setPptxExportProgress((prev) => ({ ...prev, isOpen: false }))
              }
              disabled={
                pptxExportProgress.overallProgress < 100 &&
                pptxExportProgress.overallProgress > 0
              }
            >
              {pptxExportProgress.overallProgress >= 100 ? '关闭' : '取消'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
