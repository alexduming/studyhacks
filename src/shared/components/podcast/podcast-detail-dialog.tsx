'use client';

import Image from 'next/image';
import { Download, Clock, Headphones } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';

export interface PodcastScript {
  speakerId?: string;
  speakerName?: string;
  content: string;
}

export interface PodcastDetailData {
  id: string;
  title: string;
  description?: string;
  outline?: string;
  scripts?: PodcastScript[];
  audioUrl?: string;
  mode?: string;
  duration?: number;
  createdDate?: Date;
  coverUrl?: string;
}

interface PodcastDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  podcast?: PodcastDetailData | null;
}

const formatDuration = (seconds?: number) => {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function PodcastDetailDialog({
  open,
  onOpenChange,
  podcast,
}: PodcastDetailDialogProps) {
  if (!podcast) {
    return null;
  }

  const scripts = podcast.scripts || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            {podcast.title}
          </DialogTitle>
          {podcast.description && (
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {podcast.description}
            </p>
          )}
        </DialogHeader>

        {/* 封面与元信息 */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="relative h-48 w-full overflow-hidden rounded-lg border bg-muted">
            {podcast.coverUrl ? (
              <Image
                src={podcast.coverUrl}
                alt={podcast.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Headphones className="h-10 w-10" />
              </div>
            )}
          </div>

          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>时长：{formatDuration(podcast.duration)}</span>
            </div>
            {podcast.mode && (
              <div>
                模式：
                <span className="font-medium capitalize text-foreground">
                  {podcast.mode}
                </span>
              </div>
            )}
            {podcast.createdDate && (
              <div>
                创建时间：
                {podcast.createdDate.toLocaleString()}
              </div>
            )}
            {podcast.audioUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = podcast.audioUrl as string;
                  link.download = `${podcast.title}.mp3`;
                  link.target = '_blank';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                下载音频
              </Button>
            )}
          </div>
        </div>

        {/* 播放器 */}
        {podcast.audioUrl && (
          <audio
            controls
            className="w-full rounded-lg border"
            src={podcast.audioUrl}
          />
        )}

        {/* 大纲 */}
        {podcast.outline && (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">大纲</h3>
            <div className="whitespace-pre-line rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              {podcast.outline}
            </div>
          </div>
        )}

        {/* 脚本 */}
        {scripts.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">完整脚本</h3>
            <div className="space-y-4">
              {scripts.map((script, index) => (
                <div
                  key={`${script.speakerId || index}-${index}`}
                  className="rounded-lg border bg-muted/20 p-4 text-sm"
                >
                  <div className="mb-2 font-semibold text-foreground">
                    {script.speakerName || `Speaker ${index + 1}`}
                  </div>
                  <p className="whitespace-pre-line text-muted-foreground">
                    {script.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

