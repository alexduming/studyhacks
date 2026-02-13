'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Clock, Download, Image as ImageIcon, Pencil, X, ZoomIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  InfographicHistoryEntry,
  updateInfographicHistoryAction,
  switchInfographicVersionAction,
} from '@/app/actions/ai_task';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
} from '@/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';

import { InfographicEditDialog } from '../../infographic/infographic-edit-dialog';

interface InfographicCardProps {
  id: string;
  imageUrl: string | null;
  prompt: string;
  formattedDate: string;
  aspectRatio: string;
  resolution: string;
  history: InfographicHistoryEntry[];
}

export function InfographicCard({
  id,
  imageUrl,
  prompt,
  formattedDate,
  aspectRatio,
  resolution,
  history: initialHistory,
}: InfographicCardProps) {
  const t = useTranslations('library.infographics');
  const tInfographic = useTranslations('infographic');
  const router = useRouter();
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // 🎯 编辑对话框状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);

  // 🎯 历史记录状态
  const [history, setHistory] = useState<InfographicHistoryEntry[]>(initialHistory);

  // 打开编辑对话框
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止打开预览对话框
    e.preventDefault();
    if (currentImageUrl) {
      setEditDialogOpen(true);
    }
  };

  // 编辑完成后更新图片和历史记录
  const handleEditComplete = async (newImageUrl: string, editPrompt?: string) => {
    try {
      // 调用 server action 更新历史记录
      const result = await updateInfographicHistoryAction({
        taskId: id,
        newImageUrl,
        editPrompt: editPrompt || '编辑版本',
      });

      if (result.success && result.history) {
        // 更新本地状态
        setHistory(result.history);
        setCurrentImageUrl(newImageUrl);
      }
    } catch (error) {
      console.error('Failed to update history:', error);
      // 即使保存历史失败，也更新当前显示的图片
      setCurrentImageUrl(newImageUrl);
    }

    setEditDialogOpen(false);
    toast.success(
      tInfographic('edit.success', { defaultMessage: 'Infographic updated successfully!' })
    );
  };

  // 🎯 在编辑对话框中切换历史版本
  const handleSwitchVersionInDialog = async (entry: InfographicHistoryEntry) => {
    try {
      await switchInfographicVersionAction({
        taskId: id,
        imageUrl: entry.imageUrl,
      });
      setCurrentImageUrl(entry.imageUrl);
    } catch (error) {
      console.error('Failed to switch version:', error);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the dialog
    e.preventDefault();

    if (!currentImageUrl) return;

    setIsDownloading(true);
    try {
      // Use proxy to avoid CORS issues
      const response = await fetch(`/api/storage/proxy-image?url=${encodeURIComponent(currentImageUrl)}`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `infographic-${id}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback
      window.open(currentImageUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Card
          className="group relative cursor-pointer overflow-hidden transition-all hover:shadow-md hover:border-primary py-0 gap-0"
        >
          {/* 🎯 图片区域：使用自然高度，不固定 aspect-ratio */}
          <div className="bg-muted relative w-full overflow-hidden">
            {currentImageUrl ? (
              <img
                src={currentImageUrl}
                alt={t('card.previewAlt')}
                className="w-full h-auto object-contain transition-transform group-hover:scale-[1.02]"
                loading="lazy"
              />
            ) : (
              <div className="bg-secondary/50 flex aspect-video w-full items-center justify-center">
                <ImageIcon className="text-muted-foreground/50 h-12 w-12" />
              </div>
            )}

            {/* Hover Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
               <ZoomIn className="text-white h-8 w-8 drop-shadow-md" />
            </div>
          </div>

          <CardContent className="px-4 py-3">
             {/* 2. Generation Prompt */}
            <p className="line-clamp-2 text-sm text-muted-foreground" title={prompt}>
              {prompt}
            </p>
          </CardContent>

          <CardFooter className="flex items-center justify-between px-4 pb-4 pt-0 text-xs text-muted-foreground">
             {/* 4. Generation Time */}
            <div className="flex items-center">
              <Clock className="mr-1 h-3 w-3" />
              <span>{formattedDate}</span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              {/* Edit Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:text-foreground z-10"
                onClick={handleEdit}
                title={t('card.edit')}
              >
                <Pencil className="h-4 w-4" />
              </Button>

              {/* Download Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:text-foreground z-10"
                onClick={handleDownload}
                disabled={!currentImageUrl || isDownloading}
                title={t('card.download')}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>

          {/* 🎯 历史版本数量提示 - 只在有历史记录时显示小标记 */}
          {history.length > 0 && (
            <div className="border-t px-4 py-2">
              <span className="text-[10px] text-muted-foreground">
                {history.length} {t('history.versions')}
              </span>
            </div>
          )}
        </Card>
      </DialogTrigger>

      <DialogContent className="max-w-5xl w-[90vw] p-0 overflow-hidden bg-transparent border-none shadow-none focus:outline-none">
        <DialogTitle className="sr-only">{t('card.dialogTitle')}</DialogTitle>
        <div className="relative w-full flex flex-col items-center justify-center">
           {currentImageUrl && (
             <>
               {/* 🎯 关闭按钮 - 右上角固定位置 */}
               <Button
                 variant="secondary"
                 size="icon"
                 className="absolute top-0 right-0 z-10 h-10 w-10 rounded-full bg-background/80 backdrop-blur shadow-lg hover:bg-background"
                 onClick={() => setIsOpen(false)}
               >
                 <X className="h-5 w-5" />
               </Button>

               {/* 图片容器 */}
               <div className="relative bg-background/95 backdrop-blur rounded-lg shadow-2xl overflow-hidden border">
                  <div className="relative w-auto h-auto max-h-[85vh] overflow-auto">
                     <img
                        src={currentImageUrl}
                        alt={t('card.dialogAlt')}
                        className="max-h-[80vh] w-auto max-w-[85vw] object-contain block"
                     />
                  </div>
               </div>

               {/* 🎯 底部操作按钮 - 居中显示，不遮挡图片 */}
               <div className="mt-4 flex gap-3">
                  <Button
                    onClick={handleEdit}
                    className="shadow-lg"
                    variant="secondary"
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('card.edit')}
                  </Button>

                  <Button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="shadow-lg"
                    variant="default"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {isDownloading ? t('card.downloading') : t('card.download')}
                  </Button>
               </div>
             </>
           )}
        </div>
      </DialogContent>
    </Dialog>

    {/* 🎯 编辑对话框 */}
    {currentImageUrl && (
      <InfographicEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        imageUrl={currentImageUrl}
        aspectRatio={aspectRatio}
        resolution={resolution}
        onEditComplete={handleEditComplete}
        history={history}
        onSwitchVersion={handleSwitchVersionInDialog}
      />
    )}
    </>
  );
}

