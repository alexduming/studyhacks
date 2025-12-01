'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, Volume2, Upload, Mic, Headphones, Clock, Download, Share2, Sparkles } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { useTranslations } from 'next-intl';

interface Podcast {
  id: number;
  title: string;
  description: string;
  duration: number;
  voiceType: 'professional' | 'friendly' | 'academic';
  content: string;
  createdDate: Date;
  isPlaying?: boolean;
}

const PodcastApp = () => {
  const t = useTranslations('podcast');
  const [podcasts, setPodcasts] = useState<Podcast[]>([
    {
      id: 1,
      title: "机器学习基础概念",
      description: "深入浅出地介绍机器学习的核心概念，包括监督学习、无监督学习和强化学习的区别与应用。",
      duration: 480, // 8分钟
      voiceType: 'professional',
      content: "欢迎来到今天的AI学习播客...",
      createdDate: new Date(Date.now() - 86400000),
      isPlaying: false
    },
    {
      id: 2,
      title: "深度学习入门指南",
      description: "为初学者量身定制的深度学习入门指南，涵盖神经网络的基础知识和实际应用案例。",
      duration: 720, // 12分钟
      voiceType: 'friendly',
      content: "大家好，今天我们来聊聊深度学习...",
      createdDate: new Date(Date.now() - 172800000),
      isPlaying: false
    }
  ]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [selectedVoice, setSelectedVoice] = useState<'professional' | 'friendly' | 'academic'>('professional');
  const [inputText, setInputText] = useState('');
  const [currentPodcast, setCurrentPodcast] = useState<Podcast | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
    };
  }, [currentPodcast]);

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

  const handleGeneratePodcast = () => {
    if (!inputText.trim()) return;

    setIsGenerating(true);

    // 模拟AI生成播客
    setTimeout(() => {
      const newPodcast: Podcast = {
        id: podcasts.length + 1,
        title: `AI生成的学习播客 ${podcasts.length + 1}`,
        description: `基于您提供的文本内容生成的${selectedVoice === 'professional' ? '专业' : selectedVoice === 'friendly' ? '友好' : '学术'}风格播客。`,
        duration: Math.floor(inputText.length / 10), // 基于文本长度估算时长
        voiceType: selectedVoice,
        content: inputText,
        createdDate: new Date(),
        isPlaying: false
      };

      setPodcasts([newPodcast, ...podcasts]);
      setIsGenerating(false);
      setInputText('');
    }, 3000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-primary/5 to-gray-950">
      {/* 背景装饰：统一使用 primary 深浅光晕，去掉独立的蓝色大光斑 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-24">
        <ScrollAnimation>
          <div className="text-center mb-12">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              {/* 标题渐变：从白色到 primary，一致于 Hero 主色 */}
              <h1 className="bg-gradient-to-r from-white via-primary/80 to-primary/60 bg-clip-text text-4xl font-bold text-transparent md:text-5xl mb-6">
                {t('title')}
              </h1>
              <p className="text-gray-300 text-lg md:text-xl max-w-3xl mx-auto">
                {t('subtitle')}
              </p>
            </motion.div>
          </div>
        </ScrollAnimation>

        {/* 播客生成器 */}
        <ScrollAnimation delay={0.2}>
          <div className="max-w-4xl mx-auto mb-12">
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-8">
              <h2 className="text-2xl font-bold text-white mb-6">{t('generate.title')}</h2>

              {/* 文本输入区域 */}
              <div className="mb-6">
                <label className="block text-white font-medium mb-3">{t('upload.title')}</label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={t('upload.drag_text')}
                  className="w-full h-32 p-4 bg-gray-800/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-primary focus:outline-none resize-none"
                />
              </div>

              {/* 语音类型选择 */}
              <div className="mb-6">
                <label className="block text-white font-medium mb-3">{t('settings.voice_style.label')}</label>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { type: 'professional', label: t('settings.voice_style.professional'), desc: '正式、清晰的播报风格' },
                    { type: 'friendly', label: t('settings.voice_style.friendly'), desc: '轻松、自然的交谈风格' },
                    { type: 'academic', label: t('settings.voice_style.academic'), desc: '严谨、专业的讲解风格' },
                  ].map((voice) => (
                    <button
                      key={voice.type}
                      onClick={() => setSelectedVoice(voice.type as any)}
                      className={`p-4 rounded-lg border transition-all duration-300 text-left ${
                        selectedVoice === voice.type
                          ? 'border-primary bg-primary/10'
                          : 'border-gray-600 bg-gray-800/50 hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Mic className="h-4 w-4 text-primary" />
                        <span className="text-white font-medium">{voice.label}</span>
                      </div>
                      <p className="text-gray-400 text-sm">{voice.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 生成按钮 */}
              <Button
                onClick={handleGeneratePodcast}
                disabled={!inputText.trim() || isGenerating}
                className="w-full bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 text-white py-4"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                    AI正在生成播客...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    生成播客
                  </>
                )}
              </Button>
            </div>
          </div>
        </ScrollAnimation>

        {/* 播客播放器 */}
        {currentPodcast && (
          <ScrollAnimation delay={0.3}>
            <div className="max-w-4xl mx-auto mb-12">
              {/* 播放器整体背景：primary 深浅渐变，去掉蓝色终点，统一主色 */}
              <div className="bg-gradient-to-r from-primary/20 to-primary/5 rounded-2xl border border-primary/30 p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2">{currentPodcast.title}</h3>
                    <p className="text-gray-300">{currentPodcast.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" className="border-primary/30 text-primary/80">
                      <Download className="h-4 w-4 mr-2" />
                      下载
                    </Button>
                    <Button variant="outline" size="sm" className="border-primary/30 text-primary/80">
                      <Share2 className="h-4 w-4 mr-2" />
                      分享
                    </Button>
                  </div>
                </div>

                {/* 播放控制 */}
                <div className="bg-gray-900/50 rounded-xl p-6">
                  {/* 进度条 */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-400 mb-2">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(currentPodcast.duration)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={currentPodcast.duration}
                      value={currentTime}
                      onChange={handleSeek}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                      style={{
                        background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${(currentTime / currentPodcast.duration) * 100}%, #4b5563 ${(currentTime / currentPodcast.duration) * 100}%, #4b5563 100%)`
                      }}
                    />
                  </div>

                  {/* 控制按钮 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-white"
                      >
                        <SkipBack className="h-5 w-5" />
                      </Button>
                      <Button
                        onClick={() => handlePlayPause()}
                        className="bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 text-white w-12 h-12 rounded-full"
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5" />
                        ) : (
                          <Play className="h-5 w-5 ml-1" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-white"
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
                        className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        style={{
                          // 使用 theme 主色对应的 oklch 紫（约等于 Tailwind 的 purple-500）来渲染已调节音量区
                          background: `linear-gradient(to right, rgb(139,92,246) 0%, rgb(139,92,246) ${volume * 100}%, #4b5563 ${volume * 100}%, #4b5563 100%)`
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* 音频元素（隐藏） */}
                <audio
                  ref={audioRef}
                  src="/podcast-sample.mp3" // 示例音频文件
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>
            </div>
          </ScrollAnimation>
        )}

        {/* 播客列表 */}
        <ScrollAnimation delay={0.4}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-6">我的播客库</h2>
                    <div className="space-y-4">
              {podcasts.length > 0 ? (
                podcasts.map((podcast) => (
                  <motion.div
                    key={podcast.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className={`bg-gray-900/50 backdrop-blur-sm rounded-xl border transition-all duration-300 cursor-pointer ${
                      currentPodcast?.id === podcast.id
                        ? 'border-primary bg-primary/10'
                        : 'border-gray-600 hover:border-primary/50'
                    }`}
                    onClick={() => handlePlayPause(podcast)}
                  >
                    <div className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/70 rounded-lg flex items-center justify-center">
                            <Headphones className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white">{podcast.title}</h3>
                            <p className="text-gray-400 text-sm mb-1">{podcast.description}</p>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(podcast.duration)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Mic className="h-3 w-3" />
                                {podcast.voiceType === 'professional' ? '专业' :
                                 podcast.voiceType === 'friendly' ? '友好' : '学术'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-primary/80"
                        >
                          {currentPodcast?.id === podcast.id && isPlaying ? (
                            <Pause className="h-5 w-5" />
                          ) : (
                            <Play className="h-5 w-5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-16">
                  <Headphones className="h-20 w-20 text-gray-600 mx-auto mb-6" />
                  <h3 className="text-xl font-semibold text-white mb-4">还没有播客</h3>
                  <p className="text-gray-400 mb-6">开始创建您的第一个AI学习播客吧</p>
                </div>
              )}
            </div>
          </div>
        </ScrollAnimation>

        {/* 使用提示 */}
        <ScrollAnimation delay={0.5}>
          <div className="max-w-4xl mx-auto mt-12">
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">使用提示</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center">
                  <Upload className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-white font-medium mb-1">支持多种内容</p>
                  <p className="text-gray-400 text-sm">课程笔记、教材内容、文章等</p>
                </div>
                <div className="text-center">
                  <Sparkles className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-white font-medium mb-1">AI智能优化</p>
                  <p className="text-gray-400 text-sm">自动优化语言和语调</p>
                </div>
                <div className="text-center">
                  <Headphones className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-white font-medium mb-1">随时随地学习</p>
                  <p className="text-gray-400 text-sm">支持下载和离线收听</p>
                </div>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </div>
  );
};

export default PodcastApp;