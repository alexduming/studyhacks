'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Brain,
  CheckCircle,
  Clock,
  FileText,
  Lightbulb,
  Loader2,
  Target,
  Trophy,
  Upload,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { CreditsCost } from '@/shared/components/ai-elements/credits-display';
import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { useAppContext } from '@/shared/contexts/app';
import { readLearningFileContent } from '@/shared/lib/file-reader';
import { type QuizQuestion as AIQuizQuestion } from '@/shared/services/openrouter';

interface Question {
  id: number;
  type: 'multiple-choice' | 'true-false' | 'fill-blank';
  question: string;
  options?: string[];
  correctAnswer: string | number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  hints?: string[];
}

interface UserAnswer {
  questionId: number;
  userAnswer: string | number;
  isCorrect: boolean;
  timeSpent: number;
  hintsUsed: number;
}

const NOTE_TRANSFER_KEY = 'ai-note-transfer';

const QuizApp = () => {
  const t = useTranslations('quiz');
  const { user, fetchUserCredits } = useAppContext();
  const [questions, setQuestions] = useState<Question[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [quizContent, setQuizContent] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  // 预计用时（分钟），仅用于展示给用户看的"计划用时"
  const [expectedTime, setExpectedTime] = useState(10);
  // 题型选择
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState<string[]>([
    'all',
  ]);
  // 文件上传相关状态：用于"从文件生成测验"
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | number>('');
  const [showResult, setShowResult] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [currentHints, setCurrentHints] = useState<string[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState<number>(
    Date.now()
  );
  const [usedHints, setUsedHints] = useState<Set<number>>(new Set());
  const transferAutoGenerateRef = useRef(false);

  /**
   * 非程序员解释：
   * - 下列样式常量把“卡片 / 浮层 / 选项”等基础组件统一成可同时适配浅色与深色的主题皮肤。
   * - 这样我们只维护一份类名即可，避免 light 模式出现“白底白字”或“黑底黑字”看不清的问题。
   */
  const surfaceCardClass =
    'rounded-2xl border border-border/70 bg-card/90 text-card-foreground shadow-xl backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/70';
  const mutedPanelClass =
    'rounded-lg border border-border/60 bg-muted/70 text-foreground dark:border-gray-700 dark:bg-gray-800/60';
  const modalPanelClass =
    'max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border/70 bg-popover p-8 text-popover-foreground shadow-2xl dark:border-gray-800 dark:bg-gray-900/90';
  const optionBaseClass =
    'w-full rounded-lg border border-border/70 bg-muted/70 p-4 text-left text-foreground transition-all duration-300 hover:border-primary/50 hover:bg-primary/5 dark:border-gray-700 dark:bg-gray-800/60';

  const currentQuestion = questions[currentQuestionIndex];

  useEffect(() => {
    if (quizStarted && !quizCompleted) {
      setQuestionStartTime(Date.now());
    }
  }, [currentQuestionIndex, quizStarted, quizCompleted]);

  useEffect(() => {
    /**
     * 非程序员解释：
     * - AI 笔记页会把总结写入 sessionStorage，我们在此自动接收
     * - 打开本页时就能直接看到笔记内容，并立即生成测验
     */
    if (typeof window === 'undefined') return;
    const payloadRaw = sessionStorage.getItem(NOTE_TRANSFER_KEY);
    if (!payloadRaw) return;

    sessionStorage.removeItem(NOTE_TRANSFER_KEY);
    try {
      const payload = JSON.parse(payloadRaw);
      if (payload?.type !== 'quiz' || !payload?.content) {
        return;
      }

      setShowGenerateForm(true);
      setQuizContent(payload.content);
      setFileInfo(t('create.transfer_info'));
      setGenerationError('');
      transferAutoGenerateRef.current = true;
    } catch (error) {
      console.error('Failed to read transfer data for quiz:', error);
      toast.error(t('create.transfer_error'));
    }
  }, [t]);

  useEffect(() => {
    // 当文本已就绪且没有其他生成任务时，自动触发一次“生成测验”
    if (
      transferAutoGenerateRef.current &&
      quizContent.trim() &&
      !isGenerating
    ) {
      transferAutoGenerateRef.current = false;
      toast.success(t('create.transfer_success'));
      handleGenerateQuiz();
    }
  }, [quizContent, isGenerating]);

  const handleStartQuiz = () => {
    setQuizStarted(true);
    setQuestionStartTime(Date.now());
  };

  const handleGenerateQuiz = async () => {
    if (!quizContent.trim()) {
      setGenerationError('请输入要生成测验的内容');
      return;
    }

    setIsGenerating(true);
    setGenerationError('');

    try {
      /**
       * 非程序员解释：
       * - 之前：这里直接在浏览器中 new OpenRouterService，然后带着密钥去请求 OpenRouter。
       *   结果是：任何人都可以在浏览器开发者工具里看到你的 OpenRouter 密钥 → 不安全。
       * - 现在：浏览器只请求我们自己的 /api/ai/quiz 接口，真正访问 OpenRouter 的动作在服务器完成。
       * - 这样既保留了原有“输入文本 → 自动生成测验”的体验，又把所有敏感信息藏到后端。
       */
      const response = await fetch('/api/ai/quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: quizContent,
          questionCount,
          questionTypes: selectedQuestionTypes.includes('all')
            ? undefined
            : selectedQuestionTypes,
        }),
      });

      const result = await response.json();

      if (result.success && result.questions && result.questions.length > 0) {
        const newQuestions: Question[] = result.questions.map(
          (q: AIQuizQuestion, index: number) => {
            const extended = q as AIQuizQuestion & {
              topic?: string;
              hints?: string[];
            };

            return {
              id: Date.now() + index, // 确保唯一ID
              type: extended.type,
              question: extended.question,
              options: extended.options,
              correctAnswer: extended.correctAnswer,
              explanation: extended.explanation,
              difficulty: (extended.difficulty ||
                'medium') as Question['difficulty'],
              topic: extended.topic || 'General',
              hints: extended.hints || [],
            };
          }
        );

        setQuestions(newQuestions);
        setQuizContent('');
        setShowGenerateForm(false);
        setCurrentQuestionIndex(0);
        setUserAnswers([]);
        setSelectedAnswer('');
        setShowResult(false);
        setQuizCompleted(false);

        // 刷新积分余额
        if (user) {
          fetchUserCredits();
        }
        toast.success('测验题目生成成功！');
      } else {
        // 积分不足的特殊处理
        if (result.insufficientCredits) {
          toast.error(
            `积分不足！需要 ${result.requiredCredits} 积分，当前仅有 ${result.remainingCredits} 积分`
          );
        } else {
          toast.error(result.error || '生成测验时出错');
        }
        setGenerationError(result.error || '生成测验时出错');
      }
    } catch (error) {
      console.error('Error generating quiz:', error);
      setGenerationError('生成测验时出错，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 处理文件选择（支持 txt / pdf / docx 等）
   *
   * 非程序员解释：
   * - 这里不会直接把文件丢给 AI，而是先用统一的 readLearningFileContent
   *   把文件里的文字抽出来，填到文本框，再让 AI 根据这段文字生成测验题目
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
      setQuizContent(content);
      setFileInfo(
        `已从文件「${file.name}」读取内容，下面文本框中的内容将用于生成测验。`
      );
    } catch (error) {
      console.error('Error reading file for quiz:', error);
      setGenerationError('读取文件内容失败，请确认文件未损坏或格式受支持。');
    } finally {
      setIsFileLoading(false);
      // 允许用户再次选择同一个文件时也能触发 onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAnswerSelect = (answer: string | number) => {
    if (showResult) return;
    setSelectedAnswer(answer);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === '') return;

    const timeSpent = Date.now() - questionStartTime;

    /**
     * 非程序员解释：增强答案比对逻辑
     * - 填空题：不区分大小写，去除首尾空格
     * - 选择题和判断题：支持多种格式比对，确保准确判断
     */
    let isCorrect = false;

    if (currentQuestion.type === 'fill-blank') {
      // 填空题：不区分大小写，去除首尾空格
      const userAns = String(selectedAnswer).trim().toLowerCase();
      const correctAns = String(currentQuestion.correctAnswer)
        .trim()
        .toLowerCase();
      isCorrect = userAns === correctAns;
    } else {
      // 选择题和判断题
      // 1. 直接全等比较
      if (selectedAnswer === currentQuestion.correctAnswer) {
        isCorrect = true;
      }
      // 2. 字符串化比较 (解决 0 vs "0" 的问题)
      else if (
        String(selectedAnswer) === String(currentQuestion.correctAnswer)
      ) {
        isCorrect = true;
      }
      // 3. 解决 AI 返回选项文本作为答案的情况
      else if (
        typeof selectedAnswer === 'number' &&
        currentQuestion.options &&
        currentQuestion.options[selectedAnswer] ===
          currentQuestion.correctAnswer
      ) {
        isCorrect = true;
      }
    }

    const hintsUsedCount = currentHints.length;

    const answer: UserAnswer = {
      questionId: currentQuestion.id,
      userAnswer: selectedAnswer,
      isCorrect,
      timeSpent,
      hintsUsed: hintsUsedCount,
    };

    setUserAnswers([...userAnswers, answer]);
    setShowResult(true);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer('');
      setShowResult(false);
      setShowExplanation(false);
      setCurrentHints([]);
      setUsedHints(new Set());
    } else {
      setQuizCompleted(true);
    }
  };

  const handleShowHint = () => {
    if (
      currentQuestion.hints &&
      currentHints.length < currentQuestion.hints.length
    ) {
      const nextHintIndex = currentHints.length;
      setCurrentHints([...currentHints, currentQuestion.hints[nextHintIndex]]);
      setUsedHints(new Set([...usedHints, currentQuestion.id]));
    }
  };

  const calculateScore = () => {
    const correctAnswers = userAnswers.filter(
      (answer) => answer.isCorrect
    ).length;
    return {
      correct: correctAnswers,
      total: questions.length,
      percentage: Math.round((correctAnswers / questions.length) * 100),
      averageTime: Math.round(
        userAnswers.reduce((sum, answer) => sum + answer.timeSpent, 0) /
          userAnswers.length /
          1000
      ),
      totalHintsUsed: usedHints.size,
    };
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
        return 'text-muted-foreground';
    }
  };

  // 如果还未开始测验，显示欢迎/开始界面
  if (!quizStarted) {
    return (
      <div className="via-primary/5 from-background to-muted flex min-h-screen items-center justify-center bg-gradient-to-b dark:from-gray-950 dark:to-gray-950">
        <div className="relative z-10 container mx-auto px-4">
          <ScrollAnimation>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mx-auto max-w-2xl text-center"
            >
              {/* 顶部图标区域：统一为 primary 深浅渐变，贴合 turbo 主色 */}
              <div className="from-primary to-primary/70 mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br">
                <Brain className="h-12 w-12 text-white" />
              </div>

              {/* 标题渐变调整为白色 → primary，整体色调与 Hero 保持一致 */}
              <h1 className="via-primary/80 to-primary/60 mb-6 bg-gradient-to-r from-white bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {t('title')}
              </h1>
              <p className="text-muted-foreground mb-8 text-lg">
                {t('subtitle')}
              </p>

              {questions.length > 0 && (
                <div className={`${surfaceCardClass} mb-8`}>
                  <h3 className="text-foreground mb-6 text-xl font-semibold">
                    测验信息
                  </h3>
                  <div className="grid gap-6 text-left md:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground mb-2">
                        {t('stats.total_questions')}
                      </p>
                      <p className="text-foreground text-lg font-medium">
                        {questions.length} 题
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-2">
                        {t('stats.time_spent')}
                      </p>
                      <p className="text-foreground text-lg font-medium">
                        {Math.ceil(questions.length * 2)} 分钟
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-2">
                        {t('question.multiple_choice')},{' '}
                        {t('question.true_false')}, {t('question.fill_blank')}
                      </p>
                      <p className="text-foreground text-lg font-medium"></p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-2">智能提示</p>
                      <p className="text-foreground text-lg font-medium">
                        每题提供学习提示
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-4">
                <Button
                  onClick={() => setShowGenerateForm(true)}
                  variant="outline"
                  className="border-primary/30 text-primary/80 hover:border-primary/50 px-8 py-4 text-lg"
                  type="button"
                >
                  <CreditsCost credits={3} />
                  {t('create.generate')}
                </Button>
                {questions.length > 0 && (
                  <Button
                    onClick={handleStartQuiz}
                    className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 bg-gradient-to-r px-8 py-4 text-lg text-white"
                  >
                    {t('actions.start_quiz')}
                  </Button>
                )}
              </div>
            </motion.div>
          </ScrollAnimation>

          {/* 生成测验表单 */}
          {showGenerateForm && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm dark:bg-black/70"
              onClick={() => setShowGenerateForm(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={(e) => e.stopPropagation()}
                className={modalPanelClass}
              >
                <h3 className="text-foreground mb-6 text-2xl font-bold">
                  生成 AI 测验
                </h3>
                {/* 文件上传入口：可以直接从课件 / 笔记文件生成测验 */}
                <div className="mb-4 flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    id="quiz-file-input"
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
                      htmlFor="quiz-file-input"
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
                  <span className="text-muted-foreground text-xs">
                    也可以直接在下方粘贴或编辑要生成测验的内容
                  </span>
                </div>

                {fileInfo && (
                  <div className="border-primary/30 bg-primary/5 text-primary/80 mb-3 flex items-start gap-2 rounded-lg border p-2 text-xs">
                    <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>{fileInfo}</span>
                  </div>
                )}

                <div className="mb-6 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-foreground mb-3 block font-medium">
                      测验题目数量
                    </label>
                    <select
                      value={questionCount}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                      className="border-border bg-card/80 text-foreground focus:border-primary w-full rounded-lg border p-3 focus:outline-none dark:border-gray-700 dark:bg-gray-900/60"
                    >
                      <option value={3}>3 题</option>
                      <option value={5}>5 题</option>
                      <option value={10}>10 题</option>
                      <option value={15}>15 题</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-foreground mb-3 block font-medium">
                      预计用时（分钟）
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={expectedTime}
                      onChange={(e) =>
                        setExpectedTime(
                          Number.isNaN(Number(e.target.value))
                            ? 10
                            : Number(e.target.value)
                        )
                      }
                      className="border-border bg-card/80 text-foreground focus:border-primary w-full rounded-lg border p-3 focus:outline-none dark:border-gray-700 dark:bg-gray-900/60"
                    />
                  </div>
                </div>

                {/* 题型选择 */}
                <div className="mb-6">
                  <label className="text-foreground mb-3 block font-medium">
                    题型选择
                  </label>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => setSelectedQuestionTypes(['all'])}
                      className={`rounded-lg border p-3 transition-all ${
                        selectedQuestionTypes.includes('all')
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/70 bg-muted/60 text-foreground/70 hover:border-primary/60 hover:bg-primary/5 transition-all dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200'
                      }`}
                    >
                      全部题型
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const types = selectedQuestionTypes.filter(
                          (t) => t !== 'all'
                        );
                        if (types.includes('multiple-choice')) {
                          const newTypes = types.filter(
                            (t) => t !== 'multiple-choice'
                          );
                          setSelectedQuestionTypes(
                            newTypes.length > 0 ? newTypes : ['all']
                          );
                        } else {
                          setSelectedQuestionTypes([
                            ...types,
                            'multiple-choice',
                          ]);
                        }
                      }}
                      className={`rounded-lg border p-3 transition-all ${
                        selectedQuestionTypes.includes('multiple-choice')
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/70 bg-muted/60 text-foreground/70 hover:border-primary/60 hover:bg-primary/5 transition-all dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200'
                      }`}
                    >
                      选择题
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const types = selectedQuestionTypes.filter(
                          (t) => t !== 'all'
                        );
                        if (types.includes('true-false')) {
                          const newTypes = types.filter(
                            (t) => t !== 'true-false'
                          );
                          setSelectedQuestionTypes(
                            newTypes.length > 0 ? newTypes : ['all']
                          );
                        } else {
                          setSelectedQuestionTypes([...types, 'true-false']);
                        }
                      }}
                      className={`rounded-lg border p-3 transition-all ${
                        selectedQuestionTypes.includes('true-false')
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/70 bg-muted/60 text-foreground/70 hover:border-primary/60 hover:bg-primary/5 transition-all dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200'
                      }`}
                    >
                      判断题
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const types = selectedQuestionTypes.filter(
                          (t) => t !== 'all'
                        );
                        if (types.includes('fill-blank')) {
                          const newTypes = types.filter(
                            (t) => t !== 'fill-blank'
                          );
                          setSelectedQuestionTypes(
                            newTypes.length > 0 ? newTypes : ['all']
                          );
                        } else {
                          setSelectedQuestionTypes([...types, 'fill-blank']);
                        }
                      }}
                      className={`rounded-lg border p-3 transition-all ${
                        selectedQuestionTypes.includes('fill-blank')
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/70 bg-muted/60 text-foreground/70 hover:border-primary/60 hover:bg-primary/5 transition-all dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200'
                      }`}
                    >
                      填空题
                    </button>
                  </div>
                </div>

                <textarea
                  value={quizContent}
                  onChange={(e) => setQuizContent(e.target.value)}
                  placeholder="粘贴您的学习笔记、课程内容或任何想要转换为测验的文本..."
                  className="border-border bg-card/80 text-foreground placeholder-muted-foreground focus:border-primary mb-4 h-48 w-full resize-none rounded-lg border p-4 focus:outline-none dark:border-gray-700 dark:bg-gray-900/60"
                />
                {generationError && (
                  <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <p className="text-sm text-red-400">{generationError}</p>
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <Button
                    onClick={() => {
                      setShowGenerateForm(false);
                      setGenerationError('');
                      setQuizContent('');
                    }}
                    variant="outline"
                    className="border-border text-foreground/70 hover:border-foreground/60"
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleGenerateQuiz}
                    disabled={isGenerating}
                    className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 bg-gradient-to-r text-white"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        AI 正在生成...
                      </>
                    ) : (
                      <>
                        <Brain className="mr-2 h-4 w-4" />
                        生成测验
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
  }

  if (quizCompleted) {
    const score = calculateScore();

    return (
      <div className="via-primary/5 from-background to-muted flex min-h-screen items-center justify-center bg-gradient-to-b dark:from-gray-950 dark:to-gray-950">
        <div className="relative z-10 container mx-auto px-4">
          <ScrollAnimation>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mx-auto max-w-2xl text-center"
            >
              <div className="from-primary to-primary/70 mx-auto mt-20 mb-8 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br">
                <Trophy className="h-12 w-12 text-white" />
              </div>

              <h1 className="via-primary/80 to-primary/60 mb-6 bg-gradient-to-r from-white bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {t('results.title')}
              </h1>

              <div className={`${surfaceCardClass} mb-8`}>
                <div className="mb-8 text-center">
                  <div className="text-foreground mb-2 text-6xl font-bold">
                    {score.percentage}%
                  </div>
                  <p className="text-muted-foreground">您的得分</p>
                </div>

                <div className="mb-8 grid gap-6 md:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground mb-2">正确答案</p>
                    <p className="text-xl font-medium text-green-400">
                      {score.correct}/{score.total}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-2">平均用时</p>
                    <p className="text-primary text-xl font-medium">
                      {score.averageTime}秒
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-2">使用提示</p>
                    <p className="text-xl font-medium text-yellow-400">
                      {score.totalHintsUsed}次
                    </p>
                  </div>
                </div>

                {/* 详细答案 */}
                <div className="space-y-4 text-left">
                  <h3 className="text-foreground mb-4 text-lg font-semibold">
                    答题详情
                  </h3>
                  {userAnswers.map((answer, idx) => {
                    const question = questions.find(
                      (q) => q.id === answer.questionId
                    );
                    return (
                      <div
                        key={idx}
                        className={`${mutedPanelClass} border-none p-4`}
                      >
                        <div className="flex items-start gap-3">
                          {answer.isCorrect ? (
                            <CheckCircle className="mt-1 h-5 w-5 flex-shrink-0 text-green-400" />
                          ) : (
                            <XCircle className="mt-1 h-5 w-5 flex-shrink-0 text-red-400" />
                          )}
                          <div className="flex-1">
                            <p className="text-foreground font-medium">
                              {question?.question}
                            </p>
                            {!answer.isCorrect && (
                              <p className="text-muted-foreground mt-1 text-sm">
                                正确答案:{' '}
                                {question?.options
                                  ? question.options[
                                      question.correctAnswer as number
                                    ]
                                  : question?.correctAnswer}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-center gap-4">
                <Button
                  onClick={() => window.location.reload()}
                  className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 bg-gradient-to-r text-white"
                >
                  重新测验
                </Button>
                <Button
                  variant="outline"
                  className="border-primary/30 text-primary/80 hover:border-primary/50"
                >
                  返回主页
                </Button>
              </div>
            </motion.div>
          </ScrollAnimation>
        </div>
      </div>
    );
  }

  return (
    <div className="via-primary/5 from-background to-muted min-h-screen bg-gradient-to-b dark:from-gray-950 dark:to-gray-950">
      {/* 背景装饰：统一为 primary 色系的柔和光晕，避免额外蓝色块破坏整体主题 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />
        <div className="bg-primary/5 absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-24">
        {/* 进度条 */}
        <div className="mx-auto mb-8 max-w-4xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              问题 {currentQuestionIndex + 1} / {questions.length}
            </span>
            <span
              className={`text-sm ${getDifficultyColor(currentQuestion.difficulty)}`}
            >
              {currentQuestion.difficulty === 'easy'
                ? '简单'
                : currentQuestion.difficulty === 'medium'
                  ? '中等'
                  : '困难'}
            </span>
          </div>
          <div className="bg-muted/60 h-2 w-full rounded-full dark:bg-gray-800/70">
            <div
              className="from-primary to-primary/70 h-2 rounded-full bg-gradient-to-r transition-all duration-300"
              style={{
                width: `${((currentQuestionIndex + 1) / questions.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* 题目内容 */}
        <ScrollAnimation>
          <div className="mx-auto max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className={`${surfaceCardClass} p-8`}
            >
              {/* 题目 */}
              <div className="mb-8">
                <div className="mb-4 flex items-center gap-2">
                  <BookOpen className="text-primary h-5 w-5" />
                  <span className="text-primary text-sm">
                    {currentQuestion.topic}
                  </span>
                </div>
                <h2 className="text-foreground mb-2 text-2xl font-bold">
                  {currentQuestion.question}
                </h2>
              </div>

              {/* 答案选项 */}
              <div className="mb-8 space-y-3">
                {currentQuestion.type === 'multiple-choice' &&
                  currentQuestion.options?.map((option, idx) => {
                    // 增强判断逻辑：支持索引比较和文本内容比较
                    const isCorrectAnswer =
                      String(idx) === String(currentQuestion.correctAnswer) ||
                      (currentQuestion.options &&
                        currentQuestion.options[idx] ===
                          currentQuestion.correctAnswer);

                    const isUserSelected =
                      String(idx) === String(selectedAnswer);
                    const userAnsweredCorrectly =
                      showResult &&
                      userAnswers.length > 0 &&
                      userAnswers[userAnswers.length - 1]?.isCorrect;

                    // 确定显示状态：优先显示正确答案为绿色，即使用户选择了它
                    const shouldShowCorrect = showResult && isCorrectAnswer;
                    const shouldShowWrong =
                      showResult &&
                      isUserSelected &&
                      !userAnsweredCorrectly &&
                      !isCorrectAnswer;
                    const shouldShowNeutral =
                      showResult && !isCorrectAnswer && !shouldShowWrong;

                    return (
                      <button
                        key={idx}
                        onClick={() => handleAnswerSelect(idx)}
                        disabled={showResult}
                        className={`${optionBaseClass} ${
                          shouldShowCorrect
                            ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-300'
                            : shouldShowWrong
                              ? 'border-red-500 bg-red-500/10 text-red-500 dark:text-red-300'
                              : shouldShowNeutral
                                ? 'border-border/70 text-muted-foreground bg-transparent'
                                : isUserSelected
                                  ? 'border-primary bg-primary/10'
                                  : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                              shouldShowCorrect
                                ? 'border-green-500 bg-green-500'
                                : shouldShowWrong
                                  ? 'border-red-500 bg-red-500'
                                  : shouldShowNeutral
                                    ? 'border-border/70'
                                    : isUserSelected
                                      ? 'border-primary bg-primary'
                                      : 'border-border/60'
                            }`}
                          >
                            {shouldShowCorrect && (
                              <CheckCircle className="h-4 w-4 text-white" />
                            )}
                            {shouldShowWrong && (
                              <XCircle className="h-4 w-4 text-white" />
                            )}
                            {!showResult && isUserSelected && (
                              <div className="h-2 w-2 rounded-full bg-white" />
                            )}
                          </div>
                          <span className="font-medium">{option}</span>
                        </div>
                      </button>
                    );
                  })}

                {currentQuestion.type === 'true-false' && (
                  <div className="grid grid-cols-2 gap-4">
                    {['正确', '错误'].map((option, idx) => {
                      // 增强判断逻辑：支持索引比较、文本内容比较以及 True/False 兼容
                      const isCorrectAnswer =
                        String(idx) === String(currentQuestion.correctAnswer) ||
                        option === currentQuestion.correctAnswer ||
                        (idx === 0 &&
                          String(
                            currentQuestion.correctAnswer
                          ).toLowerCase() === 'true') ||
                        (idx === 1 &&
                          String(
                            currentQuestion.correctAnswer
                          ).toLowerCase() === 'false');

                      const isUserSelected =
                        String(idx) === String(selectedAnswer);
                      const userAnsweredCorrectly =
                        showResult &&
                        userAnswers.length > 0 &&
                        userAnswers[userAnswers.length - 1]?.isCorrect;

                      return (
                        <button
                          key={idx}
                          onClick={() => handleAnswerSelect(idx)}
                          disabled={showResult}
                          className={`${optionBaseClass} text-center ${
                            showResult
                              ? isCorrectAnswer
                                ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-300'
                                : isUserSelected && !userAnsweredCorrectly
                                  ? 'border-red-500 bg-red-500/10 text-red-500 dark:text-red-300'
                                  : 'border-border/70 text-muted-foreground bg-transparent'
                              : isUserSelected
                                ? 'border-primary bg-primary/10'
                                : ''
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            {showResult && isCorrectAnswer && (
                              <CheckCircle className="h-5 w-5 text-green-400" />
                            )}
                            {showResult &&
                              isUserSelected &&
                              !userAnsweredCorrectly && (
                                <XCircle className="h-5 w-5 text-red-400" />
                              )}
                            <span className="font-medium">{option}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.type === 'fill-blank' && (
                  <input
                    type="text"
                    value={selectedAnswer as string}
                    onChange={(e) => handleAnswerSelect(e.target.value)}
                    disabled={showResult}
                    placeholder="请输入答案..."
                    className={`bg-card/80 text-foreground w-full rounded-lg border p-4 transition-all duration-300 focus:outline-none dark:bg-gray-900/60 ${
                      showResult
                        ? selectedAnswer === currentQuestion.correctAnswer
                          ? 'border-green-500'
                          : 'border-red-500'
                        : 'border-border focus:border-primary'
                    }`}
                  />
                )}
              </div>

              {/* 提示 */}
              {!showResult &&
                currentQuestion.hints &&
                currentHints.length < currentQuestion.hints.length && (
                  <Button
                    onClick={handleShowHint}
                    variant="outline"
                    className="mb-4 border-yellow-500/30 text-yellow-400 hover:border-yellow-500/50 hover:bg-yellow-500/10"
                  >
                    <Lightbulb className="mr-2 h-4 w-4" />
                    显示提示 ({currentHints.length + 1}/
                    {currentQuestion.hints.length})
                  </Button>
                )}

              {currentHints.length > 0 && (
                <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                  <p className="text-yellow-200">
                    💡 提示: {currentHints[currentHints.length - 1]}
                  </p>
                </div>
              )}

              {/* 答案解析 */}
              {showResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mb-6 space-y-3"
                >
                  {/* 答案解析 */}
                  <div className="border-primary/30 bg-primary/10 rounded-lg border p-4">
                    <p className="text-primary mb-1 text-sm font-semibold">
                      📚 解析
                    </p>
                    <p className="text-primary/90">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-between">
                {!showResult ? (
                  <Button
                    onClick={handleSubmitAnswer}
                    disabled={selectedAnswer === ''}
                    className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 bg-gradient-to-r text-white"
                  >
                    提交答案
                  </Button>
                ) : (
                  <Button
                    onClick={handleNextQuestion}
                    className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 bg-gradient-to-r text-white"
                  >
                    {currentQuestionIndex < questions.length - 1
                      ? '下一题'
                      : '完成测验'}
                  </Button>
                )}

                {!showResult && (
                  <Button
                    onClick={handleNextQuestion}
                    variant="outline"
                    className="border-primary/30 text-primary/80 hover:border-primary/50"
                  >
                    跳过此题
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        </ScrollAnimation>

        {/* 生成测验表单 */}
        {showGenerateForm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm dark:bg-black/70"
            onClick={() => setShowGenerateForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={modalPanelClass}
            >
              <h3 className="text-foreground mb-6 text-2xl font-bold">
                生成 AI 测验
              </h3>
              {/* 文件上传入口：可以直接从课件 / 笔记文件生成测验 */}
              <div className="mb-4 flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  id="quiz-file-input"
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
                    htmlFor="quiz-file-input"
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
                <span className="text-muted-foreground text-xs">
                  也可以直接在下方粘贴或编辑要生成测验的内容
                </span>
              </div>

              {fileInfo && (
                <div className="border-primary/30 bg-primary/5 text-primary/80 mb-3 flex items-start gap-2 rounded-lg border p-2 text-xs">
                  <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{fileInfo}</span>
                </div>
              )}

              <div className="mb-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-foreground mb-3 block font-medium">
                    测验题目数量
                  </label>
                  <select
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="border-border bg-card/80 text-foreground focus:border-primary w-full rounded-lg border p-3 focus:outline-none dark:border-gray-700 dark:bg-gray-900/60"
                  >
                    <option value={3}>3 题</option>
                    <option value={5}>5 题</option>
                    <option value={10}>10 题</option>
                    <option value={15}>15 题</option>
                  </select>
                </div>
                <div>
                  <label className="text-foreground mb-3 block font-medium">
                    预计用时（分钟）
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={expectedTime}
                    onChange={(e) =>
                      setExpectedTime(
                        Number.isNaN(Number(e.target.value))
                          ? 10
                          : Number(e.target.value)
                      )
                    }
                    className="border-border bg-card/80 text-foreground focus:border-primary w-full rounded-lg border p-3 focus:outline-none dark:border-gray-700 dark:bg-gray-900/60"
                  />
                </div>
              </div>

              {/* 题型选择 */}
              <div className="mb-6">
                <label className="text-foreground mb-3 block font-medium">
                  题型选择
                </label>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setSelectedQuestionTypes(['all'])}
                    className={`rounded-lg border p-3 transition-all ${
                      selectedQuestionTypes.includes('all')
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/70 bg-muted/60 text-foreground/70 hover:border-primary/60 hover:bg-primary/5 transition-all dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200'
                    }`}
                  >
                    全部题型
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const types = selectedQuestionTypes.filter(
                        (t) => t !== 'all'
                      );
                      if (types.includes('multiple-choice')) {
                        const newTypes = types.filter(
                          (t) => t !== 'multiple-choice'
                        );
                        setSelectedQuestionTypes(
                          newTypes.length > 0 ? newTypes : ['all']
                        );
                      } else {
                        setSelectedQuestionTypes([...types, 'multiple-choice']);
                      }
                    }}
                    className={`rounded-lg border p-3 transition-all ${
                      selectedQuestionTypes.includes('multiple-choice')
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/70 bg-muted/60 text-foreground/70 hover:border-primary/60 hover:bg-primary/5 transition-all dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200'
                    }`}
                  >
                    选择题
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const types = selectedQuestionTypes.filter(
                        (t) => t !== 'all'
                      );
                      if (types.includes('true-false')) {
                        const newTypes = types.filter(
                          (t) => t !== 'true-false'
                        );
                        setSelectedQuestionTypes(
                          newTypes.length > 0 ? newTypes : ['all']
                        );
                      } else {
                        setSelectedQuestionTypes([...types, 'true-false']);
                      }
                    }}
                    className={`rounded-lg border p-3 transition-all ${
                      selectedQuestionTypes.includes('true-false')
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/70 bg-muted/60 text-foreground/70 hover:border-primary/60 hover:bg-primary/5 transition-all dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200'
                    }`}
                  >
                    判断题
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const types = selectedQuestionTypes.filter(
                        (t) => t !== 'all'
                      );
                      if (types.includes('fill-blank')) {
                        const newTypes = types.filter(
                          (t) => t !== 'fill-blank'
                        );
                        setSelectedQuestionTypes(
                          newTypes.length > 0 ? newTypes : ['all']
                        );
                      } else {
                        setSelectedQuestionTypes([...types, 'fill-blank']);
                      }
                    }}
                    className={`rounded-lg border p-3 transition-all ${
                      selectedQuestionTypes.includes('fill-blank')
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/70 bg-muted/60 text-foreground/70 hover:border-primary/60 hover:bg-primary/5 transition-all dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200'
                    }`}
                  >
                    填空题
                  </button>
                </div>
              </div>
              <textarea
                value={quizContent}
                onChange={(e) => setQuizContent(e.target.value)}
                placeholder="粘贴您的学习笔记、课程内容或任何想要转换为测验的文本..."
                className="border-border bg-card/80 text-foreground placeholder-muted-foreground focus:border-primary mb-4 h-48 w-full resize-none rounded-lg border p-4 focus:outline-none dark:border-gray-700 dark:bg-gray-900/60"
              />
              {generationError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-sm text-red-400">{generationError}</p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  onClick={() => {
                    setShowGenerateForm(false);
                    setGenerationError('');
                    setQuizContent('');
                  }}
                  variant="outline"
                  className="border-border text-foreground/70 hover:border-foreground/60"
                >
                  取消
                </Button>
                <Button
                  onClick={handleGenerateQuiz}
                  disabled={isGenerating}
                  className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 bg-gradient-to-r text-white"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      AI 正在生成...
                    </>
                  ) : (
                    <>
                      <Brain className="mr-2 h-4 w-4" />
                      生成测验
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

export default QuizApp;
