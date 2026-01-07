'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  BookOpen,
  Brain,
  Check,
  Clock,
  FileText,
  Loader2,
  Plus,
  RotateCw,
  Target,
  Upload,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { CreditsCost } from '@/shared/components/ai-elements/credits-display';
import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { useAppContext } from '@/shared/contexts/app';
import { readLearningFileContent } from '@/shared/lib/file-reader';
import { type Flashcard as AIGeneratedFlashcard } from '@/shared/services/openrouter';

interface Flashcard {
  id: number;
  front: string;
  back: string;
  difficulty: 'easy' | 'medium' | 'hard';
  lastReviewed?: Date;
  nextReview?: Date;
  reviewCount: number;
}

const NOTE_TRANSFER_KEY = 'ai-note-transfer';

// 移除默认示例闪卡的定义
// const createDefaultFlashcards = (): Flashcard[] => [ ... ];

interface FlashcardsAppProps {
  initialHistoryData?: {
    id: string;
    count: number;
    createdAt: string;
    flashcards: any[];
  } | null;
}

const FlashcardsApp = ({ initialHistoryData }: FlashcardsAppProps) => {
  const t = useTranslations('flashcards');
  const { user, fetchUserCredits } = useAppContext();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);

  const [historyError, setHistoryError] = useState('');
  const [activeHistory, setActiveHistory] = useState<{
    id: string;
    count: number;
    createdAt: string;
  } | null>(initialHistoryData ? {
    id: initialHistoryData.id,
    count: initialHistoryData.count,
    createdAt: initialHistoryData.createdAt,
  } : null);

  const normalizeHistoryCards = useCallback(
    (cards: Array<Record<string, any>>): Flashcard[] => {
      if (!Array.isArray(cards)) return [];
      const allowed: Flashcard['difficulty'][] = ['easy', 'medium', 'hard'];
      const result = cards
        .map((rawCard, index) => {
          if (!rawCard || typeof rawCard !== 'object') {
            return null;
          }

          const safeFront =
            typeof rawCard.front === 'string'
              ? rawCard.front
              : typeof rawCard.question === 'string'
                ? rawCard.question
                : (t('history.fallback_front', {
                    index: index + 1,
                  }) as string);
          const safeBack =
            typeof rawCard.back === 'string'
              ? rawCard.back
              : typeof rawCard.answer === 'string'
                ? rawCard.answer
                : (t('history.fallback_back', {
                    index: index + 1,
                  }) as string);

          const difficulty = allowed.includes(
            rawCard.difficulty as Flashcard['difficulty']
          )
            ? (rawCard.difficulty as Flashcard['difficulty'])
            : 'medium';

          const derivedId =
            typeof rawCard.id === 'number'
              ? rawCard.id
              : typeof rawCard.id === 'string'
                ? Number.parseInt(rawCard.id.replace(/\D/g, ''), 10) ||
                  Date.now() + index
                : Date.now() + index;

          return {
            id: derivedId,
            front: safeFront,
            back: safeBack,
            difficulty,
            reviewCount: 0,
            lastReviewed: undefined,
            nextReview: undefined,
          } as Flashcard;
        })
        .filter((card): card is Flashcard => card !== null);
      
      return result;
    },
    [t]
  );

  // Initialize from props if available, otherwise from local storage
  useEffect(() => {
    if (initialHistoryData?.flashcards) {
      const normalized = normalizeHistoryCards(initialHistoryData.flashcards);
      setFlashcards(normalized);
      // No need to set activeHistory here as it is initialized in useState
      return;
    }

    // Only load from local storage if no history data provided
    try {
      const savedCards = localStorage.getItem('last-flashcards');
      if (savedCards) {
        const parsed = JSON.parse(savedCards);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const restored = parsed.map((c) => ({
            ...c,
            lastReviewed: c.lastReviewed ? new Date(c.lastReviewed) : undefined,
            nextReview: c.nextReview ? new Date(c.nextReview) : undefined,
          }));
          setFlashcards(restored);
        }
      }
    } catch (e) {
      console.warn('Failed to load last flashcards from localStorage', e);
    }
  }, [initialHistoryData, normalizeHistoryCards]);

  // 每次闪卡更新时，自动保存到 localStorage
  useEffect(() => {
    if (!activeHistory && flashcards.length > 0) {
      localStorage.setItem('last-flashcards', JSON.stringify(flashcards));
    }
  }, [flashcards, activeHistory]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCardContent, setNewCardContent] = useState('');
  const [generationError, setGenerationError] = useState('');
  // 文件上传相关状态：用于“从文件生成闪卡”
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 让用户指定 AI 生成语言；默认“自动”保持与上传资料一致
  const [outputLanguage, setOutputLanguage] = useState<'auto' | 'zh' | 'en'>(
    'auto'
  );

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyMode, setStudyMode] = useState<'review' | 'new' | 'all'>(
    'review'
  );
  // 是否展开「详细统计」面板
  const [showStats, setShowStats] = useState(false);
  const transferAutoGenerateRef = useRef(false);
  const searchParams = useSearchParams();
  const historyId =
    searchParams?.get('historyId') ?? searchParams?.get('history');
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const currentCard = flashcards[currentCardIndex];
  // 所有看过至少一次（reviewCount > 0）的卡片，都视为“待复习”
  const dueCards = useMemo(
    () => flashcards.filter((card) => card.reviewCount > 0),
    [flashcards]
  );
  const dueCardsCount = dueCards.length;

  useEffect(() => {
    // 自动切换到需要复习的卡片
    if (studyMode === 'review' && dueCardsCount > 0) {
      const nextDueId = dueCards[0]?.id;
      const dueIndex = flashcards.findIndex((card) => card.id === nextDueId);
      if (dueIndex >= 0) {
        setCurrentCardIndex(dueIndex);
      }
    }
  }, [dueCards, dueCardsCount, flashcards, studyMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payloadRaw = sessionStorage.getItem(NOTE_TRANSFER_KEY);
    if (!payloadRaw) return;

    sessionStorage.removeItem(NOTE_TRANSFER_KEY);
    try {
      const payload = JSON.parse(payloadRaw);
      if (payload?.type !== 'flashcards' || !payload?.content) {
        return;
      }

      setShowCreateForm(true);
      setNewCardContent(payload.content);
      setFileInfo(t('create.transfer_info'));
      setGenerationError('');
      transferAutoGenerateRef.current = true;
    } catch (error) {
      console.error('Failed to read transfer data for flashcards:', error);
      toast.error(t('create.transfer_error'));
    }
  }, [t]);

  useEffect(() => {
    if (
      transferAutoGenerateRef.current &&
      newCardContent.trim() &&
      !isGenerating
    ) {
      transferAutoGenerateRef.current = false;
      toast.success(t('create.transfer_success'));
      handleGenerateFlashcards();
    }
  }, [newCardContent, isGenerating]);

  // Only fetch if historyId changes AND we don't have initial data for it
  useEffect(() => {
    if (!historyId || (activeHistory?.id === historyId)) {
      return;
    }

    let aborted = false;

    const loadHistoryDeck = async () => {
      setIsHistoryLoading(true);
      setHistoryError('');

      try {
        const response = await fetch(`/api/library/flashcards/${historyId}`);
        const payload = await response.json();

        if (!response.ok || !payload?.record) {
          throw new Error(payload?.error || 'history_load_error');
        }

        const normalizedCards = normalizeHistoryCards(
          payload.record.flashcards || []
        );

        if (aborted) return;

        if (normalizedCards.length === 0) {
          setFlashcards([]);
          setCurrentCardIndex(0);
          setIsFlipped(false);
          setStudyMode('review');
          setActiveHistory(null);
          setHistoryError(t('history.load_empty'));
          toast.error(t('history.load_empty'));
          return;
        }

        setFlashcards(normalizedCards);
        setActiveHistory({
          id: payload.record.id,
          count: normalizedCards.length,
          createdAt:
            payload.record.createdAt || new Date().toISOString(),
        });
        setCurrentCardIndex(0);
        setIsFlipped(false);
        setStudyMode('review');
        toast.success(
          t('history.load_success', {
            count: normalizedCards.length,
          })
        );
      } catch (error) {
        if (aborted) return;
        console.error('Failed to load flashcard history:', error);
        setHistoryError(t('history.load_error'));
        setActiveHistory(null);
        toast.error(t('history.load_error'));
      } finally {
        if (!aborted) {
          setIsHistoryLoading(false);
        }
      }
    };

    loadHistoryDeck();

    return () => {
      aborted = true;
    };
  }, [activeHistory?.id, historyId, normalizeHistoryCards, t]);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleRating = (rating: 'again' | 'good' | 'easy') => {
    const updatedCards = [...flashcards];
    const card = updatedCards[currentCardIndex];

    // 每次评分都算一次复习
    card.reviewCount++;
    card.lastReviewed = new Date();

    switch (rating) {
      case 'again': // 太难了
        card.difficulty = 'hard';
        break;
      case 'good': // 勉强记住
        card.difficulty = 'medium';
        break;
      case 'easy': // 太简单
        card.difficulty = 'easy';
        break;
    }

    setFlashcards(updatedCards);
    setIsFlipped(false);

    // 移动到下一张卡片
    moveToNextCard();
  };

  const handleGenerateFlashcards = async () => {
    if (!newCardContent.trim()) {
      setGenerationError(t('create.error'));
      return;
    }

    setIsGenerating(true);
    setGenerationError('');

    try {
      const response = await fetch('/api/ai/flashcards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newCardContent,
          count: 10,
          outputLanguage,
        }),
      });

      const result = await response.json();

      if (result.success && result.flashcards && result.flashcards.length > 0) {
        const newFlashcards: Flashcard[] = result.flashcards.map(
          (fc: AIGeneratedFlashcard, index: number) => ({
            id: Date.now() + index,
            front: fc.front,
            back: fc.back,
            difficulty: fc.difficulty as Flashcard['difficulty'],
            reviewCount: 0,
            lastReviewed: undefined,
            nextReview: new Date(),
          })
        );

        setFlashcards([...newFlashcards, ...flashcards]);
        setNewCardContent('');
        setShowCreateForm(false);
        setCurrentCardIndex(0);
        setStudyMode('new');

        // 刷新积分余额
        if (user) {
          fetchUserCredits();
        }
        toast.success(t('create.generation_success'));
      } else {
        if (result.insufficientCredits) {
          toast.error(
            `积分不足！需要 ${result.requiredCredits} 积分，当前仅有 ${result.remainingCredits} 积分`
          );
        } else {
          toast.error(result.error || t('create.generation_error'));
        }
        setGenerationError(result.error || t('create.generation_error'));
      }
    } catch (error) {
      console.error('Error generating flashcards:', error);
      setGenerationError(t('create.generation_error'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleResetProgress = () => {
    const resetCards = flashcards.map((card) => ({
      ...card,
      difficulty: 'medium' as Flashcard['difficulty'],
      reviewCount: 0,
      lastReviewed: undefined,
      nextReview: undefined,
    }));

    setFlashcards(resetCards);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setStudyMode('review');
    setShowStats(false);
  };

  const handleDetachHistoryDeck = () => {
    setActiveHistory(null);
    setHistoryError('');
    // 清空当前显示，不加载默认示例
    setFlashcards([]);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setStudyMode('review');
    // 同时清除本地缓存，回归完全的初始状态
    localStorage.removeItem('last-flashcards');
  };

  const handleClearFlashcards = () => {
    setFlashcards([]);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setStudyMode('review');
    setShowStats(false);
    setActiveHistory(null);
    setHistoryError('');
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsFileLoading(true);
    setGenerationError('');
    setFileInfo('');

    try {
      const content = await readLearningFileContent(file);
      setNewCardContent(content);
      setFileInfo(
        `已从文件「${file.name}」读取内容，下面文本框中的内容将用于生成闪卡。`
      );
    } catch (error) {
      console.error('Error reading file for flashcards:', error);
      setGenerationError('读取文件内容失败，请确认文件未损坏或格式受支持。');
    } finally {
      setIsFileLoading(false);
      // 允许用户再次选择同一个文件时也能触发 onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const moveToNextCard = () => {
    const availableCards =
      studyMode === 'review'
        ? dueCards
        : studyMode === 'new'
          ? flashcards.filter((card) => card.reviewCount === 0)
          : flashcards;

    if (availableCards.length > 1) {
      const currentIndex = availableCards.findIndex(
        (card) => card.id === currentCard.id
      );
      const nextIndex = (currentIndex + 1) % availableCards.length;
      const nextCard = availableCards[nextIndex];
      const nextGlobalIndex = flashcards.findIndex(
        (card) => card.id === nextCard.id
      );
      setCurrentCardIndex(nextGlobalIndex);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'text-green-400';
      case 'medium':
        return 'text-yellow-400';
      case 'hard':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const stats = {
    // 总卡片数
    total: flashcards.length,
    // 待复习：所有看过至少一次的卡片
    due: dueCards.length,
    // 已掌握：用户标记为“太简单”的卡片
    mastered: flashcards.filter((card) => card.difficulty === 'easy').length,
    // 学习中：尚未标记为“太简单”的卡片（包含新卡片和觉得难/勉强记住的卡片）
    learning: flashcards.filter((card) => card.difficulty !== 'easy').length,
  };

  const difficultyStats = {
    easy: flashcards.filter((card) => card.difficulty === 'easy').length,
    medium: flashcards.filter((card) => card.difficulty === 'medium').length,
    hard: flashcards.filter((card) => card.difficulty === 'hard').length,
    newCards: flashcards.filter((card) => card.reviewCount === 0).length,
    reviewedCards: flashcards.filter((card) => card.reviewCount > 0).length,
  };

  return (
    <div className="from-background via-primary/5 to-muted min-h-screen bg-gradient-to-b dark:from-gray-950 dark:to-gray-950">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />
        <div className="bg-primary/5 absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-24">
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

        {(isHistoryLoading || activeHistory || historyError) && (
          <ScrollAnimation delay={0.15}>
            <div className="mx-auto mb-8 max-w-4xl space-y-3">
              {isHistoryLoading && (
                <div className="border-primary/40 bg-primary/5 text-primary flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('history.loading')}
                </div>
              )}
              {!isHistoryLoading && activeHistory && (
                <div className="border-primary/40 bg-primary/10 text-primary flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
                  <span>
                    {t('history.banner', {
                      count: activeHistory.count,
                      time: new Date(activeHistory.createdAt).toLocaleString(),
                    })}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-primary/40 text-primary hover:border-primary"
                    onClick={handleDetachHistoryDeck}
                  >
                    {t('history.clear')}
                  </Button>
                </div>
              )}
              {!isHistoryLoading && historyError && (
                <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border px-4 py-3 text-sm">
                  {historyError}
                </div>
              )}
            </div>
          </ScrollAnimation>
        )}

        <ScrollAnimation delay={0.2}>
          <div className="mx-auto mb-8 max-w-4xl">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                {
                  icon: Brain,
                  label: t('stats.total_cards'),
                  value: stats.total,
                  color: 'text-primary',
                },
                {
                  icon: Clock,
                  label: t('stats.due_cards'),
                  value: stats.due,
                  color: 'text-yellow-400',
                },
                {
                  icon: Target,
                  label: t('stats.mastered_cards'),
                  value: stats.mastered,
                  color: 'text-green-400',
                },
                {
                  icon: BarChart3,
                  label: t('stats.learning_cards'),
                  value: stats.learning,
                  color: 'text-primary',
                },
              ].map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    className="border-primary/20 bg-muted/50 rounded-xl border p-4 backdrop-blur-sm dark:bg-gray-900/50"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-6 w-6 ${stat.color}`} />
                      <div>
                        <p className="text-muted-foreground text-sm dark:text-gray-400">
                          {stat.label}
                        </p>
                        <p className="text-foreground text-xl font-bold dark:text-white">
                          {stat.value}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </ScrollAnimation>

        <ScrollAnimation delay={0.3}>
          <div className="mx-auto mb-8 max-w-4xl">
            <div className="flex justify-center gap-4">
              {[
                {
                  id: 'review',
                  label: t('modes.review'),
                  count: dueCards.length,
                },
                {
                  id: 'new',
                  label: t('modes.new_cards'),
                  count: flashcards.filter((card) => card.reviewCount === 0)
                    .length,
                },
                {
                  id: 'all',
                  label: t('modes.all_cards'),
                  count: flashcards.length,
                },
              ].map((mode) => (
                <Button
                  key={mode.id}
                  onClick={() => setStudyMode(mode.id as any)}
                  variant={studyMode === mode.id ? 'default' : 'outline'}
                  className={
                    studyMode === mode.id
                      ? 'from-primary to-primary/70 bg-gradient-to-r text-white'
                      : 'border-primary/30 text-primary/80 hover:border-primary/50'
                  }
                >
                  {mode.label}
                  {mode.count > 0 && (
                    <span className="bg-primary/20 ml-2 rounded-full px-2 py-1 text-xs">
                      {mode.count}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </ScrollAnimation>

        <ScrollAnimation delay={0.4}>
          <div className="mx-auto max-w-2xl">
            {currentCard ? (
              <div className="relative">
                <motion.div
                  className="relative h-96 cursor-pointer"
                  onClick={handleFlip}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="from-primary/20 to-primary/5 absolute inset-0 rounded-2xl bg-gradient-to-br blur-xl" />

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={isFlipped ? 'back' : 'front'}
                      initial={{ rotateY: 180, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      exit={{ rotateY: -180, opacity: 0 }}
                      transition={{ duration: 0.6 }}
                      className="border-primary/30 bg-muted/80 relative flex h-full flex-col items-center justify-center rounded-2xl border p-8 text-center backdrop-blur-sm dark:bg-gray-900/80"
                    >
                      {!isFlipped ? (
                        <div>
                          <div className="mb-4">
                            <span
                              className={`text-sm font-medium ${getDifficultyColor(currentCard.difficulty)}`}
                            >
                              {t(`card.difficulty.${currentCard.difficulty}`)}
                            </span>
                            <span className="text-muted-foreground ml-2 text-sm dark:text-gray-500">
                              {t('card.review_count')} {currentCard.reviewCount}
                            </span>
                          </div>
                          <h3 className="text-foreground mb-4 text-2xl font-bold dark:text-white">
                            {currentCard.front}
                          </h3>
                          <p className="text-muted-foreground text-sm dark:text-gray-400">
                            {t('card.click_to_flip')}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <h3 className="text-foreground mb-4 text-xl font-semibold dark:text-white">
                            {currentCard.back}
                          </h3>
                          <p className="text-muted-foreground text-sm dark:text-gray-400">
                            {t('card.click_to_return')}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>

                <div className="mt-6 flex justify-center gap-2">
                  {flashcards.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-2 w-2 rounded-full transition-all duration-300 ${
                        idx === currentCardIndex
                          ? 'bg-primary w-8'
                          : 'bg-gray-600'
                      }`}
                    />
                  ))}
                </div>

                {isFlipped && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mt-8 flex justify-center gap-3"
                  >
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRating('again');
                      }}
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:border-red-500/50 hover:bg-red-500/10"
                    >
                      <X className="mr-2 h-4 w-4" />
                      太难了
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRating('good');
                      }}
                      variant="outline"
                      className="border-orange-500/30 text-orange-400 hover:border-orange-500/50 hover:bg-orange-500/10"
                    >
                      勉强记住
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRating('easy');
                      }}
                      variant="outline"
                      className="border-green-500/30 text-green-400 hover:border-green-500/50 hover:bg-green-500/10"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      太简单
                    </Button>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="py-16 text-center">
                <Brain className="text-muted-foreground mx-auto mb-6 h-20 w-20 dark:text-gray-600" />
                <h3 className="text-foreground mb-4 text-xl font-semibold dark:text-white">
                  {studyMode === 'review'
                    ? t('empty_state.no_due_cards')
                    : t('empty_state.no_cards')}
                </h3>
                <p className="text-muted-foreground mb-6 dark:text-gray-400">
                  {studyMode === 'review'
                    ? t('empty_state.no_due_cards_desc')
                    : t('empty_state.no_cards_desc')}
                </p>
                <Button className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 bg-gradient-to-r">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('empty_state.create_cards')}
                </Button>
              </div>
            )}
          </div>
        </ScrollAnimation>

        <ScrollAnimation delay={0.5}>
          <div className="mx-auto mt-12 max-w-4xl">
            <div className="border-primary/20 bg-muted/50 rounded-2xl border p-6 backdrop-blur-sm dark:bg-gray-900/50">
              <div className="grid gap-4 md:grid-cols-3">
                <Button
                  asChild
                  variant="outline"
                  className="border-primary/30 text-primary/80 hover:border-primary/50 justify-start"
                >
                  <Link href="/library/flashcards">
                    <BookOpen className="mr-2 h-4 w-4" />
                    {t('quick_actions.library')}
                  </Link>
                </Button>
                <Button
                  onClick={handleResetProgress}
                  variant="outline"
                  className="border-primary/30 text-primary/80 hover:border-primary/50 justify-start"
                >
                  <RotateCw className="mr-2 h-4 w-4" />
                  {t('quick_actions.reset_progress')}
                </Button>
                <Button
                  variant="outline"
                  className="border-primary/30 text-primary/80 hover:border-primary/50 justify-start"
                  onClick={() => setShowStats((prev) => !prev)}
                >
                  <BarChart3 className="mr-2 h-4 w-4" />
                  {t('quick_actions.view_stats')}
                </Button>
                <Button
                  onClick={handleClearFlashcards}
                  variant="outline"
                  className="border-red-500/40 text-red-300 hover:border-red-500/70 justify-start"
                >
                  <X className="mr-2 h-4 w-4" />
                  清空闪卡
                </Button>
              </div>
            </div>
          </div>
        </ScrollAnimation>

        {showStats && (
          <ScrollAnimation delay={0.6}>
            <div className="mx-auto mt-6 max-w-4xl">
              <div className="border-primary/20 bg-muted/70 rounded-2xl border p-6 backdrop-blur-sm dark:bg-gray-900/70">
                <h3 className="text-foreground mb-4 text-lg font-semibold dark:text-white">
                  学习统计概览
                </h3>
                <p className="text-muted-foreground mb-4 text-xs dark:text-gray-400">
                  这里展示的是当前所有闪卡的分类统计结果，方便你了解整体进度和难度分布。
                </p>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="border-primary/20 bg-background/60 rounded-lg border p-4 dark:bg-gray-900/60">
                    <p className="text-muted-foreground text-xs dark:text-gray-400">
                      按难度分类
                    </p>
                    <ul className="text-foreground/80 mt-2 space-y-1 text-sm dark:text-gray-200">
                      <li>简单卡片：{difficultyStats.easy}</li>
                      <li>中等卡片：{difficultyStats.medium}</li>
                      <li>困难卡片：{difficultyStats.hard}</li>
                    </ul>
                  </div>

                  <div className="border-primary/20 bg-background/60 rounded-lg border p-4 dark:bg-gray-900/60">
                    <p className="text-muted-foreground text-xs dark:text-gray-400">
                      按学习进度分类
                    </p>
                    <ul className="text-foreground/80 mt-2 space-y-1 text-sm dark:text-gray-200">
                      <li>新卡片（未复习过）：{difficultyStats.newCards}</li>
                      <li>已学习卡片：{difficultyStats.reviewedCards}</li>
                      <li>待复习卡片：{stats.due}</li>
                    </ul>
                  </div>

                  <div className="border-primary/20 bg-background/60 rounded-lg border p-4 dark:bg-gray-900/60">
                    <p className="text-muted-foreground text-xs dark:text-gray-400">
                      整体进度
                    </p>
                    <ul className="text-foreground/80 mt-2 space-y-1 text-sm dark:text-gray-200">
                      <li>总卡片数：{stats.total}</li>
                      <li>已掌握卡片：{stats.mastered}</li>
                      <li>学习中卡片：{stats.learning}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </ScrollAnimation>
        )}

        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setShowCreateForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="border-primary/20 bg-background max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-8 dark:bg-gray-900"
            >
              <h3 className="text-foreground mb-6 text-2xl font-bold dark:text-white">
                {t('create.title')}
              </h3>

              <div className="mb-4 flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  id="flashcards-file-input"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="border-primary/40 text-primary/80 hover:border-primary/70"
                  disabled={isFileLoading || isGenerating}
                >
                  <label
                    htmlFor="flashcards-file-input"
                    className="flex cursor-pointer items-center"
                  >
                    {isFileLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在读取文件...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        从文件读取内容（PDF / Word / TXT）
                      </>
                    )}
                  </label>
                </Button>
                <span className="text-muted-foreground text-xs dark:text-gray-400">
                  也可以直接在下方粘贴或编辑要学习的内容
                </span>
              </div>

              {fileInfo && (
                <div className="border-primary/30 bg-primary/5 text-primary/80 mb-3 flex items-start gap-2 rounded-lg border p-2 text-xs">
                  <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{fileInfo}</span>
                </div>
              )}

              <div className="mb-4">
                <label
                  htmlFor="flashcards-language-select"
                  className="mb-1 block text-sm font-medium text-gray-200"
                >
                  {t('create.language_label')}
                </label>
                <Select
                  value={outputLanguage}
                  onValueChange={(value) =>
                    setOutputLanguage(value as 'auto' | 'zh' | 'en')
                  }
                >
                  <SelectTrigger
                    id="flashcards-language-select"
                    className="border-border bg-background/50 text-foreground dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-200"
                  >
                    <SelectValue placeholder={t('languages.auto')} />
                  </SelectTrigger>
                  <SelectContent className="bg-background text-foreground dark:bg-gray-900 dark:text-gray-100">
                    <SelectItem value="auto">{t('languages.auto')}</SelectItem>
                    <SelectItem value="zh">{t('languages.zh')}</SelectItem>
                    <SelectItem value="en">{t('languages.en')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground mt-1 text-xs dark:text-gray-400">
                  {t('create.language_desc')}
                </p>
              </div>

              <textarea
                value={newCardContent}
                onChange={(e) => setNewCardContent(e.target.value)}
                placeholder={t('create.placeholder')}
                className="border-border bg-background/50 text-foreground placeholder-muted-foreground focus:border-primary mb-4 h-48 w-full resize-none rounded-lg border p-4 focus:outline-none dark:border-gray-600 dark:bg-gray-800/50 dark:text-white dark:placeholder-gray-400"
              />
              {generationError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-sm text-red-400">{generationError}</p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  onClick={() => {
                    setShowCreateForm(false);
                    setGenerationError('');
                    setNewCardContent('');
                  }}
                  variant="outline"
                  className="border-border text-foreground/70 hover:border-foreground/50 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500"
                >
                  {t('buttons.cancel')}
                </Button>
                <Button
                  onClick={handleGenerateFlashcards}
                  disabled={isGenerating || !newCardContent.trim()}
                  className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 bg-gradient-to-r text-white"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('create.ai_generating')}
                    </>
                  ) : (
                    <>
                      <CreditsCost credits={3} />
                      <Brain className="mr-2 h-4 w-4" />
                      {t('create.generate')}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default FlashcardsApp;

