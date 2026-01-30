'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Clock,
  Headphones,
  Radio,
  Volume2,
  Play,
  Pause,
} from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';

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
  language?: string;
}

interface PodcastDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  podcast?: PodcastDetailData | null;
  onDownloadAudio?: (podcast: PodcastDetailData) => Promise<void> | void;
}

const formatDuration = (seconds?: number) => {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const parseOutline = (outline: string) => {
  const sections: Array<{ heading?: string; lines: string[] }> = [];
  let current: { heading?: string; lines: string[] } | null = null;

  outline.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (/^#{1,6}\s+/.test(trimmed)) {
      if (current) sections.push(current);
      current = {
        heading: trimmed.replace(/^#{1,6}\s+/, ''),
        lines: [],
      };
    } else {
      if (!current) current = { lines: [] };
      current.lines.push(trimmed.replace(/^[*-]\s+/, '').replace(/^\d+\.\s+/, ''));
    }
  });

  if (current) sections.push(current);
  return sections.length > 0 ? sections : [{ lines: [outline] }];
};

const SPEAKER_COLORS = [
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#60a5fa',
  '#fbbf24',
  '#fb7185',
  '#2dd4bf',
  '#c084fc',
];

const getSpeakerColor = (key: string, index: number) => {
  const base =
    key
      .split('')
      .reduce((sum, char) => sum + char.charCodeAt(0), 0) + index;
  return SPEAKER_COLORS[base % SPEAKER_COLORS.length];
};

