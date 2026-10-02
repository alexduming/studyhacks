'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toPng } from 'html-to-image';
import {
  BookOpenText,
  Boxes,
  Code2,
  Copy,
  Download,
  FileText,
  Gem,
  Globe,
  LayoutTemplate,
  Loader2,
  Newspaper,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { AiLayoutViewer } from '@/shared/components/ai-elements/ai-layout-viewer';
import { CreditsCost } from '@/shared/components/ai-elements/credits-display';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
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
import { useAppContext } from '@/shared/contexts/app';
import {
  AI_LAYOUT_TEMPLATE_IDS,
  type AiLayoutRenderMode,
  type AiLayoutTemplateId,
} from '@/shared/lib/ai-layout';
import {
  detectLearningFileType,
  readLearningFileContent,
} from '@/shared/lib/file-reader';
import { getUserFacingErrorMessage } from '@/shared/lib/user-facing-error';
import { cn } from '@/shared/lib/utils';

/* 每种模板对应的图标 —— 根据风格特征选择最贴合的 lucide 图标 */
const TEMPLATE_ICONS = {
  editorial: BookOpenText,   // 杂志编辑 → 书本
  bento: Boxes,              // Bento 卡片 → 盒子网格
  spotlight: Sparkles,       // 聚光灯 → 闪光
  mono: LayoutTemplate,      // 瑞士极简 → 网格布局
  newspaper: Newspaper,      // 纽约时报 → 报纸
  gallery: Gem,              // 画廊展览 → 宝石
  blueprint: Code2,          // 技术蓝图 → 代码
  aurora: Globe,             // 北欧极光 → 地球（自然感）
  dossier: FileText,         // 高管简报 → 文件
  pulse: Zap,                // 霓虹脉冲 → 闪电
} satisfies Record<AiLayoutTemplateId, typeof BookOpenText>;

const ACCENT_PRESETS = [
  { name: 'Emerald', value: '#0f766e' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Rose', value: '#e11d48' },
];

export default function AILayoutPage() {
  const t = useTranslations('ai-layout');
  const { user, fetchUserCredits } = useAppContext();

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [materialInputMode, setMaterialInputMode] = useState<
    'text' | 'upload' | 'link'
  >('text');
  const [activeTab, setActiveTab] = useState<'input' | 'preview'>('input');
  const [selectedTemplate, setSelectedTemplate] =
    useState<AiLayoutTemplateId>('editorial');
  const [renderMode, setRenderMode] = useState<AiLayoutRenderMode>('desktop');
  const [outputLanguage, setOutputLanguage] = useState<string>('auto');
  const [customThemeColor, setCustomThemeColor] = useState<string>('');
  const [pastedContent, setPastedContent] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [generatedLayout, setGeneratedLayout] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const layoutContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.id) {
      fetchUserCredits();
    }
  }, [fetchUserCredits, user?.id]);

  const generateLayout = async ({
    content,
    type,
    fileName,
  }: {
    content: string;
    type: string;
    fileName: string;
  }) => {
    setIsProcessing(true);
    setError('');

    try {
      const response = await fetch('/api/ai/layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          type,
          fileName,
          outputLanguage,
          template: selectedTemplate,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setGeneratedLayout(result.layout);
        setActiveTab('preview');
        if (user) {
          fetchUserCredits();
        }
        toast.success(t('preview.generation_success'));
        return;
      }

      if (result.insufficientCredits) {
        toast.error(t('errors.insufficient_credits_short'));
      } else {
        toast.error(result.error || t('errors.generation_failed'));
      }

      setError(result.error || t('errors.generation_failed'));
      setActiveTab('preview');
    } catch (requestError) {
      console.error('Generate ai layout failed:', requestError);
      setError(t('errors.processing_failed'));
      setActiveTab('preview');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateFromText = async () => {
    if (!pastedContent.trim()) {
      toast.error(t('upload.text_empty'));
      return;
    }

    setUploadedFile(null);
    await generateLayout({
      content: pastedContent.trim(),
      type: 'text',
      fileName: 'pasted-content.txt',
    });
  };

  const handleGenerateFromLink = async () => {
    if (!linkInput.trim()) {
      toast.error(t('upload.link_empty'));
      return;
    }

    setUploadedFile(null);
    setIsProcessing(true);
    setError('');

    try {
      const response = await fetch('/api/ai/extract-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: linkInput.trim(),
        }),
      });
      const result = await response.json();

      if (!result.success || !result.content) {
        throw new Error(result.error || t('errors.processing_failed'));
      }

      await generateLayout({
        content: result.content,
        type: 'link',
        fileName: `web-link-${Date.now()}.txt`,
      });
    } catch (requestError: any) {
      console.error('Generate ai layout from link failed:', requestError);
      const message = getUserFacingErrorMessage({
        error: requestError,
        fallbackMessage: t('errors.processing_failed'),
        insufficientCreditsMessage: t('errors.insufficient_credits_short'),
      });
      setError(message);
      toast.error(message);
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setMaterialInputMode('upload');
    setError('');
    setActiveTab('preview');
    setIsProcessing(true);

    try {
      let fileContent = '';

      try {
        fileContent = await readLearningFileContent(file);
      } catch (readError: any) {
        if (readError.code === 'NEEDS_OCR') {
          toast.info(t('preview.ocr_processing'), {
            duration: 5000,
          });

          try {
            const { convertPdfToImages } =
              await import('@/shared/lib/pdf-to-image');
            const images = await convertPdfToImages(file, 5);

            if (images.length === 0) {
              throw new Error(t('errors.ocr_conversion_failed'));
            }

            let ocrText = '';
            for (let index = 0; index < images.length; index++) {
              const res = await fetch('/api/ai/ocr', {
                method: 'POST',
                body: JSON.stringify({ image: images[index] }),
              });

              if (!res.ok) continue;

              const data = await res.json();
              if (data.success && data.text) {
                ocrText += `[Page ${index + 1}]\n${data.text}\n\n`;
              }
            }

            if (!ocrText.trim()) {
              throw new Error(t('errors.ocr_no_text'));
            }

            fileContent = ocrText;
            toast.success(t('preview.ocr_complete'));
          } catch (ocrError: any) {
            const message =
              ocrError?.message || `${t('preview.ocr_failed')}: OCR error`;
            throw new Error(message);
          }
        } else {
          throw readError;
        }
      }

      await generateLayout({
        content: fileContent,
        type: detectLearningFileType(file.type),
        fileName: file.name,
      });
    } catch (requestError: any) {
      console.error('Generate ai layout from file failed:', requestError);
      setError(
        getUserFacingErrorMessage({
          error: requestError,
          fallbackMessage: t('errors.processing_failed'),
          insufficientCreditsMessage: t('errors.insufficient_credits_short'),
        })
      );
      setIsProcessing(false);
    }
  };

  const ensureLayoutReady = () => {
    if (!generatedLayout) {
      toast.error(t('preview.toast_no_layout'));
      setActiveTab('input');
      return false;
    }

    return true;
  };

  const handleCopyLayout = async () => {
    if (!ensureLayoutReady()) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      toast.error(t('preview.copy_error'));
      return;
    }

    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(generatedLayout);
      toast.success(t('preview.copy_success'));
    } catch (copyError) {
      console.error('Copy ai layout failed:', copyError);
      toast.error(t('preview.copy_error'));
    } finally {
      setIsCopying(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!ensureLayoutReady()) return;
    if (!layoutContainerRef.current) {
      toast.error(t('preview.download_error'));
      return;
    }

    setIsDownloading(true);

    try {
      /* 获取目标元素的真实尺寸，确保导出截图区域精确 */
      const node = layoutContainerRef.current;

      const dataUrl = await toPng(node, {
        cacheBust: true,
        backgroundColor: renderMode === 'mobile' ? '#e8edf5' : '#ffffff',
        /* 明确指定截取宽高，避免 mx-auto/max-w 导致的偏移和留白 */
        width: node.scrollWidth,
        height: node.scrollHeight,
        /* 使用 style 覆盖，确保导出时不受 CSS transform/translate 影响 */
        style: {
          margin: '0',
          transform: 'none',
        },
        pixelRatio:
          typeof window !== 'undefined' && window.devicePixelRatio
            ? Math.max(window.devicePixelRatio, 2)
            : 2,
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = uploadedFile?.name
        ? `${uploadedFile.name}-${renderMode}-${selectedTemplate}.png`
        : `ai-layout-${renderMode}-${selectedTemplate}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(t('preview.download_success'));
    } catch (downloadError) {
      console.error('Download ai layout failed:', downloadError);
      toast.error(t('preview.download_error'));
    } finally {
      setIsDownloading(false);
    }
  };

  const templateOptions = AI_LAYOUT_TEMPLATE_IDS.map((id) => ({
    id,
    title: t(`templates.${id}.title`),
    description: t(`templates.${id}.description`),
    icon: TEMPLATE_ICONS[id],
  }));

  return (
    <section className="from-background via-muted/60 to-background min-h-screen bg-gradient-to-b dark:from-gray-950 dark:via-gray-950 dark:to-black">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute top-24 left-[15%] h-80 w-80 rounded-full blur-3xl" />
        <div className="absolute right-[10%] bottom-24 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-24">
        <ScrollAnimation>
          <div className="mx-auto max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="border-primary/25 bg-primary/10 text-primary mx-auto mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm">
                <LayoutTemplate className="h-4 w-4" />
                {t('badge')}
              </div>
              <h1 className="mb-6 bg-gradient-to-r from-white via-white to-sky-200 bg-clip-text text-4xl font-bold text-transparent md:text-6xl">
                {t('title')}
              </h1>
              <p className="text-muted-foreground mx-auto max-w-3xl text-lg leading-8 md:text-xl dark:text-gray-300">
                {t('subtitle')}
              </p>
            </motion.div>
          </div>
        </ScrollAnimation>

        <ScrollAnimation delay={0.1}>
          <div className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-5">
            {templateOptions.map((template) => {
              const Icon = template.icon;
              const isSelected = selectedTemplate === template.id;

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`rounded-[28px] border p-6 text-left transition-all duration-300 ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-[0_20px_60px_rgba(59,130,246,0.18)]'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="bg-primary/12 text-primary inline-flex h-12 w-12 items-center justify-center rounded-2xl">
                      <Icon className="h-6 w-6" />
                    </div>
                    {isSelected ? (
                      <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                        {t('templates.selected')}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="text-foreground text-xl font-semibold dark:text-white">
                    {template.title}
                  </h2>
                  <p className="text-muted-foreground mt-3 text-sm leading-6 dark:text-gray-400">
                    {template.description}
                  </p>
                </button>
              );
            })}
          </div>
        </ScrollAnimation>

        <ScrollAnimation delay={0.2}>
          <div className="mx-auto mt-12 max-w-6xl">
            <div className="mb-8 flex justify-center">
              <div className="border-primary/20 bg-muted/50 inline-flex rounded-lg border p-1 backdrop-blur-sm dark:bg-gray-900/50">
                {(['input', 'preview'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-md px-6 py-3 text-sm transition-all duration-300 ${
                      activeTab === tab
                        ? 'from-primary to-primary/70 bg-gradient-to-r text-white shadow-lg'
                        : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    {t(`tabs.${tab}`)}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'input' ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="border-primary/20 bg-muted/50 rounded-[32px] border p-8 backdrop-blur-sm dark:bg-gray-900/50"
              >
                <Tabs
                  value={materialInputMode}
                  onValueChange={(value) =>
                    setMaterialInputMode(value as 'text' | 'upload' | 'link')
                  }
                  className="mx-auto w-full max-w-3xl"
                >
                  <TabsList className="bg-muted text-foreground mb-5 grid grid-cols-3 rounded-xl">
                    <TabsTrigger value="text">
                      {t('upload.text_tab')}
                    </TabsTrigger>
                    <TabsTrigger value="upload">
                      {t('upload.upload_tab')}
                    </TabsTrigger>
                    <TabsTrigger value="link">
                      {t('upload.link_tab')}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="text">
                    <div className="border-primary/20 bg-background/50 rounded-[28px] border p-5 dark:bg-gray-950/40">
                      <Textarea
                        value={pastedContent}
                        onChange={(event) =>
                          setPastedContent(event.target.value)
                        }
                        placeholder={t('upload.text_placeholder')}
                        disabled={isProcessing}
                        className="border-border bg-muted/40 text-foreground min-h-56 resize-y text-sm dark:bg-black/20"
                      />
                      <div className="mt-4 flex justify-center">
                        <Button
                          onClick={handleGenerateFromText}
                          disabled={isProcessing || !pastedContent.trim()}
                          className="from-primary hover:from-primary/90 to-primary/70 hover:to-primary/80 h-11 rounded-full bg-gradient-to-r px-8 text-white"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('upload.processing')}
                            </>
                          ) : (
                            <>
                              <CreditsCost credits={3} />
                              {t('upload.generate_from_text')}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="upload">
                    <div className="border-primary/20 bg-background/50 rounded-[28px] border border-dashed px-6 py-10 text-center dark:bg-gray-950/40">
                      <input
                        id="ai-layout-file-input"
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.xlsx,.xlsm,.txt,.md"
                        onChange={handleFileUpload}
                        className="hidden"
                      />

                      <p className="text-muted-foreground mb-4 text-sm dark:text-gray-400">
                        {t('upload.upload_hint')}
                      </p>

                      <Button
                        asChild
                        className="from-primary hover:from-primary/90 to-primary/70 hover:to-primary/80 h-11 rounded-full bg-gradient-to-r px-8 text-white"
                        disabled={isProcessing}
                      >
                        <label
                          htmlFor="ai-layout-file-input"
                          className="inline-flex cursor-pointer items-center justify-center"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('upload.processing')}
                            </>
                          ) : (
                            <>
                              <CreditsCost credits={3} />
                              {t('upload.upload_button')}
                            </>
                          )}
                        </label>
                      </Button>

                      {uploadedFile ? (
                        <div className="border-primary/20 bg-muted/50 mx-auto mt-5 max-w-md rounded-2xl border p-4 dark:bg-black/20">
                          <p className="text-muted-foreground text-xs dark:text-gray-400">
                            {t('upload.file_selected')}
                          </p>
                          <p className="text-foreground mt-1 truncate text-sm font-medium dark:text-white">
                            {uploadedFile.name}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </TabsContent>

                  <TabsContent value="link">
                    <div className="border-primary/20 bg-background/50 rounded-[28px] border p-5 dark:bg-gray-950/40">
                      <p className="text-muted-foreground mb-4 text-center text-sm dark:text-gray-400">
                        {t('upload.link_hint')}
                      </p>
                      <Input
                        value={linkInput}
                        onChange={(event) => setLinkInput(event.target.value)}
                        placeholder={t('upload.link_placeholder')}
                        disabled={isProcessing}
                        className="border-border bg-muted/40 text-foreground h-11 text-sm dark:bg-black/20"
                      />
                      <div className="mt-4 flex justify-center">
                        <Button
                          onClick={handleGenerateFromLink}
                          disabled={isProcessing || !linkInput.trim()}
                          className="from-primary hover:from-primary/90 to-primary/70 hover:to-primary/80 h-11 rounded-full bg-gradient-to-r px-8 text-white"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('upload.processing')}
                            </>
                          ) : (
                            <>
                              <CreditsCost credits={3} />
                              {t('upload.generate_from_link')}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="ai-layout-language-select"
                      className="text-foreground/70 text-xs font-medium dark:text-gray-300"
                    >
                      {t('upload.output_language')}
                    </label>
                    <Select
                      value={outputLanguage}
                      onValueChange={setOutputLanguage}
                      disabled={isProcessing}
                    >
                      <SelectTrigger
                        id="ai-layout-language-select"
                        className="border-primary/30 hover:border-primary/50 bg-background/60 text-foreground h-9 w-[200px] text-xs dark:bg-gray-800/50 dark:text-white"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-primary/30 bg-background dark:bg-gray-900">
                        <SelectItem value="auto">
                          {t('languages.auto')}
                        </SelectItem>
                        <SelectItem value="zh">{t('languages.zh')}</SelectItem>
                        <SelectItem value="en">{t('languages.en')}</SelectItem>
                        <SelectItem value="es">{t('languages.es')}</SelectItem>
                        <SelectItem value="fr">{t('languages.fr')}</SelectItem>
                        <SelectItem value="de">{t('languages.de')}</SelectItem>
                        <SelectItem value="ja">{t('languages.ja')}</SelectItem>
                        <SelectItem value="ko">{t('languages.ko')}</SelectItem>
                        <SelectItem value="pt">{t('languages.pt')}</SelectItem>
                        <SelectItem value="ru">{t('languages.ru')}</SelectItem>
                        <SelectItem value="ar">{t('languages.ar')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-foreground/70 text-xs font-medium dark:text-gray-300">
                      {t('upload.accent_color')}
                    </span>
                    <div className="flex items-center gap-2">
                      {ACCENT_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => setCustomThemeColor(preset.value)}
                          className={`h-5 w-5 rounded-full border transition-transform ${
                            customThemeColor === preset.value
                              ? 'border-white ring-2 ring-white/40'
                              : 'border-transparent hover:scale-110'
                          }`}
                          style={{ backgroundColor: preset.value }}
                          title={preset.name}
                          disabled={isProcessing}
                        />
                      ))}
                      <div className="border-border bg-muted relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border dark:border-gray-600 dark:bg-gray-800">
                        <input
                          type="color"
                          value={customThemeColor || '#0f766e'}
                          onChange={(event) =>
                            setCustomThemeColor(event.target.value)
                          }
                          className="absolute inset-0 h-[150%] w-[150%] -translate-x-1/4 -translate-y-1/4 cursor-pointer opacity-0"
                          disabled={isProcessing}
                        />
                        <div
                          className="h-full w-full rounded-full"
                          style={{
                            backgroundColor: customThemeColor || 'transparent',
                            backgroundImage: !customThemeColor
                              ? 'linear-gradient(to bottom right, #0f766e, #2563eb)'
                              : 'none',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mx-auto mt-10 grid max-w-2xl gap-4 md:grid-cols-2">
                  {[
                    {
                      icon: FileText,
                      label: t('upload.pdf_docs'),
                      desc: t('upload.pdf_desc'),
                    },
                    {
                      icon: Upload,
                      label: t('upload.text_docs'),
                      desc: t('upload.text_formats'),
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"
                      >
                        <div className="bg-primary/10 mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl">
                          <Icon className="text-primary h-6 w-6" />
                        </div>
                        <p className="text-foreground font-medium dark:text-white">
                          {item.label}
                        </p>
                        <p className="text-muted-foreground mt-1 text-sm dark:text-gray-400">
                          {item.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="border-primary/20 bg-muted/50 rounded-[32px] border p-6 backdrop-blur-sm md:p-8 dark:bg-gray-900/50"
              >
                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-foreground text-2xl font-semibold dark:text-white">
                      {t('preview.title')}
                    </h2>
                    <p className="text-muted-foreground mt-2 text-sm dark:text-gray-400">
                      {t('preview.subtitle')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyLayout}
                      disabled={isCopying || !generatedLayout}
                      className="border-primary/30 text-primary/80 hover:border-primary/50 disabled:opacity-40"
                    >
                      {isCopying ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      {t('preview.copy')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadImage}
                      disabled={isDownloading || !generatedLayout}
                      className="border-primary/30 text-primary/80 hover:border-primary/50 disabled:opacity-40"
                    >
                      {isDownloading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      {isDownloading
                        ? t('upload.processing')
                        : t('preview.download')}
                    </Button>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-3">
                  {(['desktop', 'mobile'] as AiLayoutRenderMode[]).map(
                    (mode) => (
                      <Button
                        key={mode}
                        type="button"
                        variant={renderMode === mode ? 'default' : 'outline'}
                        onClick={() => setRenderMode(mode)}
                        className={
                          renderMode === mode
                            ? 'bg-primary hover:bg-primary/90 text-white'
                            : 'border-primary/20 text-foreground hover:border-primary/40'
                        }
                      >
                        {t(`preview.modes.${mode}`)}
                      </Button>
                    )
                  )}
                </div>

                <p className="text-muted-foreground mb-6 text-sm dark:text-gray-400">
                  {renderMode === 'mobile'
                    ? t('preview.mode_hint_mobile')
                    : t('preview.mode_hint_desktop')}
                </p>

                <div className="mb-6 flex flex-wrap gap-3">
                  {templateOptions.map((template) => (
                    <Button
                      key={template.id}
                      type="button"
                      variant={
                        selectedTemplate === template.id ? 'default' : 'outline'
                      }
                      onClick={() => setSelectedTemplate(template.id)}
                      className={
                        selectedTemplate === template.id
                          ? 'bg-primary hover:bg-primary/90 text-white'
                          : 'border-primary/20 text-foreground hover:border-primary/40'
                      }
                    >
                      {template.title}
                    </Button>
                  ))}
                </div>

                {error ? (
                  <div className="rounded-[28px] border border-red-500/30 bg-red-500/10 px-6 py-12 text-center">
                    <p className="text-red-300">{error}</p>
                  </div>
                ) : generatedLayout ? (
                  /* 外层居中容器（不截图） + 内层固定宽度容器（截图目标）
                   * 这样 toPng 只截取内层容器，不会包含居中留白 */
                  <div className={cn(
                    renderMode === 'mobile' ? 'flex justify-center' : ''
                  )}>
                    <div
                      ref={layoutContainerRef}
                      className={cn(
                        'bg-white',
                        renderMode === 'mobile'
                          ? 'w-[460px] max-w-full rounded-[40px] bg-[#e8edf5] p-3 shadow-[0_20px_80px_rgba(15,23,42,0.18)]'
                          : 'rounded-[32px] p-4 md:p-5'
                      )}
                    >
                      {renderMode === 'mobile' ? (
                        <div className="mb-3 flex justify-center">
                          <div className="h-1.5 w-16 rounded-full bg-slate-300" />
                        </div>
                      ) : null}
                      <AiLayoutViewer
                        content={generatedLayout}
                        template={selectedTemplate}
                        renderMode={renderMode}
                        themeColor={customThemeColor}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-white/10 bg-white/5 px-6 py-16 text-center">
                    <LayoutTemplate className="text-muted-foreground mx-auto mb-4 h-14 w-14 dark:text-gray-600" />
                    <p className="text-muted-foreground dark:text-gray-400">
                      {t('preview.empty')}
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}
