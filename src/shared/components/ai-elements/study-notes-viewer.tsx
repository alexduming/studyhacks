'use client';

import React, { useMemo, useRef } from 'react';
import { useTheme } from 'next-themes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { motion, useInView } from 'framer-motion';
import { FaRegLightbulb, FaChartBar, FaListUl } from 'react-icons/fa';
import { MdOutlineAnalytics } from 'react-icons/md';

import { cn } from '@/shared/lib/utils';

interface StudyNotesViewerProps {
  content: string;
  className?: string;
  themeColor?: string; // 用户自定义的主题色
}

interface ParsedSection {
  title: string;
  content: string;
}

interface ParsedNotes {
  title?: string;
  intro?: string;
  sections: ParsedSection[];
}

/**
 * 根据当前主题生成 Markdown 组件的样式
 * 参考 Bento Grid 风格，超大字体突出核心要点
 * 深色主题，强调视觉层次和设计感
 * 同时对“表格”等元素做了专门美化，便于数据可视化
 */
const createMarkdownComponents = (
  isDark: boolean,
  themeColor?: string
): React.ComponentProps<typeof ReactMarkdown>['components'] => ({
  // 一级标题：超大字体，突出核心要点
  h1: ({ children }) => (
    <h1
      className={cn(
        'mt-8 mb-6 text-5xl md:text-6xl font-bold leading-tight',
        isDark ? 'text-white' : 'text-gray-900'
      )}
    >
      {children}
    </h1>
  ),
  // 二级标题：大字体，用于章节标题
  h2: ({ children }) => (
    <h2
      className={cn(
        'mt-8 mb-4 text-3xl md:text-4xl font-bold leading-tight',
        isDark ? 'text-white' : 'text-gray-900'
      )}
    >
      {children}
    </h2>
  ),
  // 三级标题：中等字体，用于子章节
  h3: ({ children }) => (
    <h3
      className={cn(
        'mt-6 mb-3 text-2xl md:text-3xl font-semibold leading-tight',
        isDark ? 'text-gray-100' : 'text-gray-900'
      )}
    >
      {children}
    </h3>
  ),
  // 四级标题：正常字体
  h4: ({ children }) => (
    <h4
      className={cn(
        'mt-5 mb-2 text-xl md:text-2xl font-semibold leading-tight',
        isDark ? 'text-gray-200' : 'text-gray-800'
      )}
    >
      {children}
    </h4>
  ),
  // 段落：增大字体，提升可读性
  p: ({ children }) => (
    <p
      className={cn(
        'mb-5 text-base md:text-lg leading-relaxed',
        isDark ? 'text-gray-300' : 'text-gray-700'
      )}
    >
      {children}
    </p>
  ),
  // 无序列表：增大字体和间距
  ul: ({ children }) => (
    <ul
      className={cn(
        'mb-5 ml-6 list-disc space-y-3 text-base md:text-lg',
        isDark ? 'text-gray-300' : 'text-gray-700'
      )}
    >
      {children}
    </ul>
  ),
  // 有序列表
  ol: ({ children }) => (
    <ol
      className={cn(
        'mb-5 ml-6 list-decimal space-y-3 text-base md:text-lg',
        isDark ? 'text-gray-300' : 'text-gray-700'
      )}
    >
      {children}
    </ol>
  ),
  // 列表项：优化行高和字体
  li: ({ children }) => <li className="leading-relaxed pl-2">{children}</li>,
  // 强调文本：使用主题色
  strong: ({ children }) => (
    <strong
      className={cn(
        'font-semibold',
        isDark ? 'text-white' : 'text-gray-900'
      )}
    >
      {children}
    </strong>
  ),
  // 引用块：使用高亮色透明度渐变，制造科技感
  blockquote: ({ children }) => (
    <blockquote
      className={cn(
        'my-6 border-l-4 pl-6 py-4 text-base md:text-lg italic rounded-r-lg',
        !themeColor && (isDark
          ? 'border-primary/60 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-gray-200'
          : 'border-primary/50 bg-gradient-to-r from-primary/15 via-primary/8 to-transparent text-gray-700')
      )}
      style={themeColor ? {
        borderColor: `${themeColor}99`, // 60% opacity
        background: isDark 
          ? `linear-gradient(to right, ${themeColor}33, ${themeColor}1a, transparent)` 
          : `linear-gradient(to right, ${themeColor}26, ${themeColor}14, transparent)`,
        color: isDark ? '#e5e7eb' : '#374151'
      } : undefined}
    >
      {children}
    </blockquote>
  ),
  // 代码块：内联和块级代码的不同样式，增大字体
  code: ({ className, children, ...props }: any) => {
    const isInline = !className?.includes('language-');
    return isInline ? (
      <code
        className={cn(
          'rounded px-2 py-1 text-sm md:text-base font-mono',
          !themeColor && (isDark
            ? 'bg-gray-800/80 text-primary'
            : 'bg-gray-100 text-primary')
        )}
        style={themeColor ? {
          backgroundColor: isDark ? 'rgba(31, 41, 55, 0.8)' : '#f3f4f6',
          color: themeColor
        } : undefined}
        {...props}
      >
        {children}
      </code>
    ) : (
      <code
        className={cn(
          'block rounded-xl p-6 text-sm md:text-base font-mono overflow-x-auto',
          isDark
            ? 'bg-gray-900/90 text-gray-200 border border-gray-800'
            : 'bg-gray-50 text-gray-800 border border-gray-200',
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  // 链接：添加悬停效果
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'underline transition-colors duration-200',
        !themeColor && (isDark ? 'text-primary hover:text-primary/80' : 'text-primary hover:text-primary/70')
      )}
      style={themeColor ? { color: themeColor } : undefined}
    >
      {children}
    </a>
  ),
  // 图片：响应式设计
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt}
      className="my-4 rounded-lg max-w-full h-auto shadow-md"
      loading="lazy"
    />
  ),
  /**
   * 表格：用于展示对比关系、数据等
   * - 外层加滚动容器，保证在手机上也能横向滑动查看
   * - 使用斑马纹和悬停高亮，增强可读性
   */
  table: ({ children }) => (
    <div className="my-6 w-full overflow-x-auto rounded-xl border border-gray-800/40 bg-gray-950/40">
      <table
        className={cn(
          'min-w-full border-collapse text-sm md:text-base',
          isDark ? 'text-gray-200' : 'text-gray-800'
        )}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead
      className={cn(
        isDark ? 'bg-gray-900/80' : 'bg-gray-100/80'
      )}
    >
      {children}
    </thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr
      className={cn(
        'border-b border-gray-800/40 last:border-none',
        'hover:bg-white/5'
      )}
    >
      {children}
    </tr>
  ),
  th: ({ children }) => (
    <th
      className={cn(
        'px-4 py-3 text-left text-xs md:text-sm font-semibold uppercase tracking-wide',
        isDark ? 'text-gray-300' : 'text-gray-700'
      )}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-3 align-top text-xs md:text-sm">
      {children}
    </td>
  ),
});

/**
 * 将 AI 输出拆成"标题 + 简介 + 章节卡片"，方便做更优雅的排版
 */
const parseStudyNotes = (content: string): ParsedNotes => {
  const lines = content.split('\n');
  let docTitle: string | undefined;
  const introLines: string[] = [];
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith('# ')) {
      docTitle = line.replace(/^#\s*/, '').trim();
      continue;
    }
    if (line.startsWith('## ')) {
      // 如果当前有正在处理的章节，先保存它
      if (currentSection) {
        sections.push({
          title: currentSection.title,
          content: currentSection.content.trim(),
        });
      }
      // 创建新章节
      currentSection = {
        title: line.replace(/^##\s*/, '').trim(),
        content: '',
      };
      continue;
    }
    // 将内容添加到当前章节或简介
    if (currentSection) {
      currentSection.content += `${line}\n`;
    } else {
      introLines.push(line);
    }
  }

  // 处理最后一个章节（如果有）
  if (currentSection) {
    sections.push({
      title: currentSection.title,
      content: currentSection.content.trim(),
    });
  }

  return {
    title: docTitle,
    intro: introLines.join('\n').trim(),
    sections,
  };
};

/**
 * 滚动动画组件 - 模仿 Apple 官网的动效
 * 元素进入视口时触发动画
 */
const ScrollReveal = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{
        duration: 0.8,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
};