export function PodcastDetailDialog({
  open,
  onOpenChange,
  podcast,
  onDownloadAudio,
}: PodcastDetailDialogProps) {
  if (!podcast) {
    return null;
  }

  const scripts = podcast.scripts || [];
  const hasOutline = Boolean(podcast.outline);
  const hasScripts = scripts.length > 0;
  const initialTab = hasOutline ? 'outline' : 'scripts';
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(
    podcast.duration || 0
  );
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setPlayerDuration(podcast.duration || 0);
  }, [podcast.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoaded = () => {
      if (audio.duration && !Number.isNaN(audio.duration)) {
        setPlayerDuration(audio.duration);
      }
    };
    const handleTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [podcast.audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.error('播放失败', err);
        });
    }
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const handleDownload = async () => {
    if (!podcast.audioUrl) return;
    if (onDownloadAudio) {
      await onDownloadAudio(podcast);
      return;
    }

    try {
      const response = await fetch(podcast.audioUrl);
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${podcast.title}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载失败: ', error);
    }
  };

  const outlineSections = useMemo(
    () => (podcast.outline ? parseOutline(podcast.outline) : []),
    [podcast.outline]
  );

  const speakerColorMap = useMemo(() => {
    const map = new Map<string, { color: string; alignRight: boolean }>();
    scripts.forEach((script, index) => {
      const key =
        script.speakerName || script.speakerId || `speaker-${index}`;
      if (!map.has(key)) {
        const color = getSpeakerColor(key, map.size);
        const alignRight = map.size % 2 === 1;
        map.set(key, { color, alignRight });
      }
    });
    return map;
  }, [scripts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border/50 bg-background/98 backdrop-blur-xl sm:max-w-4xl">
        <DialogHeader className="space-y-3 pb-2">
          <DialogTitle className="text-2xl font-semibold leading-tight tracking-tight text-foreground">
            {podcast.title}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-border/50 bg-muted/30 p-5 shadow-sm backdrop-blur-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge
                variant="secondary"
                className="gap-1.5 rounded-md px-2.5 py-1 font-medium"
              >
                <Clock className="h-3 w-3" />
                {formatDuration(podcast.duration)}
              </Badge>
              {podcast.mode && (
                <Badge className="rounded-md bg-primary/10 px-2.5 py-1 font-medium capitalize text-primary">
                  {podcast.mode}
                </Badge>
              )}
              {podcast.createdDate && (
                <span className="rounded-md bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
                  {podcast.createdDate.toLocaleDateString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>

            {podcast.audioUrl && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-lg text-xs"
                onClick={handleDownload}
              >
                <Download className="h-3.5 w-3.5" />
                下载
              </Button>
            )}
          </div>

          {podcast.audioUrl ? (
            <div className="space-y-3 rounded-lg border border-border/50 bg-background/60 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={handleTogglePlay}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="ml-0.5 h-4 w-4" />
                    )}
                  </Button>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    <span>{formatDuration(currentTime)}</span>
                    <span className="mx-1 text-muted-foreground/50">/</span>
                    <span>{formatDuration(playerDuration)}</span>
                  </div>
                </div>
                <select
                  value={playbackRate}
                  onChange={(e) =>
                    setPlaybackRate(parseFloat(e.target.value))
                  }
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate === 1 ? '正常' : `${rate}x`}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="range"
                min={0}
                max={playerDuration > 0 ? playerDuration : 1}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${
                    playerDuration > 0
                      ? (currentTime / playerDuration) * 100
                      : 0
                  }%, hsl(var(--muted)) ${
                    playerDuration > 0
                      ? (currentTime / playerDuration) * 100
                      : 0
                  }%, hsl(var(--muted)) 100%)`,
                }}
              />
              <audio
                ref={audioRef}
                src={podcast.audioUrl}
                className="hidden"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-background/40 p-4 text-sm text-muted-foreground">
              <Headphones className="h-4 w-4" />
              暂无音频
            </div>
          )}
        </div>

        <Tabs defaultValue={initialTab} className="mt-6">
          <TabsList
            className={`h-9 rounded-lg bg-muted/50 p-1 ${
              hasOutline && hasScripts
                ? 'grid w-full grid-cols-2'
                : 'inline-flex'
            }`}
          >
            {hasOutline && (
              <TabsTrigger
                value="outline"
                className="rounded-md text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                大纲
              </TabsTrigger>
            )}
            {hasScripts && (
              <TabsTrigger
                value="scripts"
                className="rounded-md text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                脚本
              </TabsTrigger>
            )}
          </TabsList>

          {hasOutline && (
            <TabsContent value="outline" className="mt-4">
              <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
                <div className="space-y-5">
                  {outlineSections.map((section, idx) => (
                    <div key={`${section.heading || 'section'}-${idx}`}>
                      {section.heading && (
                        <h4 className="mb-2 text-base font-semibold text-foreground">
                          {section.heading}
                        </h4>
                      )}
                      {section.lines.length > 1 ? (
                        <ul className="space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground [&>li]:relative [&>li]:before:absolute [&>li]:before:-left-4 [&>li]:before:content-['•']">
                          {section.lines.map((line, index) => (
                            <li key={`${line}-${index}`}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {section.lines[0]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          )}

          {hasScripts && (
            <TabsContent value="scripts" className="mt-4">
              <div className="space-y-3">
                {scripts.map((script, index) => {
                  const speakerKey =
                    script.speakerName ||
                    script.speakerId ||
                    `speaker-${index}`;
                  const meta =
                    speakerColorMap.get(speakerKey) || {
                      color: getSpeakerColor(speakerKey, index),
                      alignRight: false,
                    };
                  const isRight = meta.alignRight;

                  return (
                    <div
                      key={`${speakerKey}-${index}`}
                      className={`flex ${isRight ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl border px-4 py-2.5 shadow-sm transition-shadow hover:shadow ${
                          isRight
                            ? 'border-primary/20 bg-primary/10'
                            : 'border-border/50 bg-background/80'
                        }`}
                      >
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span
                            className="inline-flex h-2 w-2 rounded-full ring-1 ring-white/20"
                            style={{ backgroundColor: meta.color }}
                          />
                          <span
                            className="text-xs font-medium"
                            style={{
                              color: isRight
                                ? 'hsl(var(--primary-foreground))'
                                : meta.color,
                            }}
                          >
                            {script.speakerName ||
                              script.speakerId ||
                              `Speaker ${index + 1}`}
                          </span>
                        </div>
                        <p
                          className={`whitespace-pre-line text-sm leading-relaxed ${
                            isRight
                              ? 'text-primary-foreground/90'
                              : 'text-foreground'
                          }`}
                        >
                          {script.content}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

