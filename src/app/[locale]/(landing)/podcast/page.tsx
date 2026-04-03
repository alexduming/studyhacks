'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock,
  Download,
  FileText,
  Globe,
  Headphones,
  Link as LinkIcon,
  MessageSquare,
  Mic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
  Upload,
  Users,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { CreditsCost } from '@/shared/components/ai-elements/credits-display';
import {
  PodcastDetailDialog,
  type PodcastDetailData,
} from '@/shared/components/podcast/podcast-detail-dialog';
import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { buildPodcastDownloadUrl } from '@/shared/lib/podcast-download';

// 播客模式类型
type PodcastMode = 'quick' | 'deep' | 'debate';

// 输入类型
type InputType = 'text' | 'file' | 'link';

// 音色配置
interface VoiceConfig {
  speaker_1: string;
  speaker_2?: string;
}

// 播客数据接口
interface Podcast extends PodcastDetailData {
  description: string;
  duration: number;
  mode: PodcastMode;
  language: string;
  audioUrl?: string;
  createdDate: Date;
  subtitlesUrl?: string;
  audioStreamUrl?: string;
}

// 音色接口
interface Speaker {
  speakerId: string;
  speakerName: string;
  language: string;
  gender?: string;
  demoAudioUrl?: string;
}

/**
 * 支持的平台Logo配置
 * 根据 ListenHub 文档，支持常见的视频和文章平台
 */
const SUPPORTED_PLATFORMS = [
  { name: 'YouTube', icon: '🎬', domain: 'youtube.com' },
  { name: 'Bilibili', icon: '📺', domain: 'bilibili.com' },
  { name: 'Twitter/X', icon: '𝕏', domain: 'twitter.com' },
  { name: 'Medium', icon: '📝', domain: 'medium.com' },
  { name: 'Reddit', icon: '🔴', domain: 'reddit.com' },
  { name: '知乎', icon: '知', domain: 'zhihu.com' },
  { name: '微信公众号', icon: '微', domain: 'mp.weixin.qq.com' },
];

