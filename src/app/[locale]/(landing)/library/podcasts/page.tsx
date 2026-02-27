'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BookOpenCheck,
  Download,
  Headphones,
  MessageSquare,
  Music,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { MiniPodcastPlayer } from '@/shared/components/podcast/mini-podcast-player';
import { type PodcastDetailData } from '@/shared/components/podcast/podcast-detail-dialog';
import { Button } from '@/shared/components/ui/button';

interface Podcast extends PodcastDetailData {
  description: string;
  audioUrl: string;
  duration: number;
  mode: 'quick' | 'deep' | 'debate';
  language: string;
  createdDate: Date;
}

const ICON_VARIANTS: Record<
  Podcast['mode'] | 'default',
  { Icon: LucideIcon; gradient: string }
> = {
  quick: {
    Icon: Zap,
    gradient: 'from-amber-500/25 via-orange-500/20 to-rose-500/20',
  },
  deep: {
    Icon: BookOpenCheck,
    gradient: 'from-sky-500/20 via-blue-500/20 to-indigo-500/25',
  },
  debate: {
    Icon: MessageSquare,
    gradient: 'from-emerald-500/20 via-teal-500/20 to-cyan-500/20',
  },
  default: {
    Icon: Sparkles,
    gradient: 'from-slate-500/15 via-slate-600/15 to-slate-700/15',
  },
};

const getCardVisual = (mode: Podcast['mode']) =>
  ICON_VARIANTS[mode] || ICON_VARIANTS.default;

