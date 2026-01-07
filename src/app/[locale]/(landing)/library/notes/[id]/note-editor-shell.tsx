'use client';

import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { toPng } from 'html-to-image';
import {
  ArrowLeft,
  Bold,
  Download,
  Eye,
  Italic,
  Loader2,
  Maximize2,
  Quote,
  Save,
  Underline as UnderlineIcon,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import TurndownService from 'turndown';

import { StudyNotesViewer } from '@/shared/components/ai-elements/study-notes-viewer';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { renderMarkdownToHtml } from '@/shared/lib/note-format';

type SerializableNote = {
  id: string;
  title: string;
  markdown: string;
  html: string | null;
  summary: string | null;
  language: string | null;
  tags: string[];
  wordCount: number;
  status: string;
  sourceType: string | null;
  sourceName: string | null;
  createdAt: string;
  updatedAt: string;
};

interface NoteEditorShellProps {
  locale?: string;
  initialNote: SerializableNote;
}

export function NoteEditorShell({ locale, initialNote }: NoteEditorShellProps) {
  const { theme, resolvedTheme } = useTheme();
  const t = useTranslations('library.note-editor');
  const initialHtml = useMemo(
    () => initialNote.html || renderMarkdownToHtml(initialNote.markdown),
    [initialNote.html, initialNote.markdown]
  );

  const [title, setTitle] = useState(initialNote.title);
  const [markdown, setMarkdown] = useState(initialNote.markdown);
  const [editorHtml, setEditorHtml] = useState(initialHtml);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    initialNote.updatedAt ? new Date(initialNote.updatedAt) : null
  );
  const [noteMeta, setNoteMeta] = useState({
    createdAt: initialNote.createdAt,
    updatedAt: initialNote.updatedAt,
    wordCount: initialNote.wordCount,
    status: initialNote.status,
    sourceName: initialNote.sourceName,
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const turndownRef = useRef(
    new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    })
  );

  const persistChanges = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/library/notes/${initialNote.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          markdown,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save note');
      }

      setLastSavedAt(new Date(data.note.updatedAt));
      setNoteMeta((prev) => ({
        ...prev,
        updatedAt: data.note.updatedAt,
        wordCount: data.note.wordCount,
      }));
      setIsDirty(false);
      toast.success(t('toast.saveSuccess'));
    } catch (error: any) {
      const message = error?.message || t('toast.saveFail');
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [initialNote.id, markdown, title]);

  useEffect(() => {
    setTitle(initialNote.title);
    setMarkdown(initialNote.markdown);
    setEditorHtml(initialHtml);
    setLastSavedAt(
      initialNote.updatedAt ? new Date(initialNote.updatedAt) : null
    );
    setNoteMeta({
      createdAt: initialNote.createdAt,
      updatedAt: initialNote.updatedAt,
      wordCount: initialNote.wordCount,
      status: initialNote.status,
      sourceName: initialNote.sourceName,
    });
    setIsDirty(false);
  }, [initialHtml, initialNote]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextStyle,
      Color,
      Underline,
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class:
          'prose prose-slate dark:prose-invert max-w-none min-h-[500px] focus:outline-none text-base sm:text-lg',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setEditorHtml(html);
      const md = turndownRef.current.turndown(html);
      setMarkdown(md);
      setIsDirty(true);
    },
  });

  useEffect(() => {
    if (editor) {
      editor.commands.setContent(initialHtml, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, initialHtml, initialNote.id]);

  const [textColor, setTextColor] = useState('#111827');

  const manualSave = async () => {
    await persistChanges();
  };

  const exportAsImage = async () => {
    if (!previewRef.current) {
      toast.error(t('toast.previewMissing'));
      return;
    }

    try {
      setIsExporting(true);
      toast.info(t('toast.generating'));

      const node = previewRef.current;
      const isDark = resolvedTheme === 'dark' || theme === 'dark';
      // 使用当前背景色，避免透明背景导致阅读困难
      const backgroundColor = isDark ? '#020617' : '#ffffff';

      // 获取内容的真实滚动高度
      const scrollHeight = node.scrollHeight;

      const dataUrl = await toPng(node, {
        cacheBust: true,
        backgroundColor,
        // 使用 2 倍图保证文字清晰
        pixelRatio: 2,
        // 锁定 CSS 宽度为 800px (导出后为 1600px，适合手机阅读)
        width: 800,
        // 锁定高度为完整内容高度
        height: scrollHeight,
        // 强制样式：清除 margin，确保高度自动撑开，移除滚动裁剪
        style: {
          margin: '0',
          height: 'auto',
          minHeight: `${scrollHeight}px`,
          maxHeight: 'none',
          overflow: 'visible',
          // 增加底部内边距，防止高度计算误差导致底部内容被裁剪
          paddingBottom: '40px',
        },
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${title || 'note'}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(t('toast.exportSuccess'));
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(t('toast.exportFail', { message: error.message }));
    } finally {
      setIsExporting(false);
    }
  };

  const withLocale = (path: string) => (locale ? `/${locale}${path}` : path);

  const handleHeadingChange = (level: number) => {
    if (!editor) return;
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
      return;
    }
    // Tiptap 的 setHeading 只接受 1-6 作为 level，这里显式转换类型
    editor
      .chain()
      .focus()
      .setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
      .run();
  };

  const applyColor = (color: string) => {
    if (!editor) return;
    editor.chain().focus().setColor(color).run();
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setIsDirty(true);
  };

  const ToolbarButton = ({
    active,
    onClick,
    label,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    label: string;
    children: ReactNode;
  }) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={
        active
          ? 'border-primary bg-primary/10 text-primary inline-flex h-8 items-center justify-center rounded-md border px-2 text-sm font-medium'
          : 'text-muted-foreground hover:text-foreground inline-flex h-8 items-center justify-center rounded-md border border-transparent px-2 text-sm font-medium'
      }
    >
      {children}
    </button>
  );

  const headingValue = editor?.isActive('heading', { level: 1 })
    ? 1
    : editor?.isActive('heading', { level: 2 })
      ? 2
      : editor?.isActive('heading', { level: 3 })
        ? 3
        : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 顶部操作栏 */}
      <div className="bg-background/95 sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href={withLocale('/library/notes')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="space-y-1">
            <h1 className="text-lg leading-none font-semibold">
              {t('header.title')}
            </h1>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span>
                {t('header.wordCount', { count: noteMeta.wordCount })}
              </span>
              <span>·</span>
              <span>
                {lastSavedAt
                  ? t('status.saved', {
                      time: lastSavedAt.toLocaleTimeString(),
                    })
                  : t('status.unsaved')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-destructive mr-2 text-sm">{saveError}</span>
          )}

          <Button
            variant="outline"
            onClick={() => setIsFullscreen(true)}
            title={t('buttons.previewTooltip')}
          >
            <Eye className="mr-2 h-4 w-4" />
            {t('buttons.preview')}
          </Button>

          <Button onClick={manualSave} disabled={isSaving || !isDirty}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('buttons.saving')}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t('buttons.save')}
              </>
            )}
          </Button>
        </div>
      </div>

      <Card className="flex min-h-[80vh] flex-col space-y-6 p-6 md:p-8">
        {/* 标题和元数据区域 */}
        <div className="space-y-4">
          <Input
            id="note-title"
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            placeholder={t('placeholders.title')}
            className="placeholder:text-muted-foreground/50 h-auto border-none px-0 text-2xl font-bold shadow-none focus-visible:ring-0 md:text-3xl"
          />

          <div className="text-muted-foreground flex items-center gap-4 border-b pb-4 text-sm">
            <div className="flex items-center gap-1">
              <span>{new Date(noteMeta.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* 编辑器区域 */}
        <div className="flex flex-1 flex-col">
          <div className="bg-background/95 sticky top-[73px] z-10 mb-4 flex flex-wrap items-center gap-2 border-b py-2 backdrop-blur">
            <select
              className="h-8 rounded-md border bg-transparent px-2 text-sm"
              value={headingValue}
              onChange={(event) =>
                handleHeadingChange(Number(event.target.value))
              }
            >
              <option value={0}>{t('toolbar.paragraph')}</option>
              <option value={1}>{t('toolbar.heading1')}</option>
              <option value={2}>{t('toolbar.heading2')}</option>
              <option value={3}>{t('toolbar.heading3')}</option>
            </select>
            <ToolbarButton
              active={!!editor?.isActive('bold')}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              label={t('toolbar.bold')}
            >
              <Bold className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              active={!!editor?.isActive('italic')}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              label={t('toolbar.italic')}
            >
              <Italic className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              active={!!editor?.isActive('underline')}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              label={t('toolbar.underline')}
            >
              <UnderlineIcon className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              active={!!editor?.isActive('blockquote')}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              label={t('toolbar.blockquote')}
            >
              <Quote className="h-4 w-4" />
            </ToolbarButton>
            <div className="ml-auto flex items-center gap-1 md:ml-0">
              <input
                type="color"
                value={textColor}
                onChange={(event) => {
                  setTextColor(event.target.value);
                  applyColor(event.target.value);
                }}
                className="h-6 w-6 cursor-pointer rounded border bg-transparent p-0"
                title={t('toolbar.color')}
              />
            </div>
          </div>

          <div className="min-h-[500px] flex-1">
            {editor ? (
              <EditorContent editor={editor} />
            ) : (
              <div className="text-muted-foreground py-8 text-sm">
                {t('labels.editorLoading')}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 全屏预览 Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="flex h-[95vh] w-full max-w-[95vw] flex-col gap-0 p-0 sm:max-w-[95vw] md:max-w-[900px] lg:max-w-[950px]">
          <DialogHeader className="flex flex-shrink-0 flex-row items-center justify-between space-y-0 border-b p-4">
            <div className="flex items-center gap-4">
              <DialogTitle>{t('labels.previewDialog')}</DialogTitle>
              <span className="text-muted-foreground hidden text-sm sm:inline-block">
                {title}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportAsImage}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {t('buttons.export')}
              </Button>
            </div>
          </DialogHeader>

          <div className="bg-muted/30 flex flex-1 justify-center overflow-y-auto p-4 md:p-8">
            <div
              ref={previewRef}
              className="bg-background min-h-full w-full max-w-[800px] rounded-xl p-6 shadow-sm md:p-8"
            >
              <StudyNotesViewer
                content={markdown}
                className="max-w-none"
                disableAnimation
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
