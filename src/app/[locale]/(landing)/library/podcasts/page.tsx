'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Clock,
  Download,
  Headphones,
  Music,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  PodcastDetailDialog,
  type PodcastDetailData,
} from '@/shared/components/podcast/podcast-detail-dialog';
import { Button } from '@/shared/components/ui/button';

interface Podcast extends PodcastDetailData {
  description: string;
  audioUrl: string;
  duration: number;
  mode: 'quick' | 'deep' | 'debate';
  language: string;
  createdDate: Date;
}

export default function PodcastsPage() {
  const t = useTranslations('podcast');
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPodcast, setCurrentPodcast] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [detailPodcast, setDetailPodcast] = useState<Podcast | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleOpenDetails = (podcast: Podcast) => {
    setDetailPodcast(podcast);
    setIsDetailOpen(true);
  };

  // 加载播客列表
  useEffect(() => {
    loadPodcasts();
  }, []);

  const loadPodcasts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/podcast');
      const data = await response.json();

      if (data.success && Array.isArray(data.podcasts)) {
        const mapped: Podcast[] = await Promise.all(
          data.podcasts.map(async (p: any) => {
            const baseDuration = p.duration || 0;
            let resolvedDuration = baseDuration;
            if (!baseDuration && p.audioUrl) {
              resolvedDuration = Math.round(
                await fetchAudioDuration(p.audioUrl)
              );
            }

            return {
              id: p.id,
              title: p.title,
              description: p.description || '',
              audioUrl: p.audioUrl,
              duration: resolvedDuration,
              mode: p.mode,
              language: p.language,
              createdDate: new Date(p.createdAt),
              outline: p.outline || '',
              scripts: Array.isArray(p.scripts) ? p.scripts : [],
              coverUrl: p.coverUrl || undefined,
            };
          })
        );
        setPodcasts(mapped);
      }
    } catch (error) {
      console.error('加载播客失败:', error);
      toast.error('加载播客列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 播放/暂停
  const handlePlayPause = (podcast: Podcast) => {
    if (currentPodcast?.id === podcast.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
    } else {
      setCurrentPodcast(podcast);
      setIsPlaying(true);
    }
  };

  // 监听音频播放状态
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentPodcast) return;

    audio.src = currentPodcast.audioUrl;
    if (isPlaying) {
      audio.play().catch((err) => {
        console.error('播放失败:', err);
        setIsPlaying(false);
      });
    }
  }, [currentPodcast, isPlaying]);

  // 下载
  const handleDownload = (podcast: Podcast) => {
    const link = document.createElement('a');
    link.href = podcast.audioUrl;
    link.download = `${podcast.title}.mp3`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('开始下载');
  };

  // 删除
  const handleDelete = async (podcastId: string) => {
    if (!confirm('确定要删除这个播客吗？')) return;

    try {
      const response = await fetch(`/api/podcast?id=${podcastId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setPodcasts((prev) => prev.filter((p) => p.id !== podcastId));
        if (currentPodcast?.id === podcastId) {
          setCurrentPodcast(null);
          setIsPlaying(false);
        }
        toast.success('删除成功');
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败');
    }
  };

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const fetchAudioDuration = async (url?: string) => {
    if (!url) return 0;
    return new Promise<number>((resolve) => {
      const audio = document.createElement('audio');
      audio.src = url;
      audio.preload = 'metadata';
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration || 0);
      });
      audio.addEventListener('error', () => resolve(0));
    });
  };

  // 格式化日期
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 模式标签
  const getModeLabel = (mode: string) => {
    const labels: Record<string, string> = {
      quick: '速听',
      deep: '深度',
      debate: '辩论',
    };
    return labels[mode] || mode;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="border-primary mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-r-transparent"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  if (podcasts.length === 0) {
    return (
      <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <div className="bg-muted mb-4 rounded-full p-4">
          <Music className="text-muted-foreground h-8 w-8" />
        </div>
        <h3 className="mb-2 text-xl font-semibold capitalize">播客库</h3>
        <p className="text-muted-foreground mb-6 max-w-md">
          您还没有生成任何播客。开始创建内容来构建您的播客库。
        </p>
        <Link href="/podcast">
          <Button variant="outline">生成新播客</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">我的播客库</h1>
          <p className="text-muted-foreground mt-2">
            共 {podcasts.length} 个播客
          </p>
        </div>
        <Link href="/podcast">
          <Button>
            <Headphones className="mr-2 h-4 w-4" />
            生成新播客
          </Button>
        </Link>
      </div>

      {/* 播客列表 */}
      <div className="grid gap-4">
        {podcasts.map((podcast, index) => (
          <motion.div
            key={podcast.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className={`bg-card rounded-xl border p-6 transition-all hover:shadow-lg ${
              currentPodcast?.id === podcast.id
                ? 'border-primary bg-primary/5'
                : ''
            }`}
            onClick={() => handleOpenDetails(podcast)}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-1 items-start gap-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayPause(podcast);
                    }}
                    className="bg-primary text-primary-foreground flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
                  >
                    {currentPodcast?.id === podcast.id && isPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="ml-0.5 h-5 w-5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 truncate text-lg font-semibold">
                      {podcast.title}
                    </h3>
                    <p className="text-muted-foreground mb-2 line-clamp-2 text-sm">
                      {podcast.description}
                    </p>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(podcast.duration)}
                      </span>
                      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5">
                        {getModeLabel(podcast.mode)}
                      </span>
                      <span>{formatDate(podcast.createdDate)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(podcast);
                    }}
                    title="下载"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(podcast.id);
                    }}
                    title="删除"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenDetails(podcast);
                  }}
                >
                  {t('library.view_details')}
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 隐藏的音频元素 */}
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />

      <PodcastDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        podcast={detailPodcast}
      />
    </div>
  );
}
