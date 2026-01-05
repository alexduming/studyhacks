'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toPng } from 'html-to-image';
import {
  Brain,
  Coins,
  Copy,
  Download,
  FileAudio,
  FileText,
  FileVideo,
  Loader2,
  Mic,
  PenSquare,
  Upload,
  Zap,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

import { CreditsCost } from '@/shared/components/ai-elements/credits-display';
import { StudyNotesViewer } from '@/shared/components/ai-elements/study-notes-viewer';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { useAppContext } from '@/shared/contexts/app';
import {
  detectLearningFileType,
  readLearningFileContent,
} from '@/shared/lib/file-reader';

/**
 * 非程序员友好解释：
 * - 这个组件本来只用在单独的「AI 笔记」页面上，是一整屏的大工具台。
 * - 现在我们希望在首页 Hero 下面，也放一块「立即试用的核心功能」区域。
 *
 * 为了避免复制粘贴同一套逻辑，我们引入一个非常轻量的「模式开关」：
 * - variant = 'full'   表示作为独立页面使用（原来的样子，保持不变）
 * - variant = 'embedded' 表示嵌入到首页中使用（去掉多余的整屏背景和外层间距，更紧凑）
 *
 * 这样做的好处（对应你说的“精、准、净”）：
 * 1. 精：核心逻辑只有一份，首页与独立页面共用，后期只需要改一个地方。
 * 2. 准：只在外层容器加了一个简单的分支，不碰内部上传、AI 调用等复杂逻辑。
 * 3. 净：不额外新建一大堆组件文件，代码结构依然清晰，没有技术债。
 */
const AINoteTaker = ({
  variant = 'full',
}: {
  /**
   * 非程序员解释：
   * - 你可以把 variant 理解成「显示风格」的开关。
   * - 'full' = 单页完整模式；'embedded' = 首页里的小区域模式。
   */
  variant?: 'full' | 'embedded';
}) => {
  const t = useTranslations('ai-note-taker');
  const locale = useLocale();
  const router = useRouter();
  const { user, fetchUserCredits } = useAppContext();
  const { theme, resolvedTheme } = useTheme();
  const localePrefix = locale ? `/${locale}` : '';
  const withLocale = (path: string) =>
    localePrefix ? `${localePrefix}${path}` : path;

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedNotes, setGeneratedNotes] = useState('');
  const [activeTab, setActiveTab] = useState('upload');
  // 输出语言选择，默认为"自动"
  const [outputLanguage, setOutputLanguage] = useState<string>('auto');
  // 自定义主题色，默认为空，表示使用系统默认的 purple
  const [customThemeColor, setCustomThemeColor] = useState<string>('');
  // 保存生成的笔记 ID，用于显示跳转按钮
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);

  // 预设主题色列表
  const presetColors = [
    { name: 'Default Purple', value: '', color: '#6535F6' },
    { name: 'Tesla Red', value: '#E31937', color: '#E31937' },
    { name: 'Ocean Blue', value: '#0ea5e9', color: '#0ea5e9' },
    { name: 'Emerald Green', value: '#10b981', color: '#10b981' },
    { name: 'Amber Orange', value: '#f59e0b', color: '#f59e0b' },
  ];
  // 导出图片（原来是 PDF）等工具的运行状态
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  // AI 扩展功能的弹窗状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'podcast' | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [podcastResult, setPodcastResult] = useState('');
  const NOTE_TRANSFER_KEY = 'ai-note-transfer';
  // 用于拿到隐藏的文件输入框 DOM 节点
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 记录渲染好的笔记 DOM，方便后续把"看到的排版效果"一键导出为长图片
  // 非程序员解释：
  // - 可以把这个理解为"给笔记区域贴了一个隐形标签"，稍后截图工具会根据这个标签来拍照
  const notesContainerRef = useRef<HTMLDivElement>(null);

  /**
   * 获取用户积分
   *
   * 非程序员解释：
   * - 在组件加载时和每次生成笔记后，都会刷新用户的积分余额
   * - 这样用户可以实时看到自己还剩多少积分
   */
  useEffect(() => {
    if (user?.id) {
      fetchUserCredits();
    }
  }, [user?.id]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setIsProcessing(true);
      setError('');
      setSavedNoteId(null);

      try {
        // 读取文件内容（支持 txt / pdf / docx 等）
        const fileContent = await readLearningFileContent(file);

        /**
         * 调用后端 API 生成笔记（替代在前端直接 new OpenRouterService）：
         *
         * 非程序员解释：
         * - 之前的做法：浏览器里直接拿着 OpenRouter 的密钥去请求第三方 AI 服务，
         *   这样虽然能用，但密钥很容易在浏览器开发者工具中被看到 → 不安全。
         * - 现在的做法：浏览器只请求我们自己的网站接口 /api/ai/notes，
         *   真正去请求 OpenRouter 的动作放在服务器里完成，密钥只保存在服务器环境变量中。
         *
         * 对你来说，使用方式几乎不变：只不过从「调本地 service」换成了「调后端接口」。
         */
        const response = await fetch('/api/ai/notes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: fileContent,
            // 使用统一的文件类型检测，便于后续统计或扩展
            type: detectLearningFileType(file.type),
            fileName: file.name,
            // 传递用户选择的输出语言
            outputLanguage,
          }),
        });

        const result = await response.json();

        if (result.success) {
          // 成功：保存生成的笔记内容，并自动切换到"笔记"标签页
          setGeneratedNotes(result.notes);
          setActiveTab('notes');
          // 刷新积分余额
          if (user) {
            fetchUserCredits();
          }
          toast.success(t('notes.generation_success'));
          
          // 保存笔记 ID，但不自动跳转，允许用户先预览
          if (result.note?.id) {
            setSavedNoteId(result.note.id);
          }
        } else {
          // 失败：保存错误信息，并同样切到"笔记"标签页，让用户能立刻看到错误原因
          // 积分不足的特殊处理
          if (result.insufficientCredits) {
            toast.error(
              t('errors.insufficient_credits', {
                required: result.requiredCredits,
                remaining: result.remainingCredits,
              })
            );
          } else {
            toast.error(result.error || t('errors.generation_failed'));
          }
          setError(result.error || t('errors.generation_failed'));
          setActiveTab('notes');
        }
      } catch (error) {
        console.error('Error processing file:', error);
        setError(t('errors.processing_failed'));
      } finally {
        setIsProcessing(false);
      }
    }
  };

  /**
   * 非程序员解释：
   * - 很多按钮都需要“已经生成的笔记”作为输入
   * - 这个小工具函数会提前帮你检查，避免白点按钮
   */
  const ensureNotesReady = () => {
    if (!generatedNotes) {
      toast.error(t('notes.toast_no_notes'));
      setActiveTab('upload');
      return false;
    }
    return true;
  };

  /**
   * 复制 Markdown 文本，方便粘贴到其它工具中继续使用
   */
  const handleCopyNotes = async () => {
    if (!ensureNotesReady()) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      toast.error(t('notes.copy_error'));
      return;
    }

    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(generatedNotes);
      toast.success(t('notes.copy_success'));
    } catch (error) {
      console.error('Copy notes failed:', error);
      toast.error(t('notes.copy_error'));
    } finally {
      setIsCopying(false);
    }
  };

  /**
   * 将笔记内容带到其他功能页：先存到 sessionStorage，再跳转
   */
  const handleNavigateWithNotes = (feature: 'flashcards' | 'quiz') => {
    if (!ensureNotesReady()) return;
    if (typeof window === 'undefined') {
      toast.error(t('notes.transfer_unavailable'));
      return;
    }

    sessionStorage.setItem(
      NOTE_TRANSFER_KEY,
      JSON.stringify({
        type: feature,
        content: generatedNotes,
        timestamp: Date.now(),
      })
    );

    const targetPath = feature === 'flashcards' ? '/flashcards' : '/quiz';
    router.push(withLocale(targetPath));
  };

  /**
   * 将“渲染后的笔记区域”导出为一张长图片
   *
   * 非程序员解释：
   * - 之前的做法是“重新排版文字然后导出 PDF”，因此和你在页面上看到的美观排版不完全一致
   * - 现在改成“给整块笔记区域拍一张长截图”，保证导出的图片效果 = 你眼睛看到的效果
   * - 实现方式：用 html-to-image 这个小工具，把某一块 DOM（notesContainerRef）转成 PNG 图片
   *
   * 设计取舍（对应 精 / 准 / 净）：
   * - 精：逻辑非常直观——只针对笔记展示区域截图，不动 AI 生成、上传等主流程
   * - 准：直接操作已经渲染好的 HTML，不再二次解析 Markdown，避免排版“跑偏”
   * - 净：只替换导出实现，不改其它地方的调用和文案 key，技术债为 0
   */
  const handleDownloadImage = async () => {
    if (!ensureNotesReady()) return;

    // 如果还没把笔记渲染出来（极端情况下），就给出友好提示
    if (!notesContainerRef.current) {
      toast.error(t('notes.download_error'));
      return;
    }

    setIsDownloading(true);
    try {
      const node = notesContainerRef.current;

      // 使用 html-to-image 将指定 DOM 转成 PNG
      // 说明：
      // - backgroundColor：根据当前主题动态设置背景色，light 模式使用白色，dark 模式使用深色
      // - pixelRatio：用屏幕像素比，导出更清晰的图片（长图依然能看清细节）
      const isDark = resolvedTheme === 'dark' || theme === 'dark';
      const backgroundColor = isDark ? '#020617' : '#ffffff'; // light 模式使用白色，dark 模式使用深色

      const dataUrl = await toPng(node, {
        cacheBust: true,
        backgroundColor,
        pixelRatio:
          typeof window !== 'undefined' && window.devicePixelRatio
            ? window.devicePixelRatio
            : 2,
      });

      // 通过一个临时的 <a> 标签触发浏览器下载
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = uploadedFile?.name
        ? `${uploadedFile.name}-notes.png`
        : 'ai-study-notes.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(t('notes.download_success'));
    } catch (error) {
      console.error('Download image failed:', error);
      toast.error(t('notes.download_error'));
    } finally {
      setIsDownloading(false);
    }
  };

  /**
   * 生成学习播客脚本并展示在弹窗中
   */
  const handleGeneratePodcast = async () => {
    if (!ensureNotesReady()) return;

    setDialogOpen(true);
    setDialogType('podcast');
    setDialogLoading(true);
    setDialogError('');
    setPodcastResult('');

    try {
      /**
       * 非程序员解释：
       * - 这里的逻辑和「生成笔记」一样，也从“直接调 OpenRouter”改成“调我们自己的后端接口”。
       * - 好处：播客脚本生成依然可用，但 OpenRouter 的密钥始终只在服务器端。
       */
      const response = await fetch('/api/ai/podcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: generatedNotes,
          // 未来如果需要支持选择播客风格，可以在这里追加 voiceStyle
        }),
      });

      const result = await response.json();
      if (result.success && result.script) {
        setPodcastResult(result.script);
      } else {
        // 检查是否是升级维护提示
        if (result.upgrading) {
          setDialogOpen(false);
          toast.error(t('errors.podcast_upgrading'));
        } else {
          setDialogError(result.error || t('notes.dialog.error'));
        }
      }
    } catch (error) {
      console.error('AI feature failed:', error);
      setDialogError(t('notes.dialog.error'));
    } finally {
      setDialogLoading(false);
    }
  };

  const getDialogTitles = () => {
    switch (dialogType) {
      case 'podcast':
        return {
          title: t('notes.dialog.podcast_title'),
          desc: t('notes.dialog.podcast_desc'),
        };
      default:
        return { title: '', desc: '' };
    }
  };

  const renderDialogBody = () => {
    if (dialogLoading) {
      return (
        <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-10 text-center dark:text-gray-300">
          <Loader2 className="text-primary h-6 w-6 animate-spin" />
          <p>{t('notes.dialog.loading')}</p>
        </div>
      );
    }

    if (dialogError) {
      return <p className="text-center text-red-400">{dialogError}</p>;
    }

    if (dialogType === 'podcast') {
      return (
        <ScrollArea className="border-primary/20 bg-muted/60 h-80 rounded border p-4 dark:bg-gray-900/60">
          <StudyNotesViewer content={podcastResult} />
        </ScrollArea>
      );
    }

    return null;
  };

  // getFileType 已由 detectLearningFileType 替代，无需在本组件重复实现

  const [error, setError] = useState('');

  const tabs = [
    { id: 'upload', label: t('tabs.upload'), icon: Upload },
    // 暂时移除录音功能，因为尚未实现 STT
    // { id: 'record', label: t('tabs.record'), icon: Mic },
    { id: 'notes', label: t('tabs.notes'), icon: Brain },
  ];

  /**
   * 这里我们只在「最外层布局」根据 variant 做一点点区别：
   * - full 模式：保留原来的整屏渐变背景 + 大间距，适合独立功能页。
   * - embedded 模式：改成普通 section 区块，跟首页其他模块风格一致，
   *   不再使用 fixed 的全屏背景，避免叠加多层背景导致页面“太花”。
   *
   * 注意：内部上传 / 生成 / 导出 / 分享等逻辑完全不动，只是换了外壳。
   */
  const isEmbedded = variant === 'embedded';

  return (
    <section
      className={
        isEmbedded
          ? // 嵌入首页：背景根据主题自动切换，light 模式使用浅色，dark 模式使用深色
            'from-background/95 via-muted/90 to-background/98 relative bg-gradient-to-b py-16 dark:from-gray-950/95 dark:via-gray-950/90 dark:to-gray-950/98'
          : // 原有单页模式：背景根据主题自动切换，light 模式使用浅色，dark 模式使用深色
            'via-primary/5 from-background to-muted min-h-screen bg-gradient-to-b dark:from-gray-950 dark:to-gray-950'
      }
    >
      {/* 背景装饰：full 模式用 fixed 光晕，embedded 模式用更轻量的绝对定位光晕，避免影响整页滚动 */}
      {isEmbedded ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="bg-primary/10 absolute top-0 left-1/3 h-72 w-72 rounded-full blur-3xl" />
          {/* 
            为了与 turbo 主题保持统一，这里不再单独使用蓝色光晕，
            而是统一用 primary 作为主色系，整体观感更一致。
          */}
          <div className="bg-primary/5 absolute right-1/4 bottom-0 h-72 w-72 rounded-full blur-3xl" />
        </div>
      ) : (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="bg-primary/10 absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />
          {/* 全屏模式同样用 primary 的柔和光晕，避免与 Hero 产生两套颜色体系 */}
          <div className="bg-primary/5 absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl" />
        </div>
      )}

      <div
        className={
          isEmbedded
            ? // 嵌入首页：减少上下 padding，让模块更紧凑；mobile 端左右保持安全边距
              'relative z-10 container mx-auto px-4 py-8'
            : 'relative z-10 container mx-auto px-4 py-24'
        }
      >
        <ScrollAnimation>
          <div className="mb-12 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              {/* 文案渐变保持与 Hero 一致：白色 → primary 过渡 */}
              <h1 className="via-primary/80 to-primary/60 mb-6 bg-gradient-to-r from-white bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {t('title')}
              </h1>
              <p className="text-muted-foreground mx-auto max-w-3xl text-lg md:text-xl dark:text-gray-300">
                {t('subtitle')}
              </p>
            </motion.div>
          </div>
        </ScrollAnimation>

        {/* 功能标签页 */}
        <ScrollAnimation delay={0.2}>
          <div className="mx-auto max-w-4xl">
            <div className="mb-8 flex justify-center">
              <div className="border-primary/20 bg-muted/50 inline-flex rounded-lg border p-1 backdrop-blur-sm dark:bg-gray-900/50">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 rounded-md px-6 py-3 transition-all duration-300 ${
                        activeTab === tab.id
                          ? // 选中标签：统一使用 primary 渐变，而不是 primary + 纯蓝
                            'from-primary to-primary/70 bg-gradient-to-r text-white shadow-lg'
                          : 'hover:bg-primary/10 text-muted-foreground hover:text-foreground dark:text-gray-400 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 上传区域 */}
            {activeTab === 'upload' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="border-primary/20 bg-muted/50 rounded-2xl border p-8 backdrop-blur-sm dark:bg-gray-900/50"
              >
                <div className="text-center">
                  {/* 主图标区域：改为 primary 单色渐变，贴合 turbo 主题主色 */}
                  <div className="from-primary to-primary/70 mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br">
                    <Upload className="h-12 w-12 text-white" />
                  </div>

                  <h3 className="text-foreground mb-4 text-2xl font-bold dark:text-white">
                    {t('upload.title')}
                  </h3>
                  <p className="text-muted-foreground mb-8 dark:text-gray-400">
                    {t('upload.subtitle')}
                  </p>

                  {/* 语言选择器 */}
                  <div className="mb-6 flex flex-col items-center justify-center gap-4">
                    <div className="flex items-center gap-3">
                      <label
                        htmlFor="output-language-select"
                        className="text-foreground/70 text-sm font-medium dark:text-gray-300"
                      >
                        {t('upload.output_language')}:
                      </label>
                      <Select
                        value={outputLanguage}
                        onValueChange={setOutputLanguage}
                        disabled={isProcessing}
                      >
                        <SelectTrigger
                          id="output-language-select"
                          className="border-primary/30 hover:border-primary/50 bg-background/50 text-foreground w-[280px] dark:bg-gray-800/50 dark:text-white"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-primary/30 bg-background dark:bg-gray-900">
                          <SelectItem value="auto">
                            {t('languages.auto')}
                          </SelectItem>
                          <SelectItem value="zh">
                            {t('languages.zh')}
                          </SelectItem>
                          <SelectItem value="en">
                            {t('languages.en')}
                          </SelectItem>
                          <SelectItem value="es">
                            {t('languages.es')}
                          </SelectItem>
                          <SelectItem value="fr">
                            {t('languages.fr')}
                          </SelectItem>
                          <SelectItem value="de">
                            {t('languages.de')}
                          </SelectItem>
                          <SelectItem value="ja">
                            {t('languages.ja')}
                          </SelectItem>
                          <SelectItem value="ko">
                            {t('languages.ko')}
                          </SelectItem>
                          <SelectItem value="pt">
                            {t('languages.pt')}
                          </SelectItem>
                          <SelectItem value="ru">
                            {t('languages.ru')}
                          </SelectItem>
                          <SelectItem value="ar">
                            {t('languages.ar')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 主题色选择器 */}
                    <div className="flex items-center gap-3">
                      <span className="text-foreground/70 text-sm font-medium dark:text-gray-300">
                        {t('upload.theme_color')}:
                      </span>
                      <div className="flex gap-2">
                        {presetColors.map((preset) => (
                          <button
                            key={preset.name}
                            onClick={() => setCustomThemeColor(preset.value)}
                            className={`h-6 w-6 rounded-full border-2 transition-all ${
                              customThemeColor === preset.value
                                ? 'scale-110 border-white ring-2 ring-white/50'
                                : 'border-transparent hover:scale-110'
                            }`}
                            style={{ backgroundColor: preset.color }}
                            title={preset.name}
                            disabled={isProcessing}
                          />
                        ))}
                        {/* 自定义颜色输入 */}
                        <div className="border-border bg-muted relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border dark:border-gray-600 dark:bg-gray-800">
                          <input
                            type="color"
                            value={customThemeColor || '#6535F6'}
                            onChange={(e) =>
                              setCustomThemeColor(e.target.value)
                            }
                            className="absolute inset-0 h-[150%] w-[150%] -translate-x-1/4 -translate-y-1/4 cursor-pointer opacity-0"
                            disabled={isProcessing}
                          />
                          <div
                            className="h-full w-full rounded-full"
                            style={{
                              backgroundColor:
                                customThemeColor || 'transparent',
                              backgroundImage: !customThemeColor
                                ? 'linear-gradient(to bottom right, #f0f, #0ff)'
                                : 'none',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 
                    非程序员解释：
                    - 浏览器出于安全原因，有时不允许用 JS 直接"点"隐藏的 <input type="file">
                    - 更稳妥的方式是：用 <label htmlFor="..."> 绑定到 input 上
                    - 用户点按钮本质上是在点 label，浏览器就会乖乖弹出"选择文件"的对话框
                  */}
                  <input
                    id="ai-note-file-input"
                    ref={fileInputRef}
                    type="file"
                    // 暂时移除音视频支持：accept="audio/*,video/*,.pdf,.doc,.docx,.txt"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  {/* 使用 Button 作为外壳，把 label 当作子元素渲染（asChild） */}
                  <Button
                    asChild
                    // 上传按钮：使用 primary 为主色的渐变，去掉额外的蓝色终点
                    className="from-primary hover:from-primary/90 to-primary/70 hover:to-primary/80 bg-gradient-to-r px-8 py-4 text-lg text-white"
                    disabled={isProcessing}
                  >
                    <label
                      htmlFor="ai-note-file-input"
                      className="flex cursor-pointer items-center"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
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

                  {/* 支持的文件类型 */}
                  <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-2 max-w-2xl mx-auto">
                    {[
                      /* 暂时隐藏音视频支持
                      {
                        icon: FileAudio,
                        label: t('upload.audio_files'),
                        desc: t('upload.audio_formats'),
                      },
                      {
                        icon: FileVideo,
                        label: t('upload.video_files'),
                        desc: t('upload.video_formats'),
                      },
                      */
                      {
                        icon: FileText,
                        label: t('upload.pdf_docs'),
                        desc: t('upload.pdf_desc'),
                      },
                      {
                        icon: FileText,
                        label: t('upload.text_docs'),
                        desc: t('upload.text_formats'),
                      },
                    ].map((type, idx) => {
                      const Icon = type.icon;
                      return (
                        <div key={idx} className="text-center">
                          <div className="bg-primary/10 mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg">
                            <Icon className="text-primary h-6 w-6" />
                          </div>
                          <p className="text-foreground font-medium dark:text-white">
                            {type.label}
                          </p>
                          <p className="text-muted-foreground text-sm dark:text-gray-500">
                            {type.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* 录音区域 */}
            {activeTab === 'record' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="border-primary/20 bg-muted/50 rounded-2xl border p-8 backdrop-blur-sm dark:bg-gray-900/50"
              >
                <div className="text-center">
                  <div className="from-primary to-primary/70 mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br">
                    <Mic className="h-12 w-12 text-white" />
                  </div>

                  <h3 className="text-foreground mb-4 text-2xl font-bold dark:text-white">
                    {t('record.title')}
                  </h3>
                  <p className="text-muted-foreground mb-8 dark:text-gray-400">
                    {t('record.subtitle')}
                  </p>

                  <Button
                    onClick={() => toast.error(t('record.upgrading_message'))}
                    className="from-primary hover:from-primary/90 to-primary/70 hover:to-primary/80 bg-gradient-to-r px-8 py-4 text-lg text-white"
                  >
                    <Mic className="mr-2 h-5 w-5" />
                    {t('record.start_button')}
                  </Button>

                  <div className="mt-8 text-sm text-gray-500">
                    <p>{t('record.max_duration')}</p>
                    <p>{t('record.features')}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 生成的笔记区域 */}
            {activeTab === 'notes' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="border-primary/20 bg-muted/50 rounded-2xl border p-8 backdrop-blur-sm dark:bg-gray-900/50"
              >
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-foreground text-2xl font-bold dark:text-white">
                    {t('notes.title')}
                  </h3>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyNotes}
                      disabled={isCopying || !generatedNotes}
                      className="border-primary/30 text-primary/80 hover:border-primary/50 disabled:opacity-40"
                    >
                      {isCopying ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      {t('notes.copy')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadImage}
                      disabled={isDownloading || !generatedNotes}
                      className="border-primary/30 text-primary/80 hover:border-primary/50 disabled:opacity-40"
                    >
                      {isDownloading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      {isDownloading
                        ? t('upload.processing')
                        : t('notes.download')}
                    </Button>
                  </div>
                </div>

                {error ? (
                  <div className="py-12 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                      <Zap className="h-8 w-8 text-red-400" />
                    </div>
                    <p className="mb-4 text-red-400">{error}</p>
                    <Button
                      onClick={() => setError('')}
                      variant="outline"
                      className="border-red-500/30 text-red-300 hover:border-red-500/50"
                    >
                      {t('retry')}
                    </Button>
                  </div>
                ) : generatedNotes ? (
                  <div
                    ref={notesContainerRef}
                    className="bg-background text-foreground rounded-lg p-6 text-base leading-relaxed dark:bg-gray-800/50 dark:text-gray-200"
                  >
                    <StudyNotesViewer
                      content={generatedNotes}
                      themeColor={customThemeColor}
                    />
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Brain className="text-muted-foreground mx-auto mb-4 h-16 w-16 dark:text-gray-600" />
                    <p className="text-muted-foreground dark:text-gray-500">
                      {t('notes.no_notes')}
                    </p>
                  </div>
                )}

                {/* 如果有已保存的笔记 ID，显示编辑按钮 */}
                {savedNoteId && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 flex justify-center"
                  >
                    <Link href={withLocale(`/library/notes/${savedNoteId}`)}>
                      <Button 
                        size="lg" 
                        className="shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-white font-semibold px-8 h-12 rounded-full"
                      >
                        <PenSquare className="mr-2 h-5 w-5" />
                        前往编辑器润色
                      </Button>
                    </Link>
                  </motion.div>
                )}

                {/* AI工具栏 */}
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleNavigateWithNotes('flashcards')}
                    disabled={!generatedNotes || dialogLoading}
                    className="border-primary/30 text-primary/80 disabled:opacity-40"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    {t('toolbar.generate_flashcards')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleNavigateWithNotes('quiz')}
                    disabled={!generatedNotes || dialogLoading}
                    className="border-primary/30 text-primary/80 disabled:opacity-40"
                  >
                    <Brain className="mr-2 h-4 w-4" />
                    {t('toolbar.create_quiz')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGeneratePodcast}
                    disabled={!generatedNotes || dialogLoading}
                    className="border-primary/30 text-primary/80 disabled:opacity-40"
                  >
                    <FileAudio className="mr-2 h-4 w-4" />
                    {t('toolbar.generate_podcast')}
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollAnimation>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setDialogType(null);
            setDialogError('');
            setDialogLoading(false);
          }
        }}
      >
        <DialogContent className="border-primary/30 bg-background text-foreground dark:bg-gray-950/95 dark:text-white">
          <DialogHeader>
            <DialogTitle>{getDialogTitles().title}</DialogTitle>
            <DialogDescription className="text-gray-400">
              {getDialogTitles().desc}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">{renderDialogBody()}</div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default AINoteTaker;
