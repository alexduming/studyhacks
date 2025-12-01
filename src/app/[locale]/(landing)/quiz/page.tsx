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

import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { readLearningFileContent } from '@/shared/lib/file-reader';
import {
  OpenRouterService,
  type QuizQuestion as AIQuizQuestion,
} from '@/shared/services/openrouter';

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
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: 1,
      type: 'multiple-choice',
      question: '机器学习中的过拟合是指什么？',
      options: [
        '模型在训练数据上表现很好，但在新数据上表现较差',
        '模型在训练数据和新数据上都表现很好',
        '模型在训练数据上表现较差，但在新数据上表现很好',
        '模型在训练数据和新数据上都表现较差',
      ],
      correctAnswer: 0,
      explanation:
        '过拟合是指模型过于复杂，过度适应了训练数据的噪声和特征，导致在新的、未见过的数据上表现不佳。',
      difficulty: 'medium',
      topic: '机器学习基础',
      hints: ['考虑模型在不同数据集上的表现差异', '训练误差和测试误差的对比'],
    },
    {
      id: 2,
      type: 'true-false',
      question: '深度学习必须使用GPU才能运行。',
      correctAnswer: 1, // false
      explanation:
        '虽然GPU能显著加速深度学习训练，但并不是必需的。深度学习模型也可以在CPU上运行，只是速度较慢。',
      difficulty: 'easy',
      topic: '深度学习硬件',
      hints: ['考虑CPU和GPU的作用差异'],
    },
    {
      id: 3,
      type: 'fill-blank',
      question: '在监督学习中，我们通常将数据集分为训练集、______和测试集。',
      correctAnswer: '验证集',
      explanation:
        '验证集用于调整模型的超参数和评估模型性能，测试集用于最终评估模型的泛化能力。',
      difficulty: 'easy',
      topic: '数据集划分',
      hints: ['思考模型训练过程中需要哪些数据集'],
    },
  ]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [quizContent, setQuizContent] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  // 预计用时（分钟），仅用于展示给用户看的“计划用时”
  const [expectedTime, setExpectedTime] = useState(10);
  // 文件上传相关状态：用于“从文件生成测验”
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
      const aiService = OpenRouterService.getInstance();
      const result = await aiService.generateQuiz(quizContent, questionCount);

      if (result.success && result.questions.length > 0) {
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
      } else {
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
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;
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
        return 'text-gray-400';
    }
  };

  if (!quizStarted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-950 via-primary/5 to-gray-950">
        <div className="relative z-10 container mx-auto px-4">
          <ScrollAnimation>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mx-auto max-w-2xl text-center"
            >
              {/* 顶部图标区域：统一为 primary 深浅渐变，贴合 turbo 主色 */}
              <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70">
                <Brain className="h-12 w-12 text-white" />
              </div>

              {/* 标题渐变调整为白色 → primary，整体色调与 Hero 保持一致 */}
              <h1 className="mb-6 bg-gradient-to-r from-white via-primary/80 to-primary/60 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {t('title')}
              </h1>
              <p className="mb-8 text-lg text-gray-300">{t('subtitle')}</p>

              <div className="mb-8 rounded-2xl border border-primary/20 bg-gray-900/50 p-8 backdrop-blur-sm">
                <h3 className="mb-6 text-xl font-semibold text-white">
                  测验信息
                </h3>
                <div className="grid gap-6 text-left md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-gray-400">
                      {t('stats.total_questions')}
                    </p>
                    <p className="text-lg font-medium text-white">
                      {questionCount} 题
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-gray-400">
                      {t('stats.time_spent')}
                    </p>
                    <p className="text-lg font-medium text-white">
                      {expectedTime} 分钟
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-gray-400">
                      {t('question.multiple_choice')},{' '}
                      {t('question.true_false')}, {t('question.fill_blank')}
                    </p>
                    <p className="text-lg font-medium text-white"></p>
                  </div>
                  <div>
                    <p className="mb-2 text-gray-400">智能提示</p>
                    <p className="text-lg font-medium text-white">
                      每题提供学习提示
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-4">
                <Button
                  onClick={() => setShowGenerateForm(true)}
                  variant="outline"
                  className="border-primary/30 px-8 py-4 text-lg text-primary/80 hover:border-primary/50"
                >
                  <Brain className="mr-2 h-5 w-5" />
                  {t('create.generate')}
                </Button>
                <Button
                  onClick={handleStartQuiz}
                  className="bg-gradient-to-r from-primary to-primary/70 px-8 py-4 text-lg text-white hover:from-primary/90 hover:to-primary/80"
                >
                  {t('actions.start_quiz')}
                </Button>
              </div>
            </motion.div>
          </ScrollAnimation>
        </div>
      </div>
    );
  }

  if (quizCompleted) {
    const score = calculateScore();

    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-950 via-primary/5 to-gray-950">
        <div className="relative z-10 container mx-auto px-4">
          <ScrollAnimation>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mx-auto max-w-2xl text-center"
            >
              <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70">
                <Trophy className="h-12 w-12 text-white" />
              </div>

              <h1 className="mb-6 bg-gradient-to-r from-white via-primary/80 to-primary/60 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {t('results.title')}
              </h1>

              <div className="mb-8 rounded-2xl border border-primary/20 bg-gray-900/50 p-8 backdrop-blur-sm">
                <div className="mb-8 text-center">
                  <div className="mb-2 text-6xl font-bold text-white">
                    {score.percentage}%
                  </div>
                  <p className="text-gray-400">您的得分</p>
                </div>

                <div className="mb-8 grid gap-6 md:grid-cols-3">
                  <div>
                    <p className="mb-2 text-gray-400">正确答案</p>
                    <p className="text-xl font-medium text-green-400">
                      {score.correct}/{score.total}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-gray-400">平均用时</p>
                    <p className="text-xl font-medium text-primary">
                      {score.averageTime}秒
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-gray-400">使用提示</p>
                    <p className="text-xl font-medium text-yellow-400">
                      {score.totalHintsUsed}次
                    </p>
                  </div>
                </div>

                {/* 详细答案 */}
                <div className="space-y-4 text-left">
                  <h3 className="mb-4 text-lg font-semibold text-white">
                    答题详情
                  </h3>
                  {userAnswers.map((answer, idx) => {
                    const question = questions.find(
                      (q) => q.id === answer.questionId
                    );
                    return (
                      <div key={idx} className="rounded-lg bg-gray-800/50 p-4">
                        <div className="flex items-start gap-3">
                          {answer.isCorrect ? (
                            <CheckCircle className="mt-1 h-5 w-5 flex-shrink-0 text-green-400" />
                          ) : (
                            <XCircle className="mt-1 h-5 w-5 flex-shrink-0 text-red-400" />
                          )}
                          <div className="flex-1">
                            <p className="font-medium text-white">
                              {question?.question}
                            </p>
                            {!answer.isCorrect && (
                              <p className="mt-1 text-sm text-gray-400">
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
                  className="bg-gradient-to-r from-primary to-primary/70 text-white hover:from-primary/90 hover:to-primary/80"
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
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-primary/5 to-gray-950">
      {/* 背景装饰：统一为 primary 色系的柔和光晕，避免额外蓝色块破坏整体主题 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-24">
        {/* 进度条 */}
        <div className="mx-auto mb-8 max-w-4xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-gray-400">
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
          <div className="h-2 w-full rounded-full bg-gray-700">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300"
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
              className="rounded-2xl border border-primary/20 bg-gray-900/50 p-8 backdrop-blur-sm"
            >
              {/* 题目 */}
              <div className="mb-8">
                <div className="mb-4 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <span className="text-sm text-primary">
                    {currentQuestion.topic}
                  </span>
                </div>
                <h2 className="mb-2 text-2xl font-bold text-white">
                  {currentQuestion.question}
                </h2>
              </div>

              {/* 答案选项 */}
              <div className="mb-8 space-y-3">
                {currentQuestion.type === 'multiple-choice' &&
                  currentQuestion.options?.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAnswerSelect(idx)}
                      disabled={showResult}
                      className={`w-full rounded-lg border p-4 text-left transition-all duration-300 ${
                        showResult
                          ? idx === currentQuestion.correctAnswer
                            ? 'border-green-500 bg-green-500/10'
                            : idx === selectedAnswer &&
                                selectedAnswer !== currentQuestion.correctAnswer
                              ? 'border-red-500 bg-red-500/10'
                              : 'border-gray-600 bg-gray-800/50'
                          : selectedAnswer === idx
                            ? 'border-primary bg-primary/10'
                            : 'border-gray-600 bg-gray-800/50 hover:border-primary/50 hover:bg-primary/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                            showResult
                              ? idx === currentQuestion.correctAnswer
                                ? 'border-green-500 bg-green-500'
                                : idx === selectedAnswer &&
                                    selectedAnswer !==
                                      currentQuestion.correctAnswer
                                  ? 'border-red-500 bg-red-500'
                                  : 'border-gray-500'
                              : selectedAnswer === idx
                                ? 'border-primary bg-primary'
                                : 'border-gray-500'
                          }`}
                        >
                          {showResult &&
                            idx === currentQuestion.correctAnswer && (
                              <CheckCircle className="h-4 w-4 text-white" />
                            )}
                          {showResult &&
                            idx === selectedAnswer &&
                            selectedAnswer !==
                              currentQuestion.correctAnswer && (
                              <XCircle className="h-4 w-4 text-white" />
                            )}
                          {!showResult && selectedAnswer === idx && (
                            <div className="h-2 w-2 rounded-full bg-white" />
                          )}
                        </div>
                        <span
                          className={
                            showResult && idx === currentQuestion.correctAnswer
                              ? 'text-green-400'
                              : 'text-white'
                          }
                        >
                          {option}
                        </span>
                      </div>
                    </button>
                  ))}

                {currentQuestion.type === 'true-false' && (
                  <div className="grid grid-cols-2 gap-4">
                    {['正确', '错误'].map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAnswerSelect(idx)}
                        disabled={showResult}
                        className={`rounded-lg border p-4 transition-all duration-300 ${
                          showResult
                            ? idx === currentQuestion.correctAnswer
                              ? 'border-green-500 bg-green-500/10'
                              : idx === selectedAnswer &&
                                  selectedAnswer !==
                                    currentQuestion.correctAnswer
                                ? 'border-red-500 bg-red-500/10'
                                : 'border-gray-600 bg-gray-800/50'
                            : selectedAnswer === idx
                              ? 'border-primary bg-primary/10'
                              : 'border-gray-600 bg-gray-800/50 hover:border-primary/50 hover:bg-primary/5'
                        }`}
                      >
                        <span
                          className={
                            showResult && idx === currentQuestion.correctAnswer
                              ? 'text-green-400'
                              : 'text-white'
                          }
                        >
                          {option}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {currentQuestion.type === 'fill-blank' && (
                  <input
                    type="text"
                    value={selectedAnswer as string}
                    onChange={(e) => handleAnswerSelect(e.target.value)}
                    disabled={showResult}
                    placeholder="请输入答案..."
                    className={`w-full rounded-lg border bg-gray-800/50 p-4 transition-all duration-300 ${
                      showResult
                        ? selectedAnswer === currentQuestion.correctAnswer
                          ? 'border-green-500'
                          : 'border-red-500'
                        : 'border-gray-600 focus:border-primary'
                    } text-white`}
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
                  className="mb-6 rounded-lg border border-primary/30 bg-primary/10 p-4"
                >
                  <p className="text-primary">
                    📚 解析: {currentQuestion.explanation}
                  </p>
                </motion.div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-between">
                {!showResult ? (
                  <Button
                    onClick={handleSubmitAnswer}
                    disabled={selectedAnswer === ''}
                    className="bg-gradient-to-r from-primary to-primary/70 text-white hover:from-primary/90 hover:to-primary/80"
                  >
                    提交答案
                  </Button>
                ) : (
                  <Button
                    onClick={handleNextQuestion}
                    className="bg-gradient-to-r from-primary to-primary/70 text-white hover:from-primary/90 hover:to-primary/80"
                  >
                    {currentQuestionIndex < questions.length - 1
                      ? '下一题'
                      : '完成测验'}
                  </Button>
                )}

                {!showResult && (
                  <Button
                    onClick={() => setShowExplanation(true)}
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setShowGenerateForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-primary/20 bg-gray-900 p-8"
            >
              <h3 className="mb-6 text-2xl font-bold text-white">
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
                <span className="text-xs text-gray-400">
                  也可以直接在下方粘贴或编辑要生成测验的内容
                </span>
              </div>

              {fileInfo && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs text-primary/80">
                  <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{fileInfo}</span>
                </div>
              )}

              <div className="mb-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-3 block font-medium text-white">
                    测验题目数量
                  </label>
                  <select
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-600 bg-gray-800/50 p-3 text-white focus:border-primary focus:outline-none"
                  >
                    <option value={3}>3 题</option>
                    <option value={5}>5 题</option>
                    <option value={10}>10 题</option>
                    <option value={15}>15 题</option>
                  </select>
                </div>
                <div>
                  <label className="mb-3 block font-medium text-white">
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
                    className="w-full rounded-lg border border-gray-600 bg-gray-800/50 p-3 text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
              <textarea
                value={quizContent}
                onChange={(e) => setQuizContent(e.target.value)}
                placeholder="粘贴您的学习笔记、课程内容或任何想要转换为测验的文本..."
                className="mb-4 h-48 w-full resize-none rounded-lg border border-gray-600 bg-gray-800/50 p-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none"
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
                  className="border-gray-600 text-gray-300 hover:border-gray-500"
                >
                  取消
                </Button>
                <Button
                  onClick={handleGenerateQuiz}
                  disabled={isGenerating}
                  className="bg-gradient-to-r from-primary to-primary/70 text-white hover:from-primary/90 hover:to-primary/80"
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
