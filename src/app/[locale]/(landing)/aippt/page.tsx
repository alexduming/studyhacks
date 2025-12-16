'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createKieTaskAction,
  parseFileAction,
  queryKieTaskAction,
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
  Check,
  Copy,
  Download,
  Eye,
  FileIcon,
  FileText,
  Images,
  Layers,
  Loader2,
  Paperclip,
  Play,
  Plus,
  Presentation,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { PPT_RATIOS, PPT_SIZES, PPT_STYLES } from '@/config/aippt';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';

// Types
interface SlideData {
  id: string;
  title: string;
  content: string;
  visualDescription: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  imageUrl?: string;
  taskId?: string;
}

type Step = 'input' | 'outline' | 'style' | 'result';

export default function AIPPTPage() {
  const t = useTranslations('aippt');
  const router = useRouter();
  const searchParams = useSearchParams();
  const presentationId = searchParams.get('id');

  // Load presentation if ID is present
  useEffect(() => {
    if (presentationId) {
      const loadData = async () => {
        try {
          const data = await getPresentationAction(presentationId);
          if (data && data.content) {
            const parsedSlides = JSON.parse(data.content);
            setSlides(parsedSlides);
            setCurrentStep('result');
            if (data.styleId) setSelectedStyleId(data.styleId);
          }
        } catch (e) {
          console.error('Failed to load presentation', e);
          toast.error('Failed to load presentation');
        }
      };
      loadData();
    }
  }, [presentationId]);

  // --- State ---
  const [currentStep, setCurrentStep] = useState<Step>('input');

  // Input Step State
  const [inputMode, setInputMode] = useState('text');
  const [inputText, setInputText] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [slideCount, setSlideCount] = useState<string>('1'); // Default 8 slides
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null); // For auto-scroll inside log container

  // Outline Step State
  const [slides, setSlides] = useState<SlideData[]>([]);
  // bottomRef removed as we don't want page scroll

  // Style Step State
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [customImages, setCustomImages] = useState<string[]>([]); // Base64 for preview
  const [customImageFiles, setCustomImageFiles] = useState<File[]>([]); // Actual files for upload
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('4K');
  const [isGenerating, setIsGenerating] = useState(false);

  // Result State
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // --- Streaming Hook ---
  const {
    complete,
    completion,
    isLoading: isAnalyzing,
    setCompletion,
  } = useCompletion({
    api: '/api/ai/analyze-ppt',
    streamProtocol: 'text', // 使用文本流协议而不是数据流协议
    body: {
      slideCount: parseInt(slideCount),
    },
    onFinish: (prompt, result) => {
      console.log('[Frontend] Stream finished, result length:', result.length);
      console.log('[Frontend] Raw result:', result.substring(0, 200));

      try {
        // Clean up code blocks if present
        let cleanJson = result
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();
        // Find array start/end if extra text exists
        const startIndex = cleanJson.indexOf('[');
        const endIndex = cleanJson.lastIndexOf(']');
        if (startIndex !== -1 && endIndex !== -1) {
          cleanJson = cleanJson.substring(startIndex, endIndex + 1);
        }

        console.log(
          '[Frontend] Attempting to parse:',
          cleanJson.substring(0, 200)
        );
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed)) {
          const initialSlides: SlideData[] = parsed.map(
            (item: any, idx: number) => ({
              id: `slide-${Date.now()}-${idx}`,
              title: item.title,
              content: item.content,
              visualDescription: item.visualDescription,
              status: 'pending',
            })
          );
          setSlides(initialSlides);
          console.log(
            '[Frontend] Successfully parsed',
            initialSlides.length,
            'slides'
          );
          // Auto advance to outline step on success
          setTimeout(() => setCurrentStep('outline'), 1000);
        } else {
          console.error('[Frontend] Parsed result is not an array:', parsed);
          toast.error(t('errors.invalid_outline'));
        }
      } catch (e: any) {
        console.error('[Frontend] Parse Error:', e);
        console.error('[Frontend] Failed content:', result);
        toast.error(t('errors.invalid_outline') + ': ' + e.message);
      }
    },
    onError: (err) => {
      console.error('[Frontend] Stream Error:', err);
      toast.error(t('errors.general_failed') + ': ' + err.message);
    },
  });

  // Auto-scroll for streaming output (Container ONLY)
  useEffect(() => {
    if (logContainerRef.current) {
      const { scrollHeight, clientHeight } = logContainerRef.current;
      // Only auto-scroll if we are near the bottom to allow user to scroll up to read history
      // or just force it for "terminal" feel. Let's force it for now as it's a log.
      logContainerRef.current.scrollTop = scrollHeight - clientHeight;
    }
  }, [completion]);

  // Effect to attempt parsing streaming partial JSON (optional visual candy)
  // slidedeck does this, showing the outline building up.
  // For simplicity, we can just show the raw text stream for now,
  // or implementing a robust partial parser (which is complex).
  // We'll stick to showing the raw stream "Matrix style" as requested.

  // --- Helpers ---
  // Helper to compress image before upload
  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
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

  // Helper to convert Blob to Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Upload image to cloud storage and get public URL (with compression)
  const uploadImageToStorage = async (
    blob: Blob,
    filename: string
  ): Promise<string> => {
    // Compress if it's a large image (e.g. > 1MB)
    let finalBlob = blob;
    if (blob.size > 1024 * 1024 && blob instanceof File) {
      try {
        finalBlob = await compressImage(blob as File);
        // Change extension to .jpg since we compress to jpeg
        filename = filename.replace(/\.[^/.]+$/, '.jpg');
      } catch (e) {
        console.warn('Image compression failed, using original', e);
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

  // Convert relative URL to absolute URL
  const toAbsoluteUrl = (relativeUrl: string): string => {
    // For preset style images in /public/styles/
    if (relativeUrl.startsWith('/')) {
      return `${window.location.origin}${relativeUrl}`;
    }
    return relativeUrl;
  };

  // Helper to get array buffer from URL (for ZIP)
  // 说明：通过代理API获取图片，避免CORS跨域问题
  const urlToBuffer = async (url: string): Promise<ArrayBuffer> => {
    try {
      // 如果是相对路径或同源URL，直接fetch
      if (url.startsWith('/') || url.startsWith(window.location.origin)) {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return await res.arrayBuffer();
      }

      // 对于跨域URL，通过代理API获取
      // 如果代理API不存在，尝试直接fetch（可能会失败，但至少尝试）
      try {
        const proxyRes = await fetch(
          `/api/storage/proxy-image?url=${encodeURIComponent(url)}`
        );
        if (proxyRes.ok) {
          return await proxyRes.arrayBuffer();
        }
      } catch (proxyError) {
        console.warn('Proxy fetch failed, trying direct fetch:', proxyError);
      }

      // 回退到直接fetch（可能遇到CORS问题）
      const res = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.arrayBuffer();
    } catch (error) {
      console.error('Failed to fetch image:', url, error);
      throw error;
    }
  };

  // 下载图片包功能
  // 说明：将所有幻灯片图片打包成ZIP文件下载
  const handleDownloadImages = async () => {
    try {
      // 检查是否有已完成的图片
      const completedSlides = slides.filter(
        (slide) => slide.status === 'completed' && slide.imageUrl
      );

      if (completedSlides.length === 0) {
        toast.error(t('result_step.no_images') || '没有可下载的图片');
        return;
      }

      toast.loading(t('result_step.downloading') || '正在打包图片...', {
        id: 'zip-download',
      });

      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const imgFolder = zip.folder('slides');

      // 添加图片到ZIP，使用Promise.allSettled来处理部分失败的情况
      const results = await Promise.allSettled(
        completedSlides.map(async (slide, index) => {
          try {
            if (!slide.imageUrl) {
              throw new Error('Image URL is empty');
            }

            const buffer = await urlToBuffer(slide.imageUrl);
            // 文件名格式：slide-01-Title.png
            const safeTitle = slide.title
              .replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_') // 支持中文
              .substring(0, 30);
            const filename = `slide-${(index + 1).toString().padStart(2, '0')}-${safeTitle}.png`;
            imgFolder?.file(filename, buffer);
            return { success: true, filename };
          } catch (error) {
            console.error(`Failed to add slide ${index + 1} to ZIP:`, error);
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        })
      );

      // 检查是否有成功的图片
      const successCount = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success
      ).length;

      if (successCount === 0) {
        throw new Error('所有图片下载失败，可能是CORS问题');
      }

      // 生成ZIP文件
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `presentation-images-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.dismiss('zip-download');
      if (successCount < completedSlides.length) {
        toast.warning(
          `部分图片下载成功 (${successCount}/${completedSlides.length})`
        );
      } else {
        toast.success(t('result_step.download_success') || '图片包下载成功！');
      }
    } catch (e: any) {
      console.error('ZIP Gen Error:', e);
      toast.dismiss('zip-download');
      toast.error(
        e.message || t('result_step.download_failed') || '创建ZIP文件失败'
      );
    }
  };

  // 导出PPTX功能
  // 说明：将幻灯片转换为PowerPoint格式并下载
  const handleDownloadPPTX = async () => {
    try {
      // 检查是否有幻灯片
      if (slides.length === 0) {
        toast.error(t('result_step.no_slides') || '没有可导出的幻灯片');
        return;
      }

      toast.loading(t('result_step.generating_pptx') || '正在生成PPTX文件...', {
        id: 'pptx-download',
      });

      // 动态导入pptxgenjs，避免SSR问题
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pres = new PptxGenJS();

      // 设置演示文稿属性
      pres.author = 'AI PPT Generator';
      pres.company = 'Study Platform';
      pres.title = slides[0]?.title || 'Presentation';

      // 辅助函数：将图片URL转换为base64（处理跨域问题）
      const imageUrlToBase64 = async (url: string): Promise<string> => {
        try {
          // 如果是相对路径或同源URL，直接fetch
          if (url.startsWith('/') || url.startsWith(window.location.origin)) {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = reader.result as string;
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }

          // 对于跨域URL，尝试通过代理API获取
          try {
            const proxyRes = await fetch(
              `/api/storage/proxy-image?url=${encodeURIComponent(url)}`
            );
            if (proxyRes.ok) {
              const blob = await proxyRes.blob();
              return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64 = reader.result as string;
                  resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            }
          } catch (proxyError) {
            console.warn(
              'Proxy fetch failed, trying direct fetch:',
              proxyError
            );
          }

          // 回退到直接fetch（可能遇到CORS问题）
          const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result as string;
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error('Failed to convert image to base64:', url, error);
          throw error;
        }
      };

      // 遍历所有幻灯片，创建PPT页面
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const pptSlide = pres.addSlide();

        // 添加背景图片（如果已完成且有图片URL）
        if (slide.status === 'completed' && slide.imageUrl) {
          try {
            // 将图片URL转换为base64，避免跨域问题
            const base64Image = await imageUrlToBase64(slide.imageUrl);
            pptSlide.background = { data: base64Image };
          } catch (imageError) {
            console.warn(
              `Failed to load background image for slide ${i + 1}:`,
              imageError
            );
            // 如果图片加载失败，使用白色背景
            pptSlide.background = { color: 'FFFFFF' };
          }
        } else {
          // 如果没有图片，使用白色背景
          pptSlide.background = { color: 'FFFFFF' };
        }

        // 添加标题文本
        // 说明：KIE生成的图片通常不包含文字，所以我们需要在PPT中添加标题和内容
        pptSlide.addText(slide.title, {
          x: 0.5,
          y: 0.5,
          w: '90%',
          h: 1,
          fontSize: 32,
          bold: true,
          color: slide.status === 'completed' ? 'FFFFFF' : '000000', // 根据背景调整文字颜色
          shadow:
            slide.status === 'completed'
              ? { type: 'outer', color: '000000', blur: 3, offset: 2 }
              : undefined,
          align: 'left',
        });

        // 添加内容文本（支持多行和项目符号）
        // 说明：pptxgenjs的addText可以接受字符串，会自动处理换行
        // 如果需要项目符号，可以将内容按行分割后分别添加，或使用单个字符串
        const contentText = slide.content.trim();
        if (contentText) {
          // 将多行内容转换为带项目符号的格式
          const contentLines = contentText
            .split('\n')
            .filter((line) => line.trim());
          const formattedContent =
            contentLines.length > 1
              ? contentLines.map((line) => `• ${line.trim()}`).join('\n')
              : contentText;

          pptSlide.addText(formattedContent, {
            x: 0.5,
            y: 1.8,
            w: '90%',
            h: 3.5,
            fontSize: 18,
            color: slide.status === 'completed' ? 'FFFFFF' : '000000',
            bullet: contentLines.length > 1, // 多行时启用项目符号
            shadow:
              slide.status === 'completed'
                ? { type: 'outer', color: '000000', blur: 2, offset: 1 }
                : undefined,
            align: 'left',
          });
        }
      }

      // 使用write方法获取Blob，然后手动创建下载链接
      // 说明：writeFile在某些浏览器中可能不会触发下载，所以改用write方法
      // pptxgenjs的write方法返回Promise<Blob>
      const blob = (await pres.write({ outputType: 'blob' })) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Presentation-${Date.now()}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 延迟释放URL，确保下载完成
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

      toast.dismiss('pptx-download');
      toast.success(t('result_step.pptx_downloaded') || 'PPTX文件下载成功！');
    } catch (e: any) {
      console.error('PPT Gen Error:', e);
      toast.dismiss('pptx-download');
      toast.error(
        e.message || t('result_step.pptx_failed') || '生成PPTX文件失败'
      );
    }
  };

  // --- Handlers ---

  // Step 1: Analyze Content
  const handleAnalyze = async () => {
    if (inputMode === 'text' && !inputText.trim() && !uploadedFile) {
      toast.error(t('errors.input_required'));
      return;
    }
    if (inputMode === 'pdf' && !uploadedFile) {
      toast.error(t('errors.input_required'));
      return;
    }

    if (currentStep === 'input') {
      setSlides([]);
      setCompletion('');
    }

    // Move to outline step immediately to show stream
    setCurrentStep('outline');

    try {
      let contentToAnalyze = inputText;

      if (uploadedFile) {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        // Use general file parser (supports PDF, DOCX, TXT)
        contentToAnalyze = await parseFileAction(formData);
      }

      // Start Streaming
      complete(contentToAnalyze);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || t('errors.general_failed'));
      setCurrentStep('input');
    }
  };

  // Step 2: Outline Actions
  const handleUpdateSlide = (
    id: string,
    field: 'title' | 'content',
    value: string
  ) => {
    setSlides((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleAddSlide = () => {
    const newSlide: SlideData = {
      id: `slide-${Date.now()}-new`,
      title: 'New Slide',
      content: 'Add content points here...',
      visualDescription: 'A generic presentation background',
      status: 'pending',
    };
    setSlides([...slides, newSlide]);
  };

  const handleRemoveSlide = (id: string) => {
    setSlides(slides.filter((s) => s.id !== id));
  };

  const handleOutlineConfirm = () => {
    if (slides.length === 0) {
      toast.error(t('errors.input_required')); // Reuse error or add specific one
      return;
    }
    setCurrentStep('style');
  };

  // Step 3: Style Actions
  const handleStyleSelect = (id: string) => {
    if (selectedStyleId === id) {
      setSelectedStyleId(null);
    } else {
      setSelectedStyleId(id);
      setCustomImages([]); // Clear custom if preset selected
      setCustomImageFiles([]);
    }
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedStyleId(null);
      const files = Array.from(e.target.files);
      if (customImages.length + files.length > 8) {
        toast.error(t('errors.upload_limit'));
        return;
      }

      // Store files for upload
      setCustomImageFiles((prev) => [...prev, ...files]);

      // Generate previews
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setCustomImages((prev) => [...prev, ev.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleStartGeneration = async () => {
    setIsGenerating(true);
    setCurrentStep('result');

    // Create a local mutable copy to track latest state for DB save
    // Initial state is what we have now
    const localSlides = [...slides];

    // 1. Create DB record immediately
    let presentationId = '';
    try {
      const { id } = await createPresentationAction({
        title: slides[0]?.title || 'Untitled Presentation',
        content: JSON.stringify(slides),
        status: 'generating',
        styleId: selectedStyleId || 'custom',
      });
      presentationId = id;
    } catch (e) {
      console.error('Failed to create presentation record', e);
    }

    try {
      // Prepare Style Image URLs (KIE API requires publicly accessible URLs)
      let styleImageUrls: string[] = [];

      if (selectedStyleId) {
        // Case 1: Preset Style - Convert relative paths to absolute URLs
        const style = PPT_STYLES.find((s) => s.id === selectedStyleId);
        if (style && style.refs) {
          console.log(
            '[Frontend] Using',
            style.refs.length,
            'preset style images...'
          );
          // Convert all relative URLs to absolute URLs
          styleImageUrls = style.refs.map((url) => toAbsoluteUrl(url));
          console.log('[Frontend] Preset image URLs:', styleImageUrls);
        }
      } else if (customImageFiles.length > 0) {
        // Case 2: Custom Uploads - Upload to cloud storage to get public URLs
        console.log(
          '[Frontend] Uploading',
          customImageFiles.length,
          'custom images to storage...'
        );
        try {
          styleImageUrls = await Promise.all(
            customImageFiles.map((file) =>
              uploadImageToStorage(file, file.name)
            )
          );
          console.log('[Frontend] Custom image URLs:', styleImageUrls);
        } catch (error: any) {
          console.error('[Frontend] Failed to upload custom images:', error);
          toast.error(t('errors.upload_failed') + ': ' + error.message);
          setIsGenerating(false);
          // Mark as failed in DB
          if (presentationId) {
            await updatePresentationAction(presentationId, {
              status: 'failed',
            });
          }
          return;
        }
      }

      // Launch generation for all slides
      const promises = slides.map(async (slide, index) => {
        try {
          // Update status to generating
          setSlides((prev) =>
            prev.map((s) =>
              s.id === slide.id ? { ...s, status: 'generating' } : s
            )
          );
          // Update local tracker
          localSlides[index] = { ...localSlides[index], status: 'generating' };

          // Construct prompt from title + content
          // This ensures the generated image text aligns with user content
          const finalPrompt = `Slide Title: "${slide.title}"\n\nKey Content:\n${slide.content}`;

          const taskData = await createKieTaskAction({
            prompt: finalPrompt,
            styleId: selectedStyleId || undefined,
            aspectRatio,
            imageSize: resolution,
            customImages: styleImageUrls, // Pass public URLs
          });

          if (!taskData.task_id) throw new Error(t('errors.no_task_id'));

          // Poll
          let resultUrl = '';
          let attempts = 0;
          // Extend polling to 10 minutes (200 * 3s = 600s)
          while (attempts < 200) {
            await new Promise((r) => setTimeout(r, 3000));
            const statusRes = await queryKieTaskAction(taskData.task_id);
            const status = statusRes.data?.status;

            if (
              status === 'SUCCESS' ||
              (statusRes.data?.results && statusRes.data.results.length > 0)
            ) {
              const imgs = statusRes.data?.results || [];
              if (imgs.length > 0) {
                resultUrl = imgs[0];
                break;
              }
            } else if (status === 'FAILED') {
              throw new Error(t('errors.generation_failed'));
            }
            attempts++;
          }

          if (resultUrl) {
            setSlides((prev) =>
              prev.map((s) =>
                s.id === slide.id
                  ? { ...s, status: 'completed', imageUrl: resultUrl }
                  : s
              )
            );
            // Update local tracker
            localSlides[index] = {
              ...localSlides[index],
              status: 'completed',
              imageUrl: resultUrl,
            };
          } else {
            throw new Error(t('errors.timeout'));
          }
        } catch (e) {
          console.error(`Slide ${index} error:`, e);
          setSlides((prev) =>
            prev.map((s) =>
              s.id === slide.id ? { ...s, status: 'failed' } : s
            )
          );
          // Update local tracker
          localSlides[index] = { ...localSlides[index], status: 'failed' };
        }
      });

      await Promise.all(promises);

      // 2. Generation Completed - Update DB with FINAL content
      if (presentationId) {
        // Check if any slide failed
        const anyFailed = localSlides.some((s) => s.status === 'failed');
        const finalStatus = anyFailed ? 'failed' : 'completed';

        // Use the thumbnail of the first slide
        const thumbnail = localSlides[0]?.imageUrl;

        await updatePresentationAction(presentationId, {
          status: finalStatus,
          content: JSON.stringify(localSlides),
          thumbnailUrl: thumbnail,
        });
        console.log('Presentation saved successfully:', presentationId);
      }
    } catch (e: any) {
      console.error('Generation Prep Error:', e);
      toast.error(e.message || t('errors.general_failed'));
      // Mark all as failed if prep fails
      setSlides((prev) =>
        prev.map((s) =>
          s.status === 'pending' ? { ...s, status: 'failed' } : s
        )
      );
      if (presentationId) {
        await updatePresentationAction(presentationId, { status: 'failed' });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Render Functions ---

  const renderStepsIndicator = () => {
    const steps: { id: Step; label: string }[] = [
      { id: 'input', label: t('steps.input') },
      { id: 'outline', label: t('steps.outline') },
      { id: 'style', label: t('steps.style') },
      { id: 'result', label: t('steps.result') },
    ];

    const currentIndex = steps.findIndex((s) => s.id === currentStep);

    return (
      <div className="relative mb-12 flex justify-center">
        <div className="absolute top-0 right-0 hidden md:block">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/activity/presentations')}
          >
            <Presentation className="mr-2 h-4 w-4" />
            My Presentations
          </Button>
        </div>
        <div className="flex items-center space-x-4">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors',
                  idx <= currentIndex
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {idx + 1}
              </div>
              <span
                className={cn(
                  'ml-2 hidden text-sm font-medium sm:block',
                  idx <= currentIndex
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <div className="bg-border mx-4 hidden h-[1px] w-8 sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Step 1: Input View
  const renderInputStep = () => (
    <div className="relative mx-auto flex max-w-4xl flex-col items-center justify-center p-6 text-center">
      {/* Background Decorative Elements */}
      <div className="bg-primary/20 absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />
      <div className="bg-secondary/20 absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl" />

      <div className="z-10 w-full space-y-8">
        <p className="text-muted-foreground text-xl">
          {t('input_step.hero_subtitle')}
        </p>

        {/* Unified Input Box */}
        <div className="relative mx-auto w-full max-w-2xl">
          <div
            className={cn(
              'group bg-background/80 relative flex w-full flex-col rounded-2xl border p-2 shadow-2xl backdrop-blur-xl transition-all',
              isDragging ? 'border-primary ring-primary/20 ring-2' : ''
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) {
                setUploadedFile(file);
                setInputMode('pdf'); // Switch to file mode
              }
            }}
          >
            {/* File Preview */}
            {uploadedFile && (
              <div className="bg-muted/50 mb-2 flex items-center justify-between rounded-lg border px-4 py-2">
                <div className="flex items-center gap-2">
                  {uploadedFile.name.endsWith('.pdf') ? (
                    <FileText className="h-4 w-4 text-red-500" />
                  ) : uploadedFile.name.endsWith('.docx') ? (
                    <FileText className="h-4 w-4 text-blue-500" />
                  ) : (
                    <FileText className="h-4 w-4 text-gray-500" />
                  )}
                  <span className="text-sm font-medium">
                    {uploadedFile.name}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    setUploadedFile(null);
                    setInputMode('text');
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Text Input */}
            <Textarea
              placeholder={
                isDragging
                  ? t('input_step.drop_hint')
                  : t('input_step.placeholder')
              }
              className="min-h-[120px] w-full resize-none border-0 bg-transparent p-4 text-lg shadow-none focus-visible:ring-0"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (uploadedFile) setUploadedFile(null); // Clear file if typing
                setInputMode('text');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAnalyze();
                }
              }}
            />

            {/* Bottom Controls */}
            <div className="bg-muted/20 mt-2 flex items-center justify-between rounded-b-xl border-t px-4 py-3">
              <div className="flex items-center gap-4">
                {/* File Upload Button */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setUploadedFile(file);
                      setInputMode('pdf');
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="mr-2 h-4 w-4" />
                  {t('input_step.attach')}
                </Button>

                {/* Slide Count Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs font-medium">
                    {t('input_step.slide_count')}:
                  </span>
                  {/* 自由输入 + 常用快捷按钮 */}
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    className="h-8 w-[80px] px-2 text-xs"
                    value={slideCount}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      // 允许空值，方便用户删除重输
                      if (value === '') {
                        setSlideCount('');
                        return;
                      }
                      let num = parseInt(value, 10);
                      if (Number.isNaN(num)) return;
                      if (num < 1) num = 1;
                      if (num > 50) num = 50;
                      setSlideCount(num.toString());
                    }}
                  />
                  <div className="flex items-center gap-1">
                    {[1, 2, 4, 6, 8, 10, 12].map((num) => (
                      <Button
                        key={num}
                        type="button"
                        variant="outline"
                        size="icon"
                        className={cn(
                          'h-6 w-6 px-0 text-[10px]',
                          slideCount === num.toString()
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-muted-foreground/20 text-muted-foreground'
                        )}
                        onClick={() => setSlideCount(num.toString())}
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Analyze Button */}
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing || (!inputText && !uploadedFile)}
                className="rounded-xl px-6"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Suggestions */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[
              'The Future of AI',
              'Sustainable Energy Trends',
              'Q3 Marketing Strategy',
              'History of Space Exploration',
            ].map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                className="bg-background/50 rounded-full border-dashed"
                onClick={() => setInputText(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // Step 2: Outline View
  const renderOutlineStep = () => (
    <div className="bg-background mx-auto flex h-[calc(100vh-200px)] max-w-7xl overflow-hidden rounded-xl border shadow-2xl">
      {/* Left Column: Live Stream */}
      <div className="hidden w-1/3 flex-col border-r bg-black p-6 md:flex">
        <h3 className="text-primary/70 mb-4 flex items-center gap-2 font-mono text-xs tracking-widest uppercase">
          {isAnalyzing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Generating...
        </h3>
        <div
          ref={logContainerRef}
          className="custom-scrollbar flex-1 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-green-500/80"
        >
          {completion || (
            <span className="animate-pulse text-green-900">
              Waiting for tokens...
            </span>
          )}
        </div>
      </div>

      {/* Right Column: Interactive Outline */}
      <div className="bg-muted/10 flex flex-1 flex-col">
        {/* Header */}
        <div className="bg-background/50 flex items-center justify-between border-b px-6 py-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-bold">{t('outline_step.title')}</h2>
            <p className="text-muted-foreground text-xs">
              {slides.length > 0
                ? `${slides.length} slides generated`
                : t('outline_step.description')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCompletion('');
                setCurrentStep('input');
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button size="sm" onClick={handleOutlineConfirm}>
              {t('outline_step.button_next')}{' '}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
          {slides.length === 0 ? (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center space-y-4">
              {isAnalyzing ? (
                <>
                  <Loader2 className="text-primary h-8 w-8 animate-spin" />
                  <p>Analyzing content and structuring outline...</p>
                </>
              ) : (
                <p>Waiting for analysis...</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {slides.map((slide, index) => (
                <div
                  key={slide.id}
                  className="group bg-card hover:border-primary/50 relative rounded-xl border p-6 transition-all hover:shadow-lg"
                >
                  {/* Slide Header */}
                  <div className="mb-4 flex items-center justify-between border-b pb-2">
                    <span className="bg-muted text-muted-foreground rounded px-2 py-1 font-mono text-xs font-bold">
                      SLIDE {index + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => handleRemoveSlide(slide.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {/* Title */}
                    <div>
                      <label className="text-muted-foreground mb-1 block text-xs font-semibold uppercase">
                        {t('outline_step.slide_title')}
                      </label>
                      <Input
                        value={slide.title}
                        onChange={(e) =>
                          handleUpdateSlide(slide.id, 'title', e.target.value)
                        }
                        className="hover:bg-muted/50 border-transparent bg-transparent px-0 text-lg font-bold shadow-none focus-visible:ring-0"
                      />
                    </div>

                    {/* Content */}
                    <div>
                      <label className="text-muted-foreground mb-1 block text-xs font-semibold uppercase">
                        {t('outline_step.slide_content')}
                      </label>
                      <Textarea
                        value={slide.content}
                        onChange={(e) =>
                          handleUpdateSlide(slide.id, 'content', e.target.value)
                        }
                        className="bg-muted/30 min-h-[80px] border-transparent text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>

                    {/* Visual Prompt (Optional, good for power users) */}
                    <div>
                      <label className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-semibold uppercase">
                        Visual Prompt{' '}
                        <span className="bg-primary/10 text-primary rounded px-1 text-[10px]">
                          AI
                        </span>
                      </label>
                      <p className="text-muted-foreground/70 line-clamp-2 text-xs italic">
                        {slide.visualDescription}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                className="hover:bg-muted/50 w-full border-dashed py-8"
                onClick={handleAddSlide}
              >
                <Plus className="mr-2 h-4 w-4" /> {t('outline_step.add_slide')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Step 3: Style View
  const renderStyleStep = () => (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('style_step.title')}</h2>
          <p className="text-muted-foreground">{t('style_step.subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setCurrentStep('outline')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Settings Column */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="p-6">
            <h3 className="mb-4 font-semibold">Presentation Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {t('style_step.settings.ratio')}
                </label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PPT_RATIOS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {t('style_step.settings.resolution')}
                </label>
                <Select value={resolution} onValueChange={setResolution}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PPT_SIZES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 font-semibold">
              {t('style_step.custom_upload')}
            </h3>
            <div
              className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                customImages.length > 0
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-muted-foreground/20 hover:border-primary/50'
              }`}
            >
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleCustomImageUpload}
                className="hidden"
                id="custom-upload-step"
              />
              <label
                htmlFor="custom-upload-step"
                className="block cursor-pointer"
              >
                <Upload className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
                <span className="text-muted-foreground text-sm">
                  {t('style_step.subtitle')}
                </span>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('style_step.upload_limit_hint')}
                </p>
              </label>
            </div>
            {customImages.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {customImages.map((img, i) => (
                  <div
                    key={i}
                    className="relative h-16 w-16 overflow-hidden rounded border"
                  >
                    <img src={img} className="h-full w-full object-cover" />
                    <button
                      onClick={() => {
                        setCustomImages((prev) =>
                          prev.filter((_, idx) => idx !== i)
                        );
                        setCustomImageFiles((prev) =>
                          prev.filter((_, idx) => idx !== i)
                        );
                      }}
                      className="absolute top-0 right-0 rounded-bl bg-black/70 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Button
            className="w-full py-6 text-lg"
            size="lg"
            onClick={handleStartGeneration}
          >
            {t('style_step.button_generate')}
          </Button>
        </div>

        {/* Style Grid */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PPT_STYLES.map((style) => (
              <div
                key={style.id}
                onClick={() => handleStyleSelect(style.id)}
                className={cn(
                  'group relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all',
                  selectedStyleId === style.id
                    ? 'border-primary ring-primary/20 scale-[1.02] ring-2'
                    : 'hover:border-primary/50 border-transparent'
                )}
              >
                <div className="bg-muted relative aspect-video">
                  <Image
                    src={style.preview}
                    alt={style.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    unoptimized
                  />
                  {selectedStyleId === style.id && (
                    <div className="bg-primary text-primary-foreground absolute top-2 right-2 rounded-full p-1">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12">
                  <span className="font-medium text-white">{style.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // Step 4: Result View
  const renderResultStep = () => (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-col items-center justify-between gap-4 md:flex-row">
        <div>
          <h2 className="text-2xl font-bold">{t('result_step.title')}</h2>
          <p className="text-muted-foreground text-sm">
            {slides.filter((s) => s.status === 'completed').length} /{' '}
            {slides.length} slides generated
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setCurrentStep('input')}>
            <Plus className="mr-2 h-4 w-4" /> {t('result_step.back_home')}
          </Button>

          {slides.some((s) => s.status === 'completed') && (
            <>
              <Button variant="secondary" onClick={handleDownloadPPTX}>
                <Presentation className="mr-2 h-4 w-4" />{' '}
                {t('result_step.download_pptx') || 'Export PPTX'}
              </Button>
              <Button variant="secondary" onClick={handleDownloadImages}>
                <Images className="mr-2 h-4 w-4" />{' '}
                {t('result_step.download_images') || 'Download Images'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {slides.map((slide, index) => (
          <Card key={slide.id} className="group overflow-hidden">
            <div className="bg-muted relative flex aspect-video items-center justify-center">
              {slide.status === 'completed' && slide.imageUrl ? (
                <>
                  <Image
                    src={slide.imageUrl}
                    alt={slide.title}
                    fill
                    className="object-contain"
                    unoptimized
                    onClick={() => setLightboxUrl(slide.imageUrl!)}
                  />
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setLightboxUrl(slide.imageUrl!)}
                    >
                      <Eye className="mr-1 h-4 w-4" />{' '}
                      {t('result_step.preview')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => window.open(slide.imageUrl, '_blank')}
                    >
                      <Download className="mr-1 h-4 w-4" />{' '}
                      {t('result_step.download')}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="p-6 text-center">
                  {slide.status === 'generating' ||
                  slide.status === 'pending' ? (
                    <>
                      <Loader2 className="text-primary mx-auto mb-2 h-8 w-8 animate-spin" />
                      <p className="text-muted-foreground text-sm">
                        {t('result_step.status.generating')}
                      </p>
                    </>
                  ) : (
                    <div className="text-destructive">
                      <X className="mx-auto mb-2 h-8 w-8" />
                      <p className="text-sm">
                        {t('result_step.status.failed')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4">
              <h3 className="mb-1 truncate font-semibold">
                {index + 1}. {slide.title}
              </h3>
              <p className="text-muted-foreground line-clamp-2 text-xs">
                {slide.content}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="container mx-auto min-h-screen px-4 pt-24 pb-8 lg:px-8 lg:pt-28">
      <div className="mb-8 text-center">
        <h1 className="via-primary/80 to-primary/60 mb-2 bg-gradient-to-r from-white bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
          {t('title')}
        </h1>
      </div>

      {renderStepsIndicator()}

      <div className="mt-8">
        {currentStep === 'input' && renderInputStep()}
        {currentStep === 'outline' && renderOutlineStep()}
        {currentStep === 'style' && renderStyleStep()}
        {currentStep === 'result' && renderResultStep()}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="hover:text-primary absolute top-4 right-4 text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={lightboxUrl}
            className="max-h-full max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-8 flex gap-4">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                window.open(lightboxUrl, '_blank');
              }}
            >
              <Download className="mr-2 h-4 w-4" /> {t('result_step.download')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
