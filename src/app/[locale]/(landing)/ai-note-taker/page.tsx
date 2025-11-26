'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Download,
  FileAudio,
  FileText,
  FileVideo,
  Loader2,
  Mic,
  Share2,
  Upload,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import {
  detectLearningFileType,
  readLearningFileContent,
} from '@/shared/lib/file-reader';
import { OpenRouterService } from '@/shared/services/openrouter';

const AINoteTaker = () => {
  const t = useTranslations('ai-note-taker');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedNotes, setGeneratedNotes] = useState('');
  const [activeTab, setActiveTab] = useState('upload');
  // 用于拿到隐藏的文件输入框 DOM 节点
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setIsProcessing(true);
      setError('');

      try {
        // 读取文件内容（支持 txt / pdf / docx 等）
        const fileContent = await readLearningFileContent(file);

        // 调用 AI API 生成笔记
        const aiService = OpenRouterService.getInstance();
        const result = await aiService.generateNotes({
          content: fileContent,
          // 使用统一的文件类型检测，便于后续统计或扩展
          type: detectLearningFileType(file.type),
          fileName: file.name,
        });

        if (result.success) {
          // 成功：保存生成的笔记内容，并自动切换到“笔记”标签页
          setGeneratedNotes(result.notes);
          setActiveTab('notes');
        } else {
          // 失败：保存错误信息，并同样切到“笔记”标签页，让用户能立刻看到错误原因
          // 结合 OpenRouterService.generateNotes 中的修改，这里会展示更具体的错误提示
          setError(result.error || t('errors.generation_failed'));
          setActiveTab('notes');
        }
      } catch (error) {
        console.error('Error processing file:', error);
        setError(t('errors.processing_failed'));
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // getFileType 已由 detectLearningFileType 替代，无需在本组件重复实现

  const [error, setError] = useState('');

  const tabs = [
    { id: 'upload', label: t('tabs.upload'), icon: Upload },
    { id: 'record', label: t('tabs.record'), icon: Mic },
    { id: 'notes', label: t('tabs.notes'), icon: Brain },
  ];

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

        {/* 功能标签页 */}
        <ScrollAnimation delay={0.2}>
          <div className="mx-auto max-w-4xl">
            <div className="mb-8 flex justify-center">
              <div className="inline-flex rounded-lg border border-purple-500/20 bg-gray-900/50 p-1 backdrop-blur-sm">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 rounded-md px-6 py-3 transition-all duration-300 ${
                        activeTab === tab.id
                          ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                          : 'text-gray-400 hover:bg-purple-500/10 hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 上传区域 */}
            {activeTab === 'upload' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="rounded-2xl border border-purple-500/20 bg-gray-900/50 p-8 backdrop-blur-sm"
              >
                <div className="text-center">
                  <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600">
                    <Upload className="h-12 w-12 text-white" />
                  </div>

                  <h3 className="mb-4 text-2xl font-bold text-white">
                    {t('upload.title')}
                  </h3>
                  <p className="mb-8 text-gray-400">{t('upload.subtitle')}</p>

                  {/* 
                    非程序员解释：
                    - 浏览器出于安全原因，有时不允许用 JS 直接“点”隐藏的 <input type="file">
                    - 更稳妥的方式是：用 <label htmlFor="..."> 绑定到 input 上
                    - 用户点按钮本质上是在点 label，浏览器就会乖乖弹出“选择文件”的对话框
                  */}
                  <input
                    id="ai-note-file-input"
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,video/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  {/* 使用 Button 作为外壳，把 label 当作子元素渲染（asChild） */}
                  <Button
                    asChild
                    className="bg-gradient-to-r from-purple-600 to-blue-600 px-8 py-4 text-lg text-white hover:from-purple-700 hover:to-blue-700"
                    disabled={isProcessing}
                  >
                    <label
                      htmlFor="ai-note-file-input"
                      className="flex cursor-pointer items-center"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          {t('upload.processing')}
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-5 w-5" />
                          {t('upload.upload_button')}
                        </>
                      )}
                    </label>
                  </Button>

                  {/* 支持的文件类型 */}
                  <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
                    {[
                      {
                        icon: FileAudio,
                        label: t('upload.audio_files'),
                        desc: 'MP3, WAV, M4A',
                      },
                      {
                        icon: FileVideo,
                        label: t('upload.video_files'),
                        desc: 'MP4, MOV, AVI',
                      },
                      {
                        icon: FileText,
                        label: t('upload.pdf_docs'),
                        desc: t('upload.pdf_desc'),
                      },
                      {
                        icon: FileText,
                        label: t('upload.text_docs'),
                        desc: 'DOC, TXT, MD',
                      },
                    ].map((type, idx) => {
                      const Icon = type.icon;
                      return (
                        <div key={idx} className="text-center">
                          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10">
                            <Icon className="h-6 w-6 text-purple-400" />
                          </div>
                          <p className="font-medium text-white">{type.label}</p>
                          <p className="text-sm text-gray-500">{type.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* 录音区域 */}
            {activeTab === 'record' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="rounded-2xl border border-purple-500/20 bg-gray-900/50 p-8 backdrop-blur-sm"
              >
                <div className="text-center">
                  <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600">
                    <Mic className="h-12 w-12 text-white" />
                  </div>

                  <h3 className="mb-4 text-2xl font-bold text-white">
                    {t('record.title')}
                  </h3>
                  <p className="mb-8 text-gray-400">{t('record.subtitle')}</p>

                  <Button className="bg-gradient-to-r from-purple-600 to-blue-600 px-8 py-4 text-lg text-white hover:from-purple-700 hover:to-blue-700">
                    <Mic className="mr-2 h-5 w-5" />
                    {t('record.start_button')}
                  </Button>

                  <div className="mt-8 text-sm text-gray-500">
                    <p>支持最长60分钟的连续录音</p>
                    <p>自动降噪和语音识别优化</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 生成的笔记区域 */}
            {activeTab === 'notes' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="rounded-2xl border border-purple-500/20 bg-gray-900/50 p-8 backdrop-blur-sm"
              >
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-white">
                    {t('notes.title')}
                  </h3>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-purple-500/30 text-purple-300 hover:border-purple-500/50"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t('notes.download')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-purple-500/30 text-purple-300 hover:border-purple-500/50"
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      {t('notes.share')}
                    </Button>
                  </div>
                </div>

                {error ? (
                  <div className="py-12 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                      <Zap className="h-8 w-8 text-red-400" />
                    </div>
                    <p className="mb-4 text-red-400">{error}</p>
                    <Button
                      onClick={() => setError('')}
                      variant="outline"
                      className="border-red-500/30 text-red-300 hover:border-red-500/50"
                    >
                      {t('retry')}
                    </Button>
                  </div>
                ) : generatedNotes ? (
                  <div className="prose prose-invert max-w-none">
                    <div className="rounded-lg bg-gray-800/50 p-6 leading-relaxed text-gray-300">
                      {generatedNotes.split('\n').map((line, idx) => (
                        <div
                          key={idx}
                          className={
                            line.startsWith('#')
                              ? 'mb-4 font-bold text-white'
                              : 'mb-2'
                          }
                        >
                          {line.startsWith('##') ? (
                            <h2 className="mt-6 mb-3 text-xl font-semibold text-purple-400">
                              {line.replace('##', '')}
                            </h2>
                          ) : line.startsWith('###') ? (
                            <h3 className="mt-4 mb-2 text-lg font-medium text-blue-400">
                              {line.replace('###', '')}
                            </h3>
                          ) : line.startsWith('-') ? (
                            <li className="ml-4">
                              {line.replace('-', '').trim()}
                            </li>
                          ) : line.match(/^\d+\./) ? (
                            <li className="ml-4 list-decimal">{line}</li>
                          ) : (
                            line && <p>{line}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Brain className="mx-auto mb-4 h-16 w-16 text-gray-600" />
                    <p className="text-gray-500">{t('notes.no_notes')}</p>
                  </div>
                )}

                {/* AI工具栏 */}
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-purple-500/30 text-purple-300"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    {t('toolbar.generate_flashcards')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-purple-500/30 text-purple-300"
                  >
                    <Brain className="mr-2 h-4 w-4" />
                    {t('toolbar.create_quiz')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-purple-500/30 text-purple-300"
                  >
                    <FileAudio className="mr-2 h-4 w-4" />
                    {t('toolbar.generate_podcast')}
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollAnimation>
      </div>
    </div>
  );
};

export default AINoteTaker;
