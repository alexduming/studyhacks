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
import { Label } from '@/shared/components/ui/label';
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
      toast.success('保存成功，预览已更新');
    } catch (error: any) {
      const message = error?.message || '保存失败，请稍后重试';
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
      toast.error('预览区域未找到');
      return;
    }

    try {
      setIsExporting(true);
      toast.info('正在生成图片，请稍候...');

      const node = previewRef.current;
      const isDark = resolvedTheme === 'dark' || theme === 'dark';
      // 使用当前背景色，避免透明背景导致阅读困难
      const backgroundColor = isDark ? '#020617' : '#ffffff';

      const dataUrl = await toPng(node, {
        cacheBust: true,
        backgroundColor,
        // 固定为 1 以确保导出宽度等于 CSS 宽度，不受设备像素比影响
        pixelRatio: 1,
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${title || 'note'}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('图片已保存到本地');
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('导出图片失败：' + error.message);
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
            <h1 className="text-lg leading-none font-semibold">编辑笔记</h1>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span>{noteMeta.wordCount} 字</span>
              <span>·</span>
              <span>
                {lastSavedAt
                  ? '已保存 ' + lastSavedAt.toLocaleTimeString()
                  : '尚未保存'}
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
            title="全屏预览与导出"
          >
            <Eye className="mr-2 h-4 w-4" />
            预览
          </Button>

          <Button onClick={manualSave} disabled={isSaving || !isDirty}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                保存更改
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
            placeholder="无标题笔记"
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
              <option value={0}>正文</option>
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
            <ToolbarButton
              active={!!editor?.isActive('bold')}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              label="加粗"
            >
              <Bold className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              active={!!editor?.isActive('italic')}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              label="斜体"
            >
              <Italic className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              active={!!editor?.isActive('underline')}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              label="下划线"
            >
              <UnderlineIcon className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              active={!!editor?.isActive('blockquote')}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              label="引用块"
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
                title="文字颜色"
              />
            </div>
          </div>

          <div className="min-h-[500px] flex-1">
            {editor ? (
              <EditorContent editor={editor} />
            ) : (
              <div className="text-muted-foreground py-8 text-sm">
                编辑器加载中...
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 全屏预览 Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="flex h-[95vh] w-full max-w-[95vw] flex-col gap-0 p-0 sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-[1400px]">
          <DialogHeader className="flex flex-shrink-0 flex-row items-center justify-between space-y-0 border-b p-4">
            <div className="flex items-center gap-4">
              <DialogTitle>预览模式</DialogTitle>
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
                保存为图片
              </Button>
            </div>
          </DialogHeader>

          <div className="bg-muted/30 flex-1 overflow-y-auto p-4 md:p-8">
            <div
              ref={previewRef}
              className="bg-background mx-auto min-h-full w-full max-w-[800px] rounded-xl p-8 shadow-sm md:p-12"
            >
              <StudyNotesViewer content={markdown} className="max-w-none" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
