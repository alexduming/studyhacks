'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Lightbulb, Target, Hash } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface AnalysisData {
  title: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  content: string;
}

interface PdfAnalysisDisplayProps {
  data: AnalysisData;
  className?: string;
}

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
    duration: 0.6,
    delay,
    ease: [0.22, 1, 0.36, 1] as const,
  },
});

export function PdfAnalysisDisplay({ data, className }: PdfAnalysisDisplayProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className={cn('w-full h-full flex items-center justify-center', className)}>
      <div className="w-full h-full" style={{ opacity: isVisible ? 1 : 0 }}>
        <div
          dir="ltr"
          className="relative overflow-hidden w-full h-full"
          style={{
            position: 'relative',
            '--radix-scroll-area-corner-width': '0px',
            '--radix-scroll-area-corner-height': '0px',
          }}
        >
          <style>{`[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}`}</style>
          <div
            data-radix-scroll-area-viewport=""
            className="h-full w-full rounded-[inherit]"
            style={{ overflow: 'hidden scroll' }}
          >
            <div style={{ minWidth: '100%', display: 'table' }}>
              <div className="px-2" style={{ opacity: 1 }}>
                <div className="space-y-2 text-left pb-2">
                  {/* Title */}
                  <motion.div {...createFadeInVariant(0.1)}>
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="w-4 h-4 text-purple-400" />
                      <span className="text-lg font-bold text-white">{data.title}</span>
                    </div>
                  </motion.div>

                  {/* Summary */}
                  <motion.div {...createFadeInVariant(0.2)}>
                    <span className="text-xs text-gray-300 leading-relaxed">{data.summary}</span>
                  </motion.div>

                  {/* Key Points */}
                  {data.keyPoints.length > 0 && (
                    <>
                      <motion.div {...createFadeInVariant(0.3)}>
                        <div className="flex items-center gap-2 mt-3 mb-1">
                          <Target className="w-3 h-3 text-purple-400" />
                          <span className="text-base font-semibold text-white">Key Points</span>
                        </div>
                      </motion.div>
                      {data.keyPoints.map((point, index) => (
                        <motion.div
                          key={index}
                          {...createFadeInVariant(0.4 + index * 0.1)}
                        >
                          <div className="text-xs text-gray-200 pl-5 flex items-start gap-2">
                            <ArrowRight className="w-3 h-3 text-purple-400 mt-0.5 flex-shrink-0" />
                            <span>{point}</span>
                          </div>
                        </motion.div>
                      ))}
                    </>
                  )}

                  {/* Topics */}
                  {data.topics.length > 0 && (
                    <>
                      <motion.div {...createFadeInVariant(0.7)}>
                        <div className="border-t border-white/10 my-2"></div>
                      </motion.div>
                      <motion.div {...createFadeInVariant(0.8)}>
                        <div className="flex items-center gap-2 mt-3 mb-1">
                          <Hash className="w-3 h-3 text-purple-400" />
                          <span className="text-base font-semibold text-white">Topics</span>
                        </div>
                      </motion.div>
                      <motion.div {...createFadeInVariant(0.9)}>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {data.topics.map((topic, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 text-xs bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-200"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}

                  {/* Important Note */}
                  <motion.div {...createFadeInVariant(1.0)}>
                    <div className="border-t border-white/10 my-2"></div>
                  </motion.div>
                  <motion.div {...createFadeInVariant(1.1)}>
                    <div className="flex items-center gap-2 mt-3 mb-1">
                      <Lightbulb className="w-3 h-3 text-purple-400" />
                      <span className="text-base font-semibold text-white">Key Insight</span>
                    </div>
                  </motion.div>
                  <motion.div {...createFadeInVariant(1.2)}>
                    <span className="text-xs bg-purple-500/10 border-l-2 border-purple-400 pl-2 py-1 text-purple-200 font-medium block">
                      AI Analysis: This document contains important information that has been processed and summarized for your convenience.
                    </span>
                  </motion.div>

                  <motion.div {...createFadeInVariant(1.3)}>
                    <span className="text-xs text-gray-300 leading-relaxed mt-2 block">
                      The content has been automatically extracted and analyzed to provide you with the most relevant information.
                    </span>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}