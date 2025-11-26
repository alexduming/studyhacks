'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Loader2, FileText, BookOpen, Lightbulb } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// PDF文件图标组件
const PdfFileIcon = ({ className = "" }: { className?: string }) => (
  <div className={cn("relative", className)}>
    <div className="w-16 h-20 bg-red-500 rounded-sm shadow-lg border border-red-600 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-red-400 to-red-600 opacity-90"></div>
      <div className="absolute top-1 left-0 right-0 h-1 bg-red-300"></div>
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-red-700"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-white font-bold text-xs">PDF</span>
      </div>
      <div className="absolute top-0 right-0 w-0 h-0 border-t-8 border-t-transparent border-l-8 border-l-red-400 border-r-8 border-r-red-600"></div>
    </div>
  </div>
);

interface AnalysisData {
  title: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
}

const mockAnalysisData: AnalysisData = {
  title: '📚 Lecture 5: Cellular Biology',
  summary: 'The cell theory is one of the fundamental principles of biology. It states that:',
  keyPoints: [
    'All living organisms are composed of one or more cells',
    'The cell is the basic unit of life',
    'All cells arise from pre-existing cells',
    'Eukaryotic cells contain specialized structures called organelles',
    'The cell membrane regulates what enters and exits the cell'
  ],
  topics: ['Biology', 'Cell Structure', 'Molecular Biology', 'Organelles']
};

const createFadeInVariant = (delay: number) => ({
  initial: {
    opacity: 0,
    y: 20,
    filter: 'blur(6px)',
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
  },
  transition: {
    duration: 1.5, // 原来的0.6 * 2.5 = 1.5
    delay: delay * 2.5, // 整体放慢2.5倍
    ease: [0.22, 1, 0.36, 1] as const,
  },
});

type DemoState = 'idle' | 'dragging' | 'analyzing' | 'completed';

export function PdfDemo() {
  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);

  const stateMessages = {
    analyzing: 'Analyzing with AI...',
  };

  const startDemo = async () => {
    // 1. 拖入PDF文件动画
    setDemoState('dragging');

    await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒拖入动画

    // 2. 分析阶段
    setDemoState('analyzing');
    setProgress(0);
    setMessage(stateMessages.analyzing);

    // Simulate analysis progress
    for (let i = 0; i <= 100; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 80));
      setProgress(i);
    }

    // 3. 完成
    setDemoState('completed');
    setMessage('Analysis completed!');

    // 5秒后自动重新开始
    setTimeout(() => resetDemo(), 5000);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (demoState === 'idle') {
      startDemo();
    }
  };

  const handleClick = () => {
    if (demoState === 'idle') {
      startDemo();
    }
  };

  const resetDemo = () => {
    setDemoState('idle');
    setProgress(0);
    setMessage('');
    setAnimationKey(prev => prev + 1);
    // 自动重新开始
    setTimeout(() => startDemo(), 1000);
  };

  useEffect(() => {
    // Auto-start demo after a delay
    const timer = setTimeout(() => {
      if (demoState === 'idle') {
        startDemo();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl backdrop-blur-md border border-white/10 shadow-[0_0_40px_-10px_rgba(104,35,255,0.4)] p-4 md:p-6 w-full h-[450px] flex items-center justify-center" style={{background:'linear-gradient(135deg, rgba(104, 35, 255, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%)'}}>
      <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/8"></span>

      <div className="w-full h-[400px] relative flex items-center justify-center">
        <AnimatePresence mode="wait">
          {demoState === 'completed' ? (
            <motion.div
              key="completed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              <div dir="ltr" className="relative overflow-hidden w-full h-full" style={{ position: 'relative' } as React.CSSProperties}>
                <style>{`[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}`}</style>
                <div data-radix-scroll-area-viewport="" className="h-full w-full rounded-[inherit]" style={{ overflow: 'hidden scroll' }}>
                  <div style={{ minWidth: '100%', display: 'table' }}>
                    <div className="px-2" style={{ opacity: 1 }}>
                      <div className="space-y-2 text-left pb-2">
                        <motion.div {...createFadeInVariant(0.1)}>
                          <div className="flex items-center gap-2 mb-2">
                            <BookOpen className="w-4 h-4 text-purple-400" />
                            <span className="text-lg font-bold text-white">{mockAnalysisData.title}</span>
                          </div>
                        </motion.div>

                        <motion.div {...createFadeInVariant(0.2)}>
                          <span className="text-xs text-gray-300 leading-relaxed">{mockAnalysisData.summary}</span>
                        </motion.div>

                        {mockAnalysisData.keyPoints.slice(0, 3).map((point, index) => (
                          <motion.div
                            key={index}
                            {...createFadeInVariant(0.3 + index * 0.1)}
                          >
                            <div className="text-xs text-gray-200 pl-3 flex items-start gap-2">
                              <span className="text-purple-400 mt-0.5 flex-shrink-0">•</span>
                              <span>{point}</span>
                            </div>
                          </motion.div>
                        ))}

                        <motion.div {...createFadeInVariant(0.6)}>
                          <span className="text-base font-semibold text-white mt-3 mb-1">🧬 Types of Cells</span>
                        </motion.div>

                        <motion.div {...createFadeInVariant(0.7)}>
                          <div className="flex gap-4 justify-center my-3">
                            <div className="flex flex-col items-center gap-1">
                              <div className="relative w-[120px] h-[90px]">
                                <img alt="Prokaryotic Cell" loading="lazy" decoding="async" data-nimg="fill" className="object-contain rounded-lg bg-white/5 p-2" src="https://assets.api-turbo.ai/website/prokaryote_cell.svg" style={{ position: 'absolute', height: '100%', width: '100%', inset: '0px', color: 'transparent' }} />
                              </div>
                              <span className="text-[11px] text-gray-400">Prokaryotic Cell</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <div className="relative w-[120px] h-[90px]">
                                <img alt="Eukaryotic Cell" loading="lazy" decoding="async" data-nimg="fill" className="object-contain rounded-lg bg-white/5 p-2" sizes="120px" srcSet="/_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=32&q=75 32w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=48&q=75 48w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=64&q=75 64w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=96&q=75 96w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=128&q=75 128w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=256&q=75 256w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=384&q=75 384w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=640&q=75 640w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=750&q=75 750w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=828&q=75 828w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=1080&q=75 1080w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=1200&q=75 1200w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=1920&q=75 1920w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=2048&q=75 2048w, /_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=3840&q=75 3840w" src="/_next/image?url=https%3A%2F%2Fassets.api-turbo.ai%2Fwebsite%2Feukaryote.png&w=3840&q=75" style={{ position: 'absolute', height: '100%', width: '100%', inset: '0px', color: 'transparent' }} />
                              </div>
                              <span className="text-[11px] text-gray-400">Eukaryotic Cell</span>
                            </div>
                          </div>
                        </motion.div>

                        <motion.div {...createFadeInVariant(0.8)}>
                          <div className="my-3 rounded-lg border border-white/10 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-purple-500/10">
                                  <th className="px-3 py-2 text-left text-purple-300 font-medium border-r border-white/10">Feature</th>
                                  <th className="px-3 py-2 text-left text-purple-300 font-medium border-r border-white/10">Prokaryotic</th>
                                  <th className="px-3 py-2 text-left text-purple-300 font-medium">Eukaryotic</th>
                                </tr>
                              </thead>
                              <tbody className="text-gray-300">
                                <tr className="border-t border-white/5">
                                  <td className="px-3 py-1.5 text-gray-400 border-r border-white/10">Nucleus</td>
                                  <td className="px-3 py-1.5 border-r border-white/10">No membrane-bound nucleus</td>
                                  <td className="px-3 py-1.5">Membrane-bound nucleus</td>
                                </tr>
                                <tr className="border-t border-white/5">
                                  <td className="px-3 py-1.5 text-gray-400 border-r border-white/10">Size</td>
                                  <td className="px-3 py-1.5 border-r border-white/10">1-10 μm</td>
                                  <td className="px-3 py-1.5">10-100 μm</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </motion.div>

                        <motion.div {...createFadeInVariant(1.0)}>
                          <div className="border-t border-white/10 my-2"></div>
                        </motion.div>

                        <motion.div {...createFadeInVariant(1.1)}>
                          <div className="flex items-center gap-2 mt-3 mb-1">
                            <Lightbulb className="w-3 h-3 text-purple-400" />
                            <span className="text-base font-semibold text-white">💡 Key Insight</span>
                          </div>
                        </motion.div>

                        <motion.div {...createFadeInVariant(1.2)}>
                          <span className="text-xs bg-purple-500/10 border-l-2 border-purple-400 pl-2 py-1 text-purple-200 font-medium block">
                            AI Analysis: This document contains important biological concepts about cellular structure and function.
                          </span>
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              </motion.div>
          ) : (
            <motion.div
              key={`${demoState}-${animationKey}`}
              className="w-full h-full relative overflow-hidden"
            >
              {/* PDF文件拖入动画 */}
              {demoState === 'dragging' && (
                <motion.div
                  initial={{
                    x: -200,
                    y: -200,
                    scale: 0.8,
                    rotate: -15
                  }}
                  animate={{
                    x: 0,
                    y: 0,
                    scale: 1.2,
                    rotate: 0,
                  }}
                  transition={{
                    duration: 2.0, // 放慢动画速度
                    ease: [0.25, 0.1, 0.25, 1.0]
                  }}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20"
                >
                  <PdfFileIcon />
                </motion.div>
              )}

              {/* 上传区域 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full h-full flex flex-col items-center justify-center p-6"
              >
                <div
                  className={cn(
                    'w-full max-w-md relative border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer',
                    isDragging ? 'border-purple-400 bg-purple-50/10' : 'border-gray-300 hover:border-gray-400',
                    demoState !== 'idle' && 'pointer-events-none opacity-50'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={handleClick}
                >
                  <AnimatePresence mode="wait">
                    {demoState === 'idle' ? (
                      <motion.div
                        key="upload"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex flex-col items-center space-y-4"
                      >
                        <Upload className="w-12 h-12 text-gray-400" />
                        <div>
                          <p className="text-lg font-medium text-white">Drop your PDF file</p>
                          <p className="text-sm text-gray-400 mt-1">
                            Auto-starts in 2 seconds
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <FileText className="w-3 h-3" />
                          <span>PDF files only</span>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="progress"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                      >
                        <div className="flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                        </div>
                        <p className="text-sm font-medium text-white">{message}</p>
                        <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                            style={{ width: `${progress}%` }}
                            initial={{ width: '0%' }}
                            animate={{ width: `${progress}%` }}
                            transition={{
                              duration: 0.6, // 放慢进度条动画
                              ease: "easeOut"
                            }}
                          />
                        </div>
                        <p className="text-xs text-gray-400">{Math.round(progress)}% complete</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {demoState === 'idle' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mt-4 text-center"
                  >
                    <p className="text-xs text-gray-400">
                      Watch the complete AI analysis workflow
                    </p>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}