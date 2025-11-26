'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
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

import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { readLearningFileContent } from '@/shared/lib/file-reader';
import { OpenRouterService } from '@/shared/services/openrouter';

interface Flashcard {
  id: number;
  front: string;
  back: string;
  difficulty: 'easy' | 'medium' | 'hard';
  lastReviewed?: Date;
  nextReview?: Date;
  reviewCount: number;
}

const FlashcardsApp = () => {
  const t = useTranslations('flashcards');
  const [flashcards, setFlashcards] = useState<Flashcard[]>([
    {
      id: 1,
      front: '什么是机器学习？',
      back: '机器学习是人工智能的一个分支，它使计算机系统能够从经验中学习和改进，而无需明确编程。',
      difficulty: 'medium',
      reviewCount: 3,
      lastReviewed: new Date(Date.now() - 86400000), // 1天前
      nextReview: new Date(Date.now() + 86400000), // 1天后
    },
    {
      id: 2,
      front: '深度学习与机器学习的区别是什么？',
      back: '深度学习是机器学习的一个子集，使用多层神经网络来学习数据的复杂模式。它特别适合处理大规模、高维度的数据。',
      difficulty: 'hard',
      reviewCount: 1,
      lastReviewed: new Date(Date.now() - 172800000), // 2天前
      nextReview: new Date(Date.now() - 86400000), // 应该复习
    },
    {
      id: 3,
      front: '什么是神经网络？',
      back: '神经网络是一种受生物大脑启发的计算模型，由相互连接的节点（神经元）组成，能够处理和学习复杂的模式。',
      difficulty: 'easy',
      reviewCount: 5,
      lastReviewed: new Date(Date.now() - 432000000), // 5天前
      nextReview: new Date(Date.now() + 2592000000), // 30天后
    },
  ]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCardContent, setNewCardContent] = useState('');
  const [generationError, setGenerationError] = useState('');
  // 文件上传相关状态：用于“从文件生成闪卡”
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyMode, setStudyMode] = useState<'review' | 'new' | 'all'>(
    'review'
  );
  // 是否展开「详细统计」面板
  const [showStats, setShowStats] = useState(false);

  const currentCard = flashcards[currentCardIndex];
  // 所有看过至少一次（reviewCount > 0）的卡片，都视为“待复习”
  const dueCards = flashcards.filter((card) => card.reviewCount > 0);

  useEffect(() => {
    // 自动切换到需要复习的卡片
    if (dueCards.length > 0 && studyMode === 'review') {
      const dueIndex = flashcards.findIndex(
        (card) => card.id === dueCards[0].id
      );
      setCurrentCardIndex(dueIndex);
    }
  }, [studyMode]);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  /**
   * 评分按钮逻辑：
   * - 太难了：difficulty = 'hard'，归入“学习中”
   * - 勉强记住：difficulty = 'medium'，归入“学习中”
   * - 太简单：difficulty = 'easy'，归入“已掌握”
   * 注意：所有被评分过的卡片（reviewCount > 0）都会被视为“待复习”
   */
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
      const aiService = OpenRouterService.getInstance();
      const result = await aiService.generateFlashcards(newCardContent, 10);

      if (result.success && result.flashcards.length > 0) {
        const newFlashcards: Flashcard[] = result.flashcards.map(
          (fc, index) => ({
            id: Date.now() + index, // 确保唯一ID
            front: fc.front,
            back: fc.back,
            difficulty: fc.difficulty as 'easy' | 'medium' | 'hard',
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
      } else {
        setGenerationError(result.error || t('create.generation_error'));
      }
    } catch (error) {
      console.error('Error generating flashcards:', error);
      setGenerationError(t('create.generation_error'));
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 重置进度：
   * - 所有卡片 difficulty 统一为 'medium'（学习中）
   * - 清空复习次数和时间字段
   * - 同时收起统计面板
   */
  const handleResetProgress = () => {
    const resetCards = flashcards.map((card) => ({
      ...card,
      difficulty: 'medium',
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

  /**
   * 清空闪卡：
   * - 删除当前所有卡片
   * - 清空统计相关状态
   * - 用户可以通过 AI 再次生成新的闪卡集
   */
  const handleClearFlashcards = () => {
    setFlashcards([]);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setStudyMode('review');
    setShowStats(false);
  };

  /**
   * 处理文件选择（支持 txt / pdf / docx 等）
   *
   * 非程序员解释：
   * - 这里不会直接把文件丢给 AI，而是先用我们统一的 readLearningFileContent
   *   把文件里的文字“抖”出来，放进文本框，再让 AI 根据这段文字生成闪卡
   */
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

  // 细分统计：按难度、是否为新卡片等进行划分
  const difficultyStats = {
    easy: flashcards.filter((card) => card.difficulty === 'easy').length,
    medium: flashcards.filter((card) => card.difficulty === 'medium').length,
    hard: flashcards.filter((card) => card.difficulty === 'hard').length,
    newCards: flashcards.filter((card) => card.reviewCount === 0).length,
    reviewedCards: flashcards.filter((card) => card.reviewCount > 0).length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-purple-950/10 to-gray-950">
      {/* 背景装饰 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-purple-600/10 blur-3xl" />
        <div className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12">
        <ScrollAnimation>
          <div className="mb-12 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="mb-6 bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {t('title')}
              </h1>
              <p className="mx-auto max-w-3xl text-lg text-gray-300 md:text-xl">
                {t('subtitle')}
              </p>
            </motion.div>
          </div>
        </ScrollAnimation>

        {/* 统计信息 */}
        <ScrollAnimation delay={0.2}>
          <div className="mx-auto mb-8 max-w-4xl">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                {
                  icon: Brain,
                  label: t('stats.total_cards'),
                  value: stats.total,
                  color: 'text-purple-400',
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
                  color: 'text-blue-400',
                },
              ].map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    className="rounded-xl border border-purple-500/20 bg-gray-900/50 p-4 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-6 w-6 ${stat.color}`} />
                      <div>
                        <p className="text-sm text-gray-400">{stat.label}</p>
                        <p className="text-xl font-bold text-white">
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

        {/* 学习模式选择 */}
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
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                      : 'border-purple-500/30 text-purple-300 hover:border-purple-500/50'
                  }
                >
                  {mode.label}
                  {mode.count > 0 && (
                    <span className="ml-2 rounded-full bg-purple-500/20 px-2 py-1 text-xs">
                      {mode.count}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </ScrollAnimation>

        {/* 闪卡主体 */}
        <ScrollAnimation delay={0.4}>
          <div className="mx-auto max-w-2xl">
            {currentCard ? (
              <div className="relative">
                {/* 闪卡 */}
                <motion.div
                  className="relative h-96 cursor-pointer"
                  onClick={handleFlip}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 blur-xl" />

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={isFlipped ? 'back' : 'front'}
                      initial={{ rotateY: 180, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      exit={{ rotateY: -180, opacity: 0 }}
                      transition={{ duration: 0.6 }}
                      className="relative flex h-full flex-col items-center justify-center rounded-2xl border border-purple-500/30 bg-gray-900/80 p-8 text-center backdrop-blur-sm"
                    >
                      {!isFlipped ? (
                        <div>
                          <div className="mb-4">
                            <span
                              className={`text-sm font-medium ${getDifficultyColor(currentCard.difficulty)}`}
                            >
                              {t(`card.difficulty.${currentCard.difficulty}`)}
                            </span>
                            <span className="ml-2 text-sm text-gray-500">
                              {t('card.review_count')} {currentCard.reviewCount}
                            </span>
                          </div>
                          <h3 className="mb-4 text-2xl font-bold text-white">
                            {currentCard.front}
                          </h3>
                          <p className="text-sm text-gray-400">
                            {t('card.click_to_flip')}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <h3 className="mb-4 text-xl font-semibold text-white">
                            {currentCard.back}
                          </h3>
                          <p className="text-sm text-gray-400">
                            {t('card.click_to_return')}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>

                {/* 进度指示器 */}
                <div className="mt-6 flex justify-center gap-2">
                  {flashcards.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-2 w-2 rounded-full transition-all duration-300 ${
                        idx === currentCardIndex
                          ? 'w-8 bg-purple-400'
                          : 'bg-gray-600'
                      }`}
                    />
                  ))}
                </div>

                {/* 评分按钮 */}
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
                      {/* 太难了 -> 归入“学习中” */}
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
                      {/* 勉强记住 -> 归入“学习中” */}
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
                      {/* 太简单 -> 归入“已掌握” */}
                      太简单
                    </Button>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="py-16 text-center">
                <Brain className="mx-auto mb-6 h-20 w-20 text-gray-600" />
                <h3 className="mb-4 text-xl font-semibold text-white">
                  {studyMode === 'review'
                    ? t('empty_state.no_due_cards')
                    : t('empty_state.no_cards')}
                </h3>
                <p className="mb-6 text-gray-400">
                  {studyMode === 'review'
                    ? t('empty_state.no_due_cards_desc')
                    : t('empty_state.no_cards_desc')}
                </p>
                <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('empty_state.create_cards')}
                </Button>
              </div>
            )}
          </div>
        </ScrollAnimation>

        {/* 快捷操作 */}
        <ScrollAnimation delay={0.5}>
          <div className="mx-auto mt-12 max-w-4xl">
            <div className="rounded-2xl border border-purple-500/20 bg-gray-900/50 p-6 backdrop-blur-sm">
              <div className="grid gap-4 md:grid-cols-3">
                <Button
                  onClick={() => setShowCreateForm(true)}
                  variant="outline"
                  className="justify-start border-purple-500/30 text-purple-300 hover:border-purple-500/50"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('quick_actions.ai_generate')}
                </Button>
                <Button
                  onClick={handleResetProgress}
                  variant="outline"
                  className="justify-start border-purple-500/30 text-purple-300 hover:border-purple-500/50"
                >
                  <RotateCw className="mr-2 h-4 w-4" />
                  {t('quick_actions.reset_progress')}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start border-purple-500/30 text-purple-300 hover:border-purple-500/50"
                  // 非程序员解释：
                  // - 点击这个按钮，会在页面下方展开一个「详细统计」面板
                  // - 再次点击会收起，相当于开关
                  onClick={() => setShowStats((prev) => !prev)}
                >
                  <BarChart3 className="mr-2 h-4 w-4" />
                  {t('quick_actions.view_stats')}
                </Button>
                <Button
                  onClick={handleClearFlashcards}
                  variant="outline"
                  className="justify-start border-red-500/40 text-red-300 hover:border-red-500/70"
                >
                  <X className="mr-2 h-4 w-4" />
                  清空闪卡
                </Button>
              </div>
            </div>
          </div>
        </ScrollAnimation>

        {/* 详细统计面板：点击「查看统计」后展示更细的分类数据 */}
        {showStats && (
          <ScrollAnimation delay={0.6}>
            <div className="mx-auto mt-6 max-w-4xl">
              <div className="rounded-2xl border border-purple-500/20 bg-gray-900/70 p-6 backdrop-blur-sm">
                <h3 className="mb-4 text-lg font-semibold text-white">
                  学习统计概览
                </h3>
                <p className="mb-4 text-xs text-gray-400">
                  这里展示的是当前所有闪卡的分类统计结果，方便你了解整体进度和难度分布。
                </p>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-purple-500/20 bg-gray-900/60 p-4">
                    <p className="text-xs text-gray-400">按难度分类</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-200">
                      <li>简单卡片：{difficultyStats.easy}</li>
                      <li>中等卡片：{difficultyStats.medium}</li>
                      <li>困难卡片：{difficultyStats.hard}</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-purple-500/20 bg-gray-900/60 p-4">
                    <p className="text-xs text-gray-400">按学习进度分类</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-200">
                      <li>新卡片（未复习过）：{difficultyStats.newCards}</li>
                      <li>已学习卡片：{difficultyStats.reviewedCards}</li>
                      <li>待复习卡片：{stats.due}</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-purple-500/20 bg-gray-900/60 p-4">
                    <p className="text-xs text-gray-400">整体进度</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-200">
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

        {/* 创建闪卡表单 */}
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
              className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-purple-500/20 bg-gray-900 p-8"
            >
              <h3 className="mb-6 text-2xl font-bold text-white">
                {t('create.title')}
              </h3>

              {/* 文件上传入口：可以直接从课件 / 笔记文件生成闪卡 */}
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
                  className="border-purple-500/40 text-purple-300 hover:border-purple-500/70"
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
                <span className="text-xs text-gray-400">
                  也可以直接在下方粘贴或编辑要学习的内容
                </span>
              </div>

              {fileInfo && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-2 text-xs text-purple-200">
                  <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{fileInfo}</span>
                </div>
              )}

              <textarea
                value={newCardContent}
                onChange={(e) => setNewCardContent(e.target.value)}
                placeholder={t('create.placeholder')}
                className="mb-4 h-48 w-full resize-none rounded-lg border border-gray-600 bg-gray-800/50 p-4 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
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
                  className="border-gray-600 text-gray-300 hover:border-gray-500"
                >
                  {t('buttons.cancel')}
                </Button>
                <Button
                  onClick={handleGenerateFlashcards}
                  disabled={isGenerating || !newCardContent.trim()}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('create.ai_generating')}
                    </>
                  ) : (
                    <>
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
