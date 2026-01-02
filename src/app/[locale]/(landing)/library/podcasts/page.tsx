'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Music, Play, Pause, Clock, Download, Share2, Trash2, Headphones } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface Podcast {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  duration: number;
  mode: 'quick' | 'deep' | 'debate';
  language: string;
  createdAt: string;
}

export default function PodcastsPage() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPodcast, setCurrentPodcast] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

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
        setPodcasts(data.podcasts);
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

  // 分享
  const handleShare = async (podcast: Podcast) => {
    const shareData = {
      title: podcast.title,
      text: podcast.description,
      url: podcast.audioUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toast.success('分享成功');
      } else {
        await navigator.clipboard.writeText(podcast.audioUrl);
        toast.success('链接已复制到剪贴板');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        toast.error('分享失败');
      }
    }
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

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
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
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
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
          <p className="text-muted-foreground mt-2">共 {podcasts.length} 个播客</p>
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
            className={`rounded-xl border bg-card p-6 transition-all hover:shadow-lg ${
              currentPodcast?.id === podcast.id ? 'border-primary bg-primary/5' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              {/* 左侧：播放按钮和信息 */}
              <div className="flex flex-1 items-start gap-4">
                <button
                  onClick={() => handlePlayPause(podcast)}
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
                >
                  {currentPodcast?.id === podcast.id && isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5 ml-0.5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold mb-1 truncate">{podcast.title}</h3>
                  <p className="text-muted-foreground text-sm mb-2 line-clamp-2">
                    {podcast.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(podcast.duration)}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                      {getModeLabel(podcast.mode)}
                    </span>
                    <span>{formatDate(podcast.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* 右侧：操作按钮 */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(podcast)}
                  title="下载"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleShare(podcast)}
                  title="分享"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(podcast.id)}
                  title="删除"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 隐藏的音频元素 */}
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
    </div>
  );
}