/**
 * 超大数字/要点组件 - 用于突出核心要点
 */
const BigNumber = ({ 
  number, 
  label, 
  isDark 
}: { 
  number: string | number; 
  label: string; 
  isDark: boolean;
}) => (
  <div className="flex flex-col items-center justify-center p-8">
    <div
      className={cn(
        'text-7xl md:text-9xl font-bold mb-4',
        'bg-gradient-to-br from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent'
      )}
    >
      {number}
    </div>
    <div
      className={cn(
        'text-lg md:text-xl font-medium',
        isDark ? 'text-gray-300' : 'text-gray-700'
      )}
    >
      {label}
    </div>
  </div>
);

/**
 * 章节图标选择器
 * 非程序员解释：
 * - 我们预先挑选了几种“专业图标”（来源：Font Awesome / Material Icons 对应的 React 封装）
 * - 每个章节会自动轮流使用这些图标，增加视觉层次和记忆点
 */
const sectionIcons = [FaRegLightbulb, FaChartBar, MdOutlineAnalytics, FaListUl];

const getSectionIcon = (index: number) => {
  return sectionIcons[index % sectionIcons.length];
};

/**
 * 学习笔记查看器组件 - Bento Grid 风格
 * 
 * 功能说明：
 * - 参考 Bento Grid 风格的视觉设计
 * - 超大字体和数字突出核心要点
 * - 单列布局，避免内容过窄
 * - 深色主题，高亮色透明度渐变
 * - Apple 官网风格的滚动动画效果
 * - 完全响应式设计
 */
