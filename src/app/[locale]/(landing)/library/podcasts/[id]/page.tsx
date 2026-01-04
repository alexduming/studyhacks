'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { MiniPodcastPlayer } from '@/shared/components/podcast/mini-podcast-player';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';

interface PodcastScript {
  speakerId?: string;
  speakerName?: string;
  content: string;
}

interface PodcastData {
  id: string;
  title: string;
  description: string;
  outline: string;
  scripts: PodcastScript[];
  audioUrl: string;
  duration: number;
  mode: string;
  language: string;
  createdDate: Date;
  coverUrl?: string;
}

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
      current.lines.push(
        trimmed.replace(/^[*-]\s+/, '').replace(/^\d+\.\s+/, '')
      );
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
    key.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) + index;
  return SPEAKER_COLORS[base % SPEAKER_COLORS.length];
};

export default function PodcastDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const t = useTranslations('podcast');
  const locale = useLocale();
  const [podcast, setPodcast] = useState<PodcastData | null>(null);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (!id) return;

    const fetchPodcast = async () => {
      try {
        const response = await fetch(`/api/podcast?id=${id}`);
        const data = await response.json();

        if (data.success && data.podcast) {
          setPodcast({
            ...data.podcast,
            createdDate: new Date(data.podcast.createdAt),
          });
        } else {
          toast.error(t('libraryPage.not_found'));
          router.push('/library/podcasts');
        }
      } catch (error) {
        console.error('加载播客详情失败:', error);
        toast.error(t('libraryPage.load_fail'));
      } finally {
        setLoading(false);
      }
    };

    fetchPodcast();
  }, [id, router]);

  useEffect(() => {
    if (!podcast?.audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = podcast.audioUrl;
    audio.currentTime = 0;
    setCurrentTime(0);
    setPlayerDuration(podcast.duration || 0);
    setIsPlaying(false);
  }, [podcast?.audioUrl, podcast?.duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !podcast?.audioUrl) return;

    if (isPlaying) {
      audio
        .play()
        .then(() => {
          /* noop */
        })
        .catch((error) => {
          console.error('播放失败', error);
          setIsPlaying(false);
        });
    } else {
      audio.pause();
    }
  }, [isPlaying, podcast?.audioUrl]);

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
  }, [podcast?.audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

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

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const outlineSections = useMemo(
    () => (podcast?.outline ? parseOutline(podcast.outline) : []),
    [podcast?.outline]
  );

  const speakerColorMap = useMemo(() => {
    const map = new Map<string, { color: string; alignRight: boolean }>();
    if (!podcast?.scripts) return map;

    podcast.scripts.forEach((script, index) => {
      const key = script.speakerName || script.speakerId || `speaker-${index}`;
      if (!map.has(key)) {
        const color = getSpeakerColor(key, map.size);
        const alignRight = map.size % 2 === 1;
        map.set(key, { color, alignRight });
      }
    });
    return map;
  }, [podcast?.scripts]);

  const getModeLabel = (mode: string) => {
    const map: Record<string, string> = {
      quick: t('mode.quick.name'),
      deep: t('mode.deep.name'),
      debate: t('mode.debate.name'),
    };
    return map[mode] || mode;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-r-transparent" />
      </div>
    );
  }

  if (!podcast) return null;

  return (
    <div className="bg-background min-h-screen pb-20">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* 头部导航 */}
        <div className="mb-8">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground mb-4 -ml-2"
            onClick={() => router.push('/library/podcasts')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('library.back_to_list')}
          </Button>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="secondary"
                className="rounded-md px-2 py-1 font-medium"
              >
                {(
                  {
                    quick: `⚡ ${t('mode.quick.name')}`,
                    deep: `📖 ${t('mode.deep.name')}`,
                    debate: `💬 ${t('mode.debate.name')}`,
                  } as Record<string, string>
                )[podcast.mode] ?? t('mode.quick.name')}
              </Badge>
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Calendar className="h-3.5 w-3.5" />
                <span>{podcast.createdDate.toLocaleDateString(locale)}</span>
              </div>
            </div>

            <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              {podcast.title}
            </h1>

            {podcast.description && (
              <p className="text-muted-foreground text-lg">
                {podcast.description}
              </p>
            )}
          </div>
        </div>

        {/* 播放器 */}
        <div className="mb-10">
          {podcast.audioUrl ? (
            <>
              <div className="border-border/40 bg-background/85 rounded-2xl border p-2 shadow-lg backdrop-blur-xl">
                <MiniPodcastPlayer
                  title={podcast.title}
                  modeLabel={getModeLabel(podcast.mode)}
                  currentTime={currentTime}
                  duration={playerDuration || podcast.duration || 0}
                  isPlaying={isPlaying}
                  playbackRate={playbackRate}
                  onPlayToggle={() => setIsPlaying((prev) => !prev)}
                  onSeek={handleSeek}
                  onSkip={handleSkip}
                  onPlaybackRateChange={handlePlaybackRateChange}
                  skipBackLabel={t('libraryPage.skip_back')}
                  skipForwardLabel={t('libraryPage.skip_forward')}
                  className="w-full bg-transparent"
                />
              </div>
              <audio ref={audioRef} className="hidden" />
            </>
          ) : (
            <div className="border-border/40 bg-muted/30 text-muted-foreground rounded-2xl border p-6 text-center text-sm">
              {t('libraryPage.no_audio')}
            </div>
          )}
        </div>

        {/* 内容区域 */}
        <Tabs
          defaultValue={podcast.outline ? 'outline' : 'scripts'}
          className="space-y-6"
        >
          <TabsList className="bg-muted/50 h-10 rounded-lg p-1">
            <TabsTrigger
              value="outline"
              className="data-[state=active]:bg-background rounded-md px-6 text-sm font-medium data-[state=active]:shadow-sm"
              disabled={!podcast.outline}
            >
              {t('libraryDetail.outline_tab')}
            </TabsTrigger>
            <TabsTrigger
              value="scripts"
              className="data-[state=active]:bg-background rounded-md px-6 text-sm font-medium data-[state=active]:shadow-sm"
              disabled={!podcast.scripts?.length}
            >
              {t('libraryDetail.script_tab')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outline" className="focus-visible:outline-none">
            <div className="border-border/50 bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
              <div className="space-y-8">
                {outlineSections.map((section, idx) => (
                  <div key={`${section.heading || 'section'}-${idx}`}>
                    {section.heading && (
                      <h3 className="text-foreground mb-3 text-lg font-semibold">
                        {section.heading}
                      </h3>
                    )}
                    {section.lines.length > 1 ? (
                      <ul className="text-muted-foreground space-y-2 pl-5 [&>li]:relative [&>li]:before:absolute [&>li]:before:-left-4 [&>li]:before:content-['•']">
                        {section.lines.map((line, index) => (
                          <li
                            key={`${line}-${index}`}
                            className="leading-relaxed"
                          >
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground leading-relaxed">
                        {section.lines[0]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scripts" className="focus-visible:outline-none">
            <div className="space-y-6">
              {podcast.scripts.map((script, index) => {
                const speakerKey =
                  script.speakerName || script.speakerId || `speaker-${index}`;
                const meta = speakerColorMap.get(speakerKey) || {
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
                      className={`max-w-[85%] rounded-2xl border px-6 py-4 shadow-sm transition-shadow hover:shadow-md ${
                        isRight
                          ? 'border-primary/20 bg-primary/5'
                          : 'border-border/50 bg-card'
                      }`}
                    >
                      <div
                        className={`mb-2 flex items-center gap-2 ${isRight ? 'flex-row-reverse' : ''}`}
                      >
                        <span
                          className="ring-background inline-flex h-2.5 w-2.5 rounded-full ring-2"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span
                          className="text-xs font-semibold tracking-wide"
                          style={{
                            color: isRight ? 'hsl(var(--primary))' : meta.color,
                          }}
                        >
                          {script.speakerName ||
                            script.speakerId ||
                            `Speaker ${index + 1}`}
                        </span>
                      </div>
                      <p className="text-foreground/90 text-base leading-relaxed whitespace-pre-line">
                        {script.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