const PodcastApp = () => {
  const t = useTranslations('podcast');
  const insufficientCreditsToast = t.has('errors.insufficient_credits_short')
    ? t('errors.insufficient_credits_short')
    : 'Insufficient credits. Please top up and try again.';

  // 添加自定义滚动条样式
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: rgba(55, 65, 81, 0.3);
        border-radius: 3px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(139, 92, 246, 0.5);
        border-radius: 3px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(139, 92, 246, 0.7);
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // ===== 状态管理 =====
  // 播客生成相关
  const [mode, setMode] = useState<PodcastMode>('deep');
  const [language, setLanguage] = useState('zh');
  const [inputType, setInputType] = useState<InputType>('text');
  const [textContent, setTextContent] = useState('');
  const [linkContent, setLinkContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [speakerCount, setSpeakerCount] = useState<'single' | 'dual'>('single');
  const [voices, setVoices] = useState<VoiceConfig>({
    speaker_1: 'CN-Man-Beijing-V2',
    speaker_2: undefined,
  });

  // 音色列表状态
  const [availableSpeakers, setAvailableSpeakers] = useState<Speaker[]>([]);
  const [isLoadingSpeakers, setIsLoadingSpeakers] = useState(false);
  const [playingDemoId, setPlayingDemoId] = useState<string | null>(null); // 当前播放的试听音色ID

  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | null>(null);

  // 播放器相关
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [currentPodcast, setCurrentPodcast] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [detailPodcast, setDetailPodcast] = useState<Podcast | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const demoAudioRef = useRef<HTMLAudioElement>(null); // 用于播放音色试听
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ===== 获取音色列表 =====
  useEffect(() => {
    const fetchSpeakers = async () => {
      setIsLoadingSpeakers(true);
      try {
        const response = await fetch(
          `/api/ai/podcast/speakers?language=${language}`
        );
        const data = await response.json();

        if (data.success && Array.isArray(data.speakers)) {
          setAvailableSpeakers(data.speakers);

          // 如果获取到了音色，且当前选择的音色不在列表中，默认选中第一个
          if (data.speakers.length > 0) {
            const firstSpeaker = data.speakers[0].speakerId;

            setVoices((prev) => {
              // 检查当前 speaker_1 是否有效
              const isSpeaker1Valid = data.speakers.some(
                (s: Speaker) => s.speakerId === prev.speaker_1
              );
              const newSpeaker1 = isSpeaker1Valid
                ? prev.speaker_1
                : firstSpeaker;

              // 检查当前 speaker_2 是否有效（如果有的话）
              let newSpeaker2 = prev.speaker_2;
              if (prev.speaker_2) {
                const isSpeaker2Valid = data.speakers.some(
                  (s: Speaker) => s.speakerId === prev.speaker_2
                );
                newSpeaker2 = isSpeaker2Valid ? prev.speaker_2 : firstSpeaker;
              }

              return {
                speaker_1: newSpeaker1,
                speaker_2: newSpeaker2,
              };
            });
          }
        }
      } catch (error) {
        console.error('获取音色失败:', error);
        // 如果失败，保留默认值或清空
      } finally {
        setIsLoadingSpeakers(false);
      }
    };

    fetchSpeakers();
  }, [language]);

  // ===== 从数据库加载播客历史 =====
  useEffect(() => {
    const loadPodcasts = async () => {
      try {
        const response = await fetch('/api/podcast');
        const data = await response.json();

        if (data.success && Array.isArray(data.podcasts)) {
          const loadedPodcasts: Podcast[] = await Promise.all(
            data.podcasts.map(async (p: any) => {
              // 优先从音频文件获取实际时长
              // 如果数据库中的值是默认值120（2分钟）或0，则重新获取实际时长
              let resolvedDuration = p.duration || 0;
              if (p.audioUrl) {
                // 如果数据库中的值是默认值120或0，尝试从音频文件获取实际时长
                if (!resolvedDuration || resolvedDuration === 120) {
                  try {
                    const actualDuration = await getAudioDuration(p.audioUrl);
                    if (actualDuration > 0) {
                      resolvedDuration = Math.round(actualDuration);
                    } else {
                      // 如果获取失败，保持数据库中的值（或使用默认值120）
                      resolvedDuration = resolvedDuration || 120;
                    }
                  } catch (error) {
                    // 如果获取出错，使用数据库中的值
                    console.warn(`获取播客 ${p.id} 的时长失败:`, error);
                    resolvedDuration = resolvedDuration || 120;
                  }
                }
              } else {
                // 如果没有音频URL，使用数据库中的值或默认值
                resolvedDuration = resolvedDuration || 120;
              }
              return {
                id: p.id,
                title: p.title,
                description: p.description || '',
                duration: resolvedDuration,
                mode: p.mode as PodcastMode,
                language: p.language,
                audioUrl: p.audioUrl,
                createdDate: new Date(p.createdAt),
                outline: p.outline || '',
                scripts: Array.isArray(p.scripts) ? p.scripts : [],
                coverUrl: p.coverUrl || undefined,
                subtitlesUrl: p.subtitlesUrl || undefined,
              };
            })
          );

          setPodcasts(loadedPodcasts);
        }
      } catch (error) {
        console.error('加载播客历史失败:', error);
      }
    };

    loadPodcasts();
  }, []); // 只在组件加载时执行一次

  // ===== 播放器效果 =====
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const handleEnd = () => setIsPlaying(false);
    const handleMetadata = () => {
      setPlayerDuration(audio.duration || 0);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', handleEnd);
    audio.addEventListener('loadedmetadata', handleMetadata);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', handleEnd);
      audio.removeEventListener('loadedmetadata', handleMetadata);
    };
  }, [currentPodcast]);

  // 播放控制
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch((err) => {
        console.error('播放失败:', err);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (currentPodcast?.duration) {
      setPlayerDuration(currentPodcast.duration);
    }
  }, [currentPodcast?.id, currentPodcast?.duration]);

  useEffect(() => {
    if (playerDuration > 0 && currentTime > playerDuration) {
      setCurrentTime(playerDuration);
    }
  }, [playerDuration, currentTime]);

  // ===== 自动生成播客标题和摘要 =====
  const generatePodcastTitle = (content: string): string => {
    if (!content || content.trim().length === 0) {
      return '未命名播客';
    }

    // 移除多余的空格和换行
    const cleanContent = content.trim().replace(/\s+/g, ' ');

    // 提取前30个字符作为标题
    const title = cleanContent.substring(0, 30);
    return title.length < cleanContent.length ? `${title}...` : title;
  };

  const generatePodcastDescription = (content: string): string => {
    if (!content || content.trim().length === 0) {
      return 'AI 生成的播客内容';
    }

    // 移除多余的空格和换行
    const cleanContent = content.trim().replace(/\s+/g, ' ');

    // 提取前100个字符作为摘要
    const description = cleanContent.substring(0, 100);
    return description.length < cleanContent.length
      ? `${description}...`
      : description;
  };

  // ===== 音色试听处理 =====
  const handlePlayDemo = (speaker: Speaker) => {
    if (!speaker.demoAudioUrl) {
      toast.error('该音色暂无试听');
      return;
    }

    const demoAudio = demoAudioRef.current;
    if (!demoAudio) return;

    // 如果正在播放同一个音色，则暂停
    if (playingDemoId === speaker.speakerId) {
      demoAudio.pause();
      setPlayingDemoId(null);
      return;
    }

    // 播放新的音色试听
    demoAudio.src = speaker.demoAudioUrl;
    demoAudio.play().catch((err) => {
      console.error('播放试听失败:', err);
      toast.error('播放试听失败');
    });
    setPlayingDemoId(speaker.speakerId);

    // 播放结束后重置状态
    demoAudio.onended = () => {
      setPlayingDemoId(null);
    };
  };

  // ===== 下载播客音频 =====
  const downloadPodcastAudio = async (podcast: PodcastDetailData) => {
    if (!podcast.audioUrl) {
      toast.error('音频文件不存在');
      return;
    }

    try {
      // 使用 fetch 获取音频文件 blob，避免直接跳转
      const response = await fetch(
        buildPodcastDownloadUrl({
          id: podcast.id,
          audioUrl: podcast.audioUrl,
          title: podcast.title,
        })
      );
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${podcast.title || 'podcast'}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('开始下载播客音频');
    } catch (error) {
      console.error('下载失败:', error);
      toast.error('下载失败，请稍后重试');
    }
  };

  const handleDownload = async () => {
    if (!currentPodcast) {
      toast.error('音频文件不存在');
      return;
    }
    downloadPodcastAudio(currentPodcast);
  };
  // ===== 文件上传处理 =====
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 验证文件类型
      const allowedTypes = [
        'application/pdf',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/epub+zip',
        'text/markdown',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ];

      if (!allowedTypes.includes(file.type)) {
        toast.error(t('errors.invalid_format'));
        return;
      }

      // 验证文件大小 (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t('errors.file_too_large'));
        return;
      }

      setSelectedFile(file);
      setInputType('file');
    }
  };

  // ===== 查询播客状态 =====
  const queryPodcastStatus = async (episodeId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/ai/podcast?episodeId=${episodeId}`);
      const data = await response.json();

      if (!data.success && data.taskStatus !== 'success') {
        if (data.taskStatus === 'failed') {
          toast.error(t('generate.error'));
          return true; // 停止轮询
        }
        return false; // 继续轮询
      }

      // 任务完成
      if (data.taskResult?.audioUrl) {
        const podcastTitle =
          data.taskResult.title || generatePodcastTitle(textContent);
        const outlineText = data.taskResult.outline || '';
        const podcastDescription =
          outlineText || generatePodcastDescription(textContent);
        const resolvedDuration =
          (typeof data.taskResult.duration === 'number' &&
          data.taskResult.duration > 0
            ? data.taskResult.duration
            : await getAudioDuration(data.taskResult.audioUrl)) || 0;
        const roundedDuration = Math.round(resolvedDuration);

        const newPodcast: Podcast = {
          id: episodeId,
          title: podcastTitle,
          description: podcastDescription,
          duration: roundedDuration,
          mode,
          language,
          audioUrl: data.taskResult.audioUrl,
          createdDate: new Date(),
          outline: outlineText,
          scripts: data.taskResult.scripts || [],
          coverUrl: data.taskResult.cover || undefined,
          subtitlesUrl: data.taskResult.subtitlesUrl || undefined,
          audioStreamUrl: data.taskResult.audioStreamUrl || undefined,
        };

        // 保存到数据库
        try {
          const speakerIds = [];
          if (voices.speaker_1) speakerIds.push(voices.speaker_1);
          if (voices.speaker_2) speakerIds.push(voices.speaker_2);

          await fetch('/api/podcast', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: episodeId,
              episodeId: episodeId,
              title: podcastTitle,
              description: podcastDescription,
              audioUrl: data.taskResult.audioUrl,
              duration: roundedDuration,
              mode,
              language,
              speakerIds,
              coverUrl: data.taskResult.cover,
              outline: outlineText,
              scripts: data.taskResult.scripts,
              status: 'completed',
            }),
          });
          console.log('✅ 播客已保存到数据库');
        } catch (error) {
          console.error('保存播客到数据库失败:', error);
          // 不阻止用户使用，只记录错误
        }

        setPodcasts((prev) => [
          newPodcast,
          ...prev.filter((podcast) => podcast.id !== episodeId),
        ]);
        setCurrentPodcast(newPodcast);
        setPlayerDuration(roundedDuration);
        toast.success(t('generate.success'));
        return true; // 停止轮询
      }

      return false; // 继续轮询
    } catch (error) {
      console.error('查询失败:', error);
      return false; // 继续轮询
    }
  };

  // 开始轮询（按照官方文档建议：等待 1 分钟后，每 10 秒轮询一次）
  const startPolling = (episodeId: string) => {
    setIsQuerying(true);
    setCurrentEpisodeId(episodeId);

    // 清除之前的轮询
    if (queryIntervalRef.current) {
      clearInterval(queryIntervalRef.current);
    }

    // 等待 1 分钟后开始轮询
    console.log('⏳ 等待 60 秒后开始轮询...');
    toast.info('播客正在生成中，预计需要 1-2 分钟...');

    setTimeout(() => {
      // 60 秒后首次查询
      queryPodcastStatus(episodeId).then((shouldStop) => {
        if (shouldStop) {
          setIsQuerying(false);
          setIsGenerating(false);
          setCurrentEpisodeId(null);
          return;
        }

        // 设置轮询（每 10 秒查询一次）
        queryIntervalRef.current = setInterval(async () => {
          const shouldStop = await queryPodcastStatus(episodeId);

          if (shouldStop) {
            if (queryIntervalRef.current) {
              clearInterval(queryIntervalRef.current);
              queryIntervalRef.current = null;
            }
            setIsQuerying(false);
            setIsGenerating(false);
            setCurrentEpisodeId(null);
          }
        }, 10000); // 每 10 秒查询一次
      });
    }, 60000); // 等待 60 秒
  };

  // 清理轮询
  useEffect(() => {
    return () => {
      if (queryIntervalRef.current) {
        clearInterval(queryIntervalRef.current);
      }
    };
  }, []);

  // ===== 生成播客 =====
  const handleGeneratePodcast = async () => {
    // 验证输入
    if (inputType === 'text' && !textContent.trim()) {
      toast.error(t('errors.no_content'));
      return;
    }
    if (inputType === 'link' && !linkContent.trim()) {
      toast.error(t('errors.no_content'));
      return;
    }
    if (inputType === 'file' && !selectedFile) {
      toast.error(t('errors.no_content'));
      return;
    }

    // 验证音色选择
    if (!voices.speaker_1) {
      toast.error(t('errors.select_voices'));
      return;
    }
    if (speakerCount === 'dual' && !voices.speaker_2) {
      toast.error(t('errors.select_voices'));
      return;
    }

    setIsGenerating(true);

    try {
      // 准备请求数据
      const requestBody: any = {
        mode,
        language,
        voices:
          speakerCount === 'dual' ? voices : { speaker_1: voices.speaker_1 },
      };

      // 根据输入类型添加内容
      if (inputType === 'text') {
        requestBody.content = textContent;
      } else if (inputType === 'link') {
        requestBody.link = linkContent;
      } else if (inputType === 'file' && selectedFile) {
        // 对于文件，需要先上传到服务器或转换为 base64
        // 这里简化处理，实际应该上传到存储服务
        const reader = new FileReader();
        reader.onload = async (e) => {
          const fileContent = e.target?.result as string;
          requestBody.content = fileContent;

          // 发送请求
          await sendGenerateRequest(requestBody);
        };
        reader.readAsText(selectedFile);
        return;
      }

      // 发送请求
      await sendGenerateRequest(requestBody);
    } catch (error: any) {
      console.error('生成播客失败:', error);
      toast.error(error.message || t('generate.error'));
      setIsGenerating(false);
    }
  };

  // 发送生成请求
  const sendGenerateRequest = async (requestBody: any) => {
    const response = await fetch('/api/ai/podcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!data.success) {
      if (data.insufficientCredits) {
        toast.error(insufficientCreditsToast);
      } else if (data.notConfigured) {
        toast.error(t('errors.not_configured'));
      } else {
        toast.error(data.error || t('generate.error'));
      }
      setIsGenerating(false);
      return;
    }

    // 开始轮询查询状态
    toast.info(t('generate.pending'));
    startPolling(data.episodeId);
  };

  // ===== 播放控制函数 =====
  const handlePlayPause = (podcast?: Podcast) => {
    if (podcast) {
      if (currentPodcast?.id === podcast.id) {
        setIsPlaying(!isPlaying);
      } else {
        setCurrentPodcast(podcast);
        setIsPlaying(true);
        setCurrentTime(0);
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getAudioDuration = async (url?: string) => {
    if (!url) return 0;
    return new Promise<number>((resolve) => {
      const tempAudio = document.createElement('audio');
      tempAudio.src = url;
      tempAudio.preload = 'metadata';
      tempAudio.addEventListener('loadedmetadata', () => {
        resolve(tempAudio.duration || 0);
      });
      tempAudio.addEventListener('error', () => resolve(0));
    });
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const openPodcastDetails = (podcast: Podcast) => {
    setDetailPodcast(podcast);
    setIsDetailOpen(true);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // 获取积分消耗
  const getCreditsForMode = (m: PodcastMode) => {
    const costs = { quick: 5, deep: 8, debate: 10 };
    return costs[m];
  };

  return (
    <div className="via-primary/5 from-background to-muted min-h-screen bg-gradient-to-b dark:from-gray-950 dark:to-gray-950">
      {/* 背景装饰 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />
        <div className="bg-primary/5 absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-24">
        {/* 标题 */}
        <ScrollAnimation>
          <div className="mb-12 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="via-primary/80 to-primary/60 mb-6 bg-gradient-to-r from-white bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {t('title')}
              </h1>
              <p className="text-muted-foreground mx-auto max-w-3xl text-lg md:text-xl dark:text-gray-300">
                {t('subtitle')}
              </p>
            </motion.div>
          </div>
        </ScrollAnimation>

        {/* 播客生成器 */}
        <ScrollAnimation delay={0.2}>
          <div className="mx-auto mb-12 max-w-4xl">
            <div className="border-primary/20 bg-muted/50 rounded-2xl border p-8 backdrop-blur-sm dark:bg-gray-900/50">
              <h2 className="text-foreground mb-6 text-2xl font-bold dark:text-white">
                {t('generate.title')}
              </h2>

              {/* 模式选择 */}
              <div className="mb-6">
                <label className="text-foreground mb-3 block font-medium dark:text-white">
                  {t('mode.title')}
                </label>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {(['quick', 'deep', 'debate'] as PodcastMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-lg border p-4 text-left transition-all duration-300 ${
                        mode === m
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:border-primary/50 text-foreground dark:border-gray-600 dark:bg-gray-800/50 dark:text-white'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {m === 'quick' && (
                            <Zap
                              className={`h-5 w-5 ${
                                mode === m
                                  ? 'text-primary-foreground'
                                  : 'text-primary dark:text-primary'
                              }`}
                            />
                          )}
                          {m === 'deep' && (
                            <FileText
                              className={`h-5 w-5 ${
                                mode === m
                                  ? 'text-primary-foreground'
                                  : 'text-primary dark:text-primary'
                              }`}
                            />
                          )}
                          {m === 'debate' && (
                            <MessageSquare
                              className={`h-5 w-5 ${
                                mode === m
                                  ? 'text-primary-foreground'
                                  : 'text-primary dark:text-primary'
                              }`}
                            />
                          )}
                          <span className="font-medium">
                            {t(`mode.${m}.name`)}
                          </span>
                        </div>
                        <span
                          className={`text-xs ${
                            mode === m
                              ? 'text-primary-foreground/80'
                              : 'text-muted-foreground dark:text-gray-400'
                          }`}
                        >
                          {t(`mode.${m}.credits`)}
                        </span>
                      </div>
                      <p
                        className={`mb-1 text-sm ${
                          mode === m
                            ? 'text-primary-foreground/90'
                            : 'text-muted-foreground dark:text-gray-400'
                        }`}
                      >
                        {t(`mode.${m}.description`)}
                      </p>
                      <p
                        className={`text-xs ${
                          mode === m
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground dark:text-gray-500'
                        }`}
                      >
                        {t(`mode.${m}.duration`)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 输入区域 */}
              <div className="mb-6">
                <label className="text-foreground mb-3 block font-medium dark:text-white">
                  {t('upload.title')}
                </label>

                {/* 输入类型切换 */}
                <div className="mb-4 flex gap-2">
                  <Button
                    variant={inputType === 'text' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setInputType('text')}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    {t('upload.input_type.text')}
                  </Button>
                  <Button
                    variant={inputType === 'file' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setInputType('file')}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t('upload.input_type.file')}
                  </Button>
                  <Button
                    variant={inputType === 'link' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setInputType('link')}
                  >
                    <LinkIcon className="mr-2 h-4 w-4" />
                    {t('upload.input_type.link')}
                  </Button>
                </div>

                {/* 文本输入 */}
                {inputType === 'text' && (
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder={t('upload.drag_text')}
                    className="focus:border-primary border-border bg-background/50 text-foreground placeholder-muted-foreground h-32 w-full resize-none rounded-lg border p-4 focus:outline-none dark:border-gray-600 dark:bg-gray-800/50 dark:text-white dark:placeholder-gray-400"
                  />
                )}

                {/* 文件上传 */}
                {inputType === 'file' && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.txt,.docx,.epub,.md,.jpg,.jpeg,.png,.webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="hover:border-primary border-border bg-muted/50 flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors dark:border-gray-600 dark:bg-gray-800/50"
                    >
                      <Upload className="mb-2 h-8 w-8 text-gray-400" />
                      {selectedFile ? (
                        <div className="text-center">
                          <p className="text-foreground dark:text-white">
                            {selectedFile.name}
                          </p>
                          <p className="text-muted-foreground text-sm dark:text-gray-400">
                            {(selectedFile.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-foreground dark:text-white">
                            {t('upload.drag_text')}
                          </p>
                          <p className="text-muted-foreground text-sm dark:text-gray-400">
                            {t('upload.supported_formats')}
                          </p>
                        </div>
                      )}
                    </div>
                    {selectedFile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedFile(null)}
                        className="mt-2"
                      >
                        <X className="mr-2 h-4 w-4" />
                        清除文件
                      </Button>
                    )}
                  </div>
                )}

                {/* 链接输入 */}
                {inputType === 'link' && (
                  <div>
                    <div className="relative">
                      <LinkIcon className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
                      <input
                        type="url"
                        value={linkContent}
                        onChange={(e) => setLinkContent(e.target.value)}
                        placeholder={t('upload.paste_link')}
                        className="focus:border-primary border-border bg-background/50 text-foreground placeholder-muted-foreground w-full rounded-lg border py-3 pr-4 pl-10 focus:outline-none dark:border-gray-600 dark:bg-gray-800/50 dark:text-white dark:placeholder-gray-400"
                      />
                    </div>
                    {/* 支持的平台 */}
                    <div className="mt-3">
                      <p className="text-muted-foreground mb-2 text-sm dark:text-gray-400">
                        {t('upload.supported_platforms')}:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {SUPPORTED_PLATFORMS.map((platform) => (
                          <div
                            key={platform.name}
                            className="bg-muted/50 text-foreground/70 flex items-center gap-1 rounded-full px-3 py-1 text-xs dark:bg-gray-800/50 dark:text-gray-300"
                          >
                            <span>{platform.icon}</span>
                            <span>{platform.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 语言选择 */}
              <div className="mb-6">
                <label className="text-foreground mb-3 block font-medium dark:text-white">
                  <Globe className="mr-2 inline h-4 w-4" />
                  {t('settings.language.label')}
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="focus:border-primary border-border bg-background/50 text-foreground w-full rounded-lg border p-3 focus:outline-none dark:border-gray-600 dark:bg-gray-800/50 dark:text-white"
                >
                  {/* ListenHub API 只支持 en, zh, ja 三种语言 */}
                  <option value="zh">{t('settings.language.zh')}</option>
                  <option value="en">{t('settings.language.en')}</option>
                  <option value="ja">{t('settings.language.ja')}</option>
                </select>
              </div>

              {/* 人数和音色选择 */}
              <div className="mb-6">
                <label className="text-foreground mb-3 block font-medium dark:text-white">
                  <Users className="mr-2 inline h-4 w-4" />
                  {t('settings.speakers.label')}
                </label>
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSpeakerCount('single')}
                    className={`rounded-lg border p-3 transition-all ${
                      speakerCount === 'single'
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:border-primary/50 text-foreground dark:border-gray-600 dark:bg-gray-800/50 dark:text-white'
                    }`}
                  >
                    <span>{t('settings.speakers.single')}</span>
                  </button>
                  <button
                    onClick={() => setSpeakerCount('dual')}
                    className={`rounded-lg border p-3 transition-all ${
                      speakerCount === 'dual'
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:border-primary/50 text-foreground dark:border-gray-600 dark:bg-gray-800/50 dark:text-white'
                    }`}
                  >
                    <span>{t('settings.speakers.dual')}</span>
                  </button>
                </div>

                {/* 音色选择 - 卡片式设计 */}
                <div className="space-y-4">
                  {/* 音色 1 */}
                  <div>
                    <label className="text-muted-foreground mb-3 block text-sm dark:text-gray-400">
                      <Mic className="mr-1 inline h-3 w-3" />
                      {speakerCount === 'single' ? '选择音色' : '音色 1'}
                      {isLoadingSpeakers && (
                        <span className="ml-2 text-xs text-gray-500">
                          (加载中...)
                        </span>
                      )}
                    </label>
                    <div className="custom-scrollbar grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-2">
                      {availableSpeakers.map((speaker) => {
                        const isSelected =
                          voices.speaker_1 === speaker.speakerId;
                        const isPlaying = playingDemoId === speaker.speakerId;
                        return (
                          <div
                            key={speaker.speakerId}
                            onClick={() =>
                              setVoices({
                                ...voices,
                                speaker_1: speaker.speakerId,
                              })
                            }
                            className={`relative cursor-pointer rounded-lg border p-3 transition-all ${
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-background hover:border-primary/50 text-foreground dark:border-gray-600 dark:bg-gray-800/50 dark:text-white'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                                    isSelected
                                      ? speaker.gender === 'male'
                                        ? 'bg-blue-500/30 text-blue-200'
                                        : 'bg-pink-500/30 text-pink-200'
                                      : speaker.gender === 'male'
                                        ? 'bg-blue-500/20 text-blue-400 dark:text-blue-400'
                                        : 'bg-pink-500/20 text-pink-400 dark:text-pink-400'
                                  }`}
                                >
                                  {speaker.gender === 'male' ? '👨' : '👩'}
                                </div>
                                <span
                                  className={`text-sm font-medium ${
                                    isSelected
                                      ? 'text-primary-foreground'
                                      : 'text-foreground dark:text-white'
                                  }`}
                                >
                                  {speaker.speakerName}
                                </span>
                              </div>
                              {speaker.demoAudioUrl && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlayDemo(speaker);
                                  }}
                                  className={`rounded-full p-1.5 transition-all ${
                                    isPlaying
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted text-foreground/70 hover:bg-muted/80 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                  }`}
                                >
                                  {isPlaying ? (
                                    <Pause className="h-3 w-3" />
                                  ) : (
                                    <Play className="h-3 w-3" />
                                  )}
                                </button>
                              )}
                            </div>
                            {isSelected && (
                              <div className="bg-primary absolute top-1 right-1 h-2 w-2 rounded-full"></div>
                            )}
                          </div>
                        );
                      })}
                      {availableSpeakers.length === 0 && !isLoadingSpeakers && (
                        <div className="text-muted-foreground col-span-2 py-4 text-center dark:text-gray-400">
                          暂无可用音色
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 音色 2 (双人模式) */}
                  {speakerCount === 'dual' && (
                    <div>
                      <label className="text-muted-foreground mb-3 block text-sm dark:text-gray-400">
                        <Mic className="mr-1 inline h-3 w-3" />
                        音色 2
                        {isLoadingSpeakers && (
                          <span className="ml-2 text-xs text-gray-500">
                            (加载中...)
                          </span>
                        )}
                      </label>
                      <div className="custom-scrollbar grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-2">
                        {availableSpeakers.map((speaker) => {
                          const isSelected =
                            voices.speaker_2 === speaker.speakerId;
                          const isPlaying = playingDemoId === speaker.speakerId;
                          return (
                            <div
                              key={speaker.speakerId}
                              onClick={() =>
                                setVoices({
                                  ...voices,
                                  speaker_2: speaker.speakerId,
                                })
                              }
                              className={`relative cursor-pointer rounded-lg border p-3 transition-all ${
                                isSelected
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border bg-background hover:border-primary/50 text-foreground dark:border-gray-600 dark:bg-gray-800/50 dark:text-white'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                                      isSelected
                                        ? speaker.gender === 'male'
                                          ? 'bg-blue-500/30 text-blue-200'
                                          : 'bg-pink-500/30 text-pink-200'
                                        : speaker.gender === 'male'
                                          ? 'bg-blue-500/20 text-blue-400 dark:text-blue-400'
                                          : 'bg-pink-500/20 text-pink-400 dark:text-pink-400'
                                    }`}
                                  >
                                    {speaker.gender === 'male' ? '👨' : '👩'}
                                  </div>
                                  <span
                                    className={`text-sm font-medium ${
                                      isSelected
                                        ? 'text-primary-foreground'
                                        : 'text-foreground dark:text-white'
                                    }`}
                                  >
                                    {speaker.speakerName}
                                  </span>
                                </div>
                                {speaker.demoAudioUrl && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePlayDemo(speaker);
                                    }}
                                    className={`rounded-full p-1.5 transition-all ${
                                      isPlaying
                                        ? 'bg-primary text-white'
                                        : 'bg-muted text-foreground/70 hover:bg-muted/80 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                    }`}
                                  >
                                    {isPlaying ? (
                                      <Pause className="h-3 w-3" />
                                    ) : (
                                      <Play className="h-3 w-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                              {isSelected && (
                                <div className="bg-primary absolute top-1 right-1 h-2 w-2 rounded-full"></div>
                              )}
                            </div>
                          );
                        })}
                        {availableSpeakers.length === 0 &&
                          !isLoadingSpeakers && (
                            <div className="text-muted-foreground col-span-2 py-4 text-center dark:text-gray-400">
                              暂无可用音色
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 生成按钮 */}
              <Button
                onClick={handleGeneratePodcast}
                disabled={isGenerating || isQuerying}
                className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 w-full bg-gradient-to-r py-4 text-white"
              >
                {isGenerating || isQuerying ? (
                  <>
                    <div className="mr-2 h-5 w-5 animate-spin rounded-full border-b-2 border-white" />
                    {isQuerying
                      ? t('generate.querying')
                      : t('generate.generating')}
                  </>
                ) : (
                  <>
                    <CreditsCost credits={getCreditsForMode(mode)} />
                    {t('generate.button')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </ScrollAnimation>

        {/* 播客播放器 */}
        {currentPodcast && currentPodcast.audioUrl && (
          <ScrollAnimation delay={0.3}>
            <div className="mx-auto mb-12 max-w-4xl">
              <div className="from-primary/20 to-primary/5 border-primary/30 dark:from-primary/20 dark:to-primary/5 rounded-2xl border bg-gradient-to-r p-8">
                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex-1">
                    <h3 className="text-foreground mb-2 text-2xl font-bold dark:text-white">
                      {currentPodcast.title}
                    </h3>
                    <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed dark:text-gray-300">
                      {currentPodcast.description}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openPodcastDetails(currentPodcast)}
                    >
                      {t('library.view_details')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-primary/30 text-primary/80 hover:bg-primary/10"
                      onClick={handleDownload}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t('player.download')}
                    </Button>
                  </div>
                </div>

                {/* 播放控制 */}
                <div className="bg-muted/50 rounded-xl p-6 dark:bg-gray-900/50">
                  {/* 进度条 */}
                  <div className="mb-4">
                    <div className="text-muted-foreground mb-2 flex justify-between text-sm dark:text-gray-400">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(playerDuration)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={playerDuration > 0 ? playerDuration : 1}
                      value={currentTime}
                      onChange={handleSeek}
                      className="bg-muted h-2 w-full cursor-pointer appearance-none rounded-lg dark:bg-gray-700"
                      style={{
                        background: `linear-gradient(to right, rgb(139,92,246) 0%, rgb(139,92,246) ${
                          playerDuration > 0
                            ? (currentTime / playerDuration) * 100
                            : 0
                        }%, #4b5563 ${
                          playerDuration > 0
                            ? (currentTime / playerDuration) * 100
                            : 0
                        }%, #4b5563 100%)`,
                      }}
                    />
                  </div>

                  {/* 控制按钮 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground dark:text-gray-400 dark:hover:text-white"
                      >
                        <SkipBack className="h-5 w-5" />
                      </Button>
                      <Button
                        onClick={() => handlePlayPause()}
                        className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 h-12 w-12 rounded-full bg-gradient-to-r text-white"
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5" />
                        ) : (
                          <Play className="ml-1 h-5 w-5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground dark:text-gray-400 dark:hover:text-white"
                      >
                        <SkipForward className="h-5 w-5" />
                      </Button>
                    </div>

                    {/* 音量控制 */}
                    <div className="flex items-center gap-3">
                      <Volume2 className="h-5 w-5 text-gray-400" />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={volume}
                        onChange={handleVolumeChange}
                        className="h-2 w-24 cursor-pointer appearance-none rounded-lg bg-gray-700"
                        style={{
                          background: `linear-gradient(to right, rgb(139,92,246) 0%, rgb(139,92,246) ${volume * 100}%, #4b5563 ${volume * 100}%, #4b5563 100%)`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* 音频元素 */}
                <audio
                  ref={audioRef}
                  src={currentPodcast.audioUrl}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>
            </div>
          </ScrollAnimation>
        )}

        {/* 音色试听音频元素 (隐藏) */}
        <audio ref={demoAudioRef} className="hidden" />

        {/* 资料库入口 */}
        <ScrollAnimation delay={0.4}>
          <div className="mx-auto max-w-4xl">
            <div className="border-primary/20 bg-card/70 flex flex-col gap-4 rounded-3xl border p-6 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
              <div className="flex-1 text-center md:text-left">
                <p className="text-primary/80 text-xs tracking-wide uppercase">
                  {t('library.subtitle')}
                </p>
                <h3 className="text-foreground mt-1 text-2xl font-semibold dark:text-white">
                  {t('library.title')}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm dark:text-gray-300">
                  {t('library.link_description')}
                </p>
              </div>
              <Button
                asChild
                size="lg"
                className="from-primary to-primary/80 bg-gradient-to-r text-white shadow-lg"
              >
                <Link href="/library/podcasts">
                  {t('library.open_library')}
                </Link>
              </Button>
            </div>
          </div>
        </ScrollAnimation>

        {/* 使用提示 */}
        <ScrollAnimation delay={0.5}>
          <div className="mx-auto mt-12 max-w-4xl">
            <div className="border-primary/20 bg-muted/50 rounded-2xl border p-6 backdrop-blur-sm dark:bg-gray-900/50">
              <h3 className="text-foreground mb-4 text-lg font-semibold dark:text-white">
                {t('features.title')}
              </h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center">
                  <Upload className="text-primary mx-auto mb-2 h-8 w-8" />
                  <p className="text-foreground mb-1 font-medium dark:text-white">
                    {t('features.multi_input.title')}
                  </p>
                  <p className="text-muted-foreground text-sm dark:text-gray-400">
                    {t('features.multi_input.description')}
                  </p>
                </div>
                <div className="text-center">
                  <Sparkles className="text-primary mx-auto mb-2 h-8 w-8" />
                  <p className="text-foreground mb-1 font-medium dark:text-white">
                    {t('features.ai_optimize.title')}
                  </p>
                  <p className="text-muted-foreground text-sm dark:text-gray-400">
                    {t('features.ai_optimize.description')}
                  </p>
                </div>
                <div className="text-center">
                  <Headphones className="text-primary mx-auto mb-2 h-8 w-8" />
                  <p className="text-foreground mb-1 font-medium dark:text-white">
                    {t('features.anytime.title')}
                  </p>
                  <p className="text-muted-foreground text-sm dark:text-gray-400">
                    {t('features.anytime.description')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>

      <PodcastDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        podcast={detailPodcast}
        onDownloadAudio={downloadPodcastAudio}
      />
    </div>
  );
};

export default PodcastApp;