export const StudyNotesViewer = React.forwardRef<HTMLDivElement, StudyNotesViewerProps>(
  ({ content, className, themeColor }, ref) => {
    // 获取当前主题（深色/浅色）
    const { theme, resolvedTheme } = useTheme();
    // 判断是否为深色模式（考虑系统主题）
    const isDark = resolvedTheme === 'dark' || theme === 'dark';
    
    // 如果用户传入了 themeColor，通过 CSS 变量覆盖默认的 primary 色
    // 注意：这里需要配合 global.css 或 tailwind 配置，或者直接用 style 注入变量
    // 为了简单有效，我们直接注入一个 style 标签到组件根元素
    const style = themeColor ? ({
      '--primary': themeColor,
      // 同时也需要生成对应的 oklch 或 rgb 值以支持透明度，这里简化处理，
      // 实际项目中建议使用 tinycolor2 等库来转换颜色
    } as React.CSSProperties) : {};

    // 我们可以创建一个辅助函数来生成颜色的透明度变体
    // 但由于 Tailwind 的 bg-primary/20 依赖于 CSS 变量的格式（通常是 rgb 或 hsl 值），
    // 直接覆盖 --primary 可能需要 hex -> rgb 的转换。
    // 这里我们可以使用一个简单的转换逻辑，或者直接依赖 style 属性传递给 motion.div
    
    // 简单 hex 转 rgb 的 helper (仅支持 #RRGGBB)
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}` : null;
    };

    // 如果提供了 themeColor，我们需要构建一个覆盖样式的对象
    const dynamicStyle = useMemo(() => {
      if (!themeColor) return {};
      
      // 尝试解析 hex
      const rgb = hexToRgb(themeColor);
      if (rgb) {
        // 如果我们使用的是 shadcn/ui 的 oklch 模式，这里直接覆盖可能会有问题
        // 但我们可以尝试直接操作 style 属性中的 color 和 background
        // 更好的方式是覆盖 CSS 变量，让 Tailwind 的 opacity 工具类生效
        // 假设 tailwind config 中 primary 使用的是 <alpha-value> 占位符
        // 这里我们只能做到尽力模拟
        return {
           '--primary': themeColor,
           // 对于不支持 oklch 动态转换的情况，我们可能需要手动处理一些关键颜色
        } as React.CSSProperties;
      }
      return {};
    }, [themeColor]);

    // 为了让 Tailwind 的 opacity class (如 bg-primary/10) 生效，
    // 我们需要将 hex 转换为 CSS 变量期望的格式。
    // 现在的项目中，global.css 里 --primary 是 oklch 值。
    // 这是一个挑战，因为直接替换 hex 不会自动转 oklch。
    // 
    // 替代方案：
    // 我们不依赖 tailwind 的 primary class，而是使用 style 直接设置关键元素的颜色。
    // 或者，我们在根元素上设置一个 style，重写相关 CSS 变量（如果 tailwind 配置允许）。
    // 
    // 鉴于 shadcn/ui 的复杂性，最稳妥的方式是：
    // 使用 style={{ color: themeColor }} 给文本
    // 使用 style={{ backgroundColor: themeColor, opacity: 0.1 }} 给背景
    // 
    // 但这需要修改所有子组件。
    // 
    // 让我们尝试一种更 hack 但有效的方法：
    // 我们在组件最外层通过 style 注入 --primary-color (自定义变量)，
    // 然后在 className 中结合使用 style。
    
    // 为了简化，我们假设用户选择的颜色主要用于：
    // 1. 标题文字
    // 2. 图标颜色
    // 3. 背景渐变的起始色
    
    // 我们将 hexToRgb 的结果用于构建一个兼容的 style 对象
    // 如果项目使用 hex 作为变量值（在某些配置下），则直接用。
    // 如果是 oklch，则不仅是简单的替换。
    
    // 让我们采用“关键元素内联样式”策略，配合 themeColor prop。
    // 我们修改 createMarkdownComponents，让它接受 themeColor。

    // 根据主题动态生成 Markdown 组件样式
    const markdownComponents = useMemo(
      () => createMarkdownComponents(isDark, themeColor),
      [isDark, themeColor]
    );

    // 解析笔记内容：提取标题、简介和章节
    const parsed = useMemo(() => parseStudyNotes(content), [content]);
    const introExists = parsed.intro && parsed.intro.length > 0;
    const hasSections = parsed.sections.length > 0;

    return (
      <div
        ref={ref}
        className={cn(
          'study-notes-viewer w-full max-w-5xl mx-auto space-y-8 md:space-y-12',
          className
        )}
        style={dynamicStyle} // 尝试注入变量，虽然可能不完全生效
      >
        {/* 标题区域：超大字体，Bento Grid 风格 */}
        {parsed.title && (
          <ScrollReveal>
            <motion.div
              className={cn(
                'rounded-2xl p-8 md:p-12 relative overflow-hidden',
                // 深色主题：使用高亮色透明度渐变，制造科技感
                isDark
                  ? 'border border-primary/30'
                  : 'border border-primary/20'
              )}
              style={{
                 background: isDark 
                   ? `linear-gradient(to bottom right, ${themeColor || 'rgba(var(--primary), 0.2)'}33, transparent)` // 33 = 20% opacity
                   : `linear-gradient(to bottom right, ${themeColor || 'rgba(var(--primary), 0.1)'}1a, transparent)`,
                 borderColor: themeColor ? `${themeColor}4d` : undefined // 4d = 30% opacity
              }}
            >
              {/* 背景装饰：超大视觉元素 */}
              <div
                className={cn(
                  'absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-20'
                )}
                style={{
                  background: `linear-gradient(to bottom right, ${themeColor || 'var(--primary)'}, transparent)`
                }}
              />
              <p
                className={cn(
                  'text-sm md:text-base uppercase tracking-widest font-medium mb-4 relative z-10',
                  !themeColor && (isDark ? 'text-primary/80' : 'text-primary/70')
                )}
                style={{ color: themeColor ? themeColor : undefined, opacity: themeColor ? 0.8 : undefined }}
              >
                📚 AI Study Notes
              </p>
              <h1
                className={cn(
                  'text-4xl md:text-6xl lg:text-7xl font-bold leading-tight relative z-10',
                  isDark ? 'text-white' : 'text-gray-900'
                )}
              >
                {parsed.title}
              </h1>
            </motion.div>
          </ScrollReveal>
        )}

        {/* 简介/概述区域：增大字体和间距 */}
        {introExists && (
          <ScrollReveal delay={0.1}>
            <motion.div
              className={cn(
                'rounded-2xl border p-8 md:p-10 backdrop-blur-sm',
                isDark
                  ? 'border-gray-800/50 bg-gradient-to-br from-gray-900/80 via-gray-900/60 to-gray-900/40'
                  : 'border-gray-200 bg-white'
              )}
            >
              <div
                className={cn(
                  'text-sm md:text-base uppercase tracking-wider font-semibold mb-6',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}
              >
                📖 Overview
              </div>
              <div className="text-base md:text-lg">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={markdownComponents}
                >
                  {parsed.intro || ''}
                </ReactMarkdown>
              </div>
            </motion.div>
          </ScrollReveal>
        )}

        {/* 章节内容：单列布局，Bento Grid 风格，每个章节占据全宽 */}
        {hasSections ? (
          <div className="space-y-8 md:space-y-12">
            {parsed.sections.map((section, index) => {
              // 每3个章节后，可以插入一个特殊的大卡片（可选）
              const isLargeCard = index % 4 === 2;
              
              return (
                <ScrollReveal key={`${section.title}-${index}`} delay={0.1 * (index + 1)}>
                  <motion.div
                    whileHover={{
                      scale: 1.01,
                      transition: { duration: 0.3 },
                    }}
                    className={cn(
                      'group rounded-2xl border p-8 md:p-12 relative overflow-hidden',
                      'transition-all duration-500',
                      isLargeCard
                        ? 'min-h-[400px]'
                        : 'min-h-[300px]',
                      isDark
                        ? 'border-gray-800/50 bg-gradient-to-br from-gray-900/60 via-gray-900/40 to-gray-900/20'
                        : 'border-gray-200/50 bg-white'
                    )}
                    style={{
                      borderColor: themeColor ? `${themeColor}33` : undefined, // 20% opacity border
                    }}
                  >
                    {/* 背景装饰：高亮色透明度渐变 */}
                    <div
                      className={cn(
                        'absolute -bottom-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-10',
                        'transition-opacity duration-500 group-hover:opacity-20'
                      )}
                      style={{
                        background: `linear-gradient(to bottom right, ${themeColor || 'var(--primary)'}, transparent)`
                      }}
                    />
                    
                    {/* 章节标题和序号：超大视觉元素 + 专业图标 */}
                    <div className="flex items-start gap-6 mb-8 relative z-10">
                      {/* 超大序号 */}
                      <div className="flex-shrink-0">
                        <div
                          className={cn(
                            'text-6xl md:text-8xl font-bold leading-none',
                            !themeColor && 'bg-gradient-to-br from-primary/40 via-primary/30 to-primary/20 bg-clip-text text-transparent'
                          )}
                          style={themeColor ? {
                            color: 'transparent',
                            backgroundImage: `linear-gradient(to bottom right, ${themeColor}66, ${themeColor}33)`,
                            backgroundClip: 'text',
                            WebkitBackgroundClip: 'text'
                          } : undefined}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </div>
                      </div>
                      {/* 章节标题 */}
                      <div className="flex-1 pt-2 flex items-start justify-between gap-4">
                        <h2
                          className={cn(
                            'text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-4',
                            isDark ? 'text-white' : 'text-gray-900'
                          )}
                        >
                          {section.title}
                        </h2>
                        {/* 专业图标：Font Awesome / Material Icons（通过 react-icons 使用） */}
                        <div className="hidden md:flex items-center justify-center">
                          {(() => {
                            const Icon = getSectionIcon(index);
                            return (
                              <Icon
                                className={cn(
                                  'h-8 w-8 md:h-10 md:w-10',
                                  !themeColor && (isDark ? 'text-primary/80' : 'text-primary/70')
                                )}
                                style={{ color: themeColor ? `${themeColor}cc` : undefined }}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    
                    {/* 章节内容：增大字体 */}
                    <div className="relative z-10 text-base md:text-lg">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                        components={markdownComponents}
                      >
                        {section.content}
                      </ReactMarkdown>
                    </div>
                  </motion.div>
                </ScrollReveal>
              );
            })}
          </div>
        ) : (
          // 如果没有章节结构，直接渲染原始 Markdown 内容
          <ScrollReveal>
            <motion.div className="text-base md:text-lg">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={markdownComponents}
              >
                {content}
              </ReactMarkdown>
            </motion.div>
          </ScrollReveal>
        )}
      </div>
    );
  }
);

StudyNotesViewer.displayName = 'StudyNotesViewer';