export default function PodcastsPage() {
  const router = useRouter();
  const t = useTranslations('podcast');
  const locale = useLocale();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPodcast, setCurrentPodcast] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const skipBackLabel = t('libraryPage.skip_back');
  const skipForwardLabel = t('libraryPage.skip_forward');
  const closePlayerLabel = t('libraryPage.close_player');

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
            let resolvedDuration = p.duration || 0;
            const shouldFetch =
              (!resolvedDuration || resolvedDuration === 120) && p.audioUrl;

            if (shouldFetch) {
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
      toast.error(t('libraryPage.load_fail'));
    } finally {
      setLoading(false);
    }
  };

  // 播放/暂停
  const handlePlayPause = (podcast: Podcast) => {
    if (currentPodcast?.id === podcast.id) {
      setIsPlaying((prev) => !prev);
    } else {
      setCurrentPodcast(podcast);
      setCurrentTime(0);
      setPlayerDuration(podcast.duration || 0);
      setIsPlaying(true);
    }
  };

  // 同步音频源
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentPodcast) return;
    audio.src = currentPodcast.audioUrl;
    audio.currentTime = 0;
    setCurrentTime(0);
    setPlayerDuration(currentPodcast.duration || 0);
  }, [currentPodcast?.id]);

  // 播放状态与时间更新
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentPodcast) return;

    if (isPlaying) {
      audio
        .play()
        .then(() => {
          /* noop */
        })
        .catch((err) => {
          console.error('播放失败:', err);
          setIsPlaying(false);
        });
    } else {
      audio.pause();
    }
  }, [isPlaying, currentPodcast]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateDuration = () => {
      if (audio.duration && !Number.isNaN(audio.duration)) {
        setPlayerDuration(audio.duration);
      }
    };

    const updateTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentPodcast?.audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // 下载
  const downloadPodcastAudio = async (podcast: PodcastDetailData) => {
    if (!podcast.audioUrl) {
      toast.error(t('libraryPage.audio_missing'));
      return;
    }
    try {
      const response = await fetch(podcast.audioUrl);
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${podcast.title || 'podcast'}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(t('libraryPage.download_start'));
    } catch (error) {
      console.error('下载失败:', error);
      toast.error(t('libraryPage.download_fail'));
    }
  };

  // 删除
  const handleDelete = async (podcastId: string) => {
    if (!confirm(t('libraryPage.delete_confirm'))) return;

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
        toast.success(t('libraryPage.delete_success'));
      } else {
        toast.error(data.error || t('libraryPage.delete_fail'));
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error(t('libraryPage.delete_fail'));
    }
  };

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const handleSkip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(
      0,
      Math.min(audio.currentTime + delta, playerDuration)
    );
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const handlePlaybackRateChange = (value: number) => {
    setPlaybackRate(value);
    if (audioRef.current) {
      audioRef.current.playbackRate = value;
    }
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
    return date.toLocaleDateString(locale, {
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
      quick: t('mode.quick.name'),
      deep: t('mode.deep.name'),
      debate: t('mode.debate.name'),
    };
    return labels[mode] || mode;
  };

  const handleCardClick = (podcast: Podcast) => {
    router.push(`/library/podcasts/${podcast.id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="border-primary mb-3 inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-r-transparent"></div>
          <p className="text-muted-foreground text-sm">
            {t('libraryPage.loading')}
          </p>
        </div>
      </div>
    );
  }

  if (podcasts.length === 0) {
    return (
      <div className="border-border/50 bg-muted/20 flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
        <div className="bg-muted mb-3 flex h-14 w-14 items-center justify-center rounded-full">
          <Music className="text-muted-foreground h-6 w-6" />
        </div>
        <h3 className="text-foreground mb-1.5 text-lg font-semibold">
          {t('library.empty_title')}
        </h3>
        <p className="text-muted-foreground mb-5 max-w-sm text-sm leading-relaxed">
          {t('library.empty_description')}
        </p>
        <Link href="/podcast">
          <Button size="sm" variant="default">
            <Headphones className="mr-2 h-4 w-4" />
            {t('library.create_button')}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* 标题 */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            {t('library.title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('library.total_count', { count: podcasts.length })}
          </p>
        </div>
        <Link href="/podcast">
          <Button size="sm" className="gap-2">
            <Headphones className="h-4 w-4" />
            {t('library.create_button')}
          </Button>
        </Link>
      </div>

      {/* 播客列表 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {podcasts.map((podcast, index) => {
          const isActive = currentPodcast?.id === podcast.id;
          const { Icon, gradient } = getCardVisual(podcast.mode);
          const gradientClass = `bg-gradient-to-br ${gradient}`;

          return (
            <motion.div
              key={podcast.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={`group bg-card/50 rounded-2xl border p-5 shadow-sm backdrop-blur-sm transition-all hover:shadow-md ${
                isActive
                  ? 'border-primary/30 ring-primary/20 ring-1'
                  : 'border-border/50 hover:border-border'
              }`}
              onClick={() => handleCardClick(podcast)}
            >
              <div className="space-y-4">
                <div
                  className={`${gradientClass} group/cover relative overflow-hidden rounded-xl p-4`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-background/10 flex h-10 w-10 items-center justify-center rounded-lg backdrop-blur-sm">
                        <Icon className="text-foreground/90 h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <div className="text-foreground/90 text-lg font-semibold tabular-nums">
                          {formatTime(podcast.duration)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1.5">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="bg-background/90 text-foreground hover:bg-background pointer-events-auto h-8 w-8 rounded-lg shadow-sm backdrop-blur transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayPause(podcast);
                      }}
                    >
                      {isActive && isPlaying ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="bg-background/80 text-foreground/70 hover:bg-background hover:text-foreground pointer-events-auto h-8 w-8 rounded-lg shadow-sm backdrop-blur transition-all"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await downloadPodcastAudio(podcast);
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="bg-background/70 text-destructive/80 hover:bg-background hover:text-destructive pointer-events-auto h-8 w-8 rounded-lg shadow-sm backdrop-blur transition-all"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await handleDelete(podcast.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2.5 px-1">
                  <h3 className="text-foreground group-hover:text-primary cursor-pointer text-base leading-snug font-semibold transition-colors">
                    {podcast.title}
                  </h3>
                  <p className="text-muted-foreground group-hover:text-foreground/80 line-clamp-2 cursor-pointer text-sm leading-relaxed transition-colors">
                    {podcast.description}
                  </p>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <span className="bg-primary/8 text-primary rounded-md px-2 py-1 font-medium">
                      {getModeLabel(podcast.mode)}
                    </span>
                    <span className="text-muted-foreground/70">
                      {formatDate(podcast.createdDate)}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {currentPodcast && currentPodcast.audioUrl && (
        <div className="border-border/40 bg-background/80 hover:bg-background/90 hover:shadow-primary/5 fixed bottom-6 left-1/2 z-50 w-[95%] max-w-3xl -translate-x-1/2 rounded-2xl border p-0 shadow-2xl backdrop-blur-xl transition-all duration-300">
          <MiniPodcastPlayer
            title={currentPodcast.title}
            modeLabel={getModeLabel(currentPodcast.mode)}
            currentTime={currentTime}
            duration={playerDuration}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            onPlayToggle={() => setIsPlaying((prev) => !prev)}
            onSeek={handleSeek}
            onSkip={handleSkip}
            onPlaybackRateChange={handlePlaybackRateChange}
            onClose={() => setCurrentPodcast(null)}
            skipBackLabel={skipBackLabel}
            skipForwardLabel={skipForwardLabel}
            closeLabel={closePlayerLabel}
            className="w-full bg-transparent"
          />
        </div>
      )}

      {/* 隐藏的音频元素 */}
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
    </div>
  );
}
