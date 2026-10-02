import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUpRight, Boxes, Newspaper, Sparkles } from 'lucide-react';

import {
  type AiLayoutRenderMode,
  type AiLayoutTemplateId,
  DEFAULT_AI_LAYOUT_RENDER_MODE,
  DEFAULT_AI_LAYOUT_TEMPLATE,
} from '@/shared/lib/ai-layout';
import { cn } from '@/shared/lib/utils';

interface AiLayoutViewerProps {
  content: string;
  template?: AiLayoutTemplateId;
  renderMode?: AiLayoutRenderMode;
  themeColor?: string;
  className?: string;
}

interface ParsedSection {
  title: string;
  content: string;
}

interface ParsedLayoutDocument {
  title: string;
  intro: string;
  sections: ParsedSection[];
  highlights: string[];
}

type Preset = {
  accent: string;
  label: string;
  icon: 'newspaper' | 'boxes' | 'sparkles';
  background: string;
  textColor: string;
  sectionLayout: 'stack' | 'grid' | 'timeline' | 'report';
  sectionStyle: 'solid' | 'soft' | 'outline' | 'glass';
  numberShape: 'pill' | 'square' | 'dot';
  badge?: string;
  dark?: boolean;
  masthead?: boolean;
  highlightTitle: string;
  /* --- 新增：让每种风格有更独特的视觉特征 --- */
  titleFont?: string;       // 标题字体族（CSS font-family）
  bodyFont?: string;        // 正文字体族
  borderRadius?: string;    // 卡片圆角大小
  accentGradient?: string;  // 双色渐变强调（替代单色 accent）
  decorLine?: boolean;      // 是否显示装饰线条
  columnLayout?: boolean;   // 报纸双栏布局
};

/* ============================================================
 * 10 种高级排版风格 Presets
 * 灵感来源：Monocle杂志、Apple Keynote、Swiss Design、
 * 纽约时报、McKinsey简报、Awwwards获奖网站、Glassmorphism 等
 * ============================================================ */
const PRESETS: Record<AiLayoutTemplateId, Preset> = {
  /* 1. Editorial — 灵感：Monocle 杂志 / 高端编辑排版
   *    暖色纸张底色 + 翡翠绿强调 + 优雅衬线体标题 */
  editorial: {
    accent: '#0f766e',
    label: 'Monocle Editorial',
    icon: 'newspaper',
    background: 'linear-gradient(180deg, #faf7f2 0%, #f5f0e8 40%, #fdfbf7 100%)',
    textColor: '#1c1917',
    sectionLayout: 'stack',
    sectionStyle: 'solid',
    numberShape: 'pill',
    highlightTitle: 'Key Highlights',
    titleFont: '"Playfair Display", "Georgia", "Noto Serif SC", serif',
    bodyFont: '"Inter", "Noto Sans SC", system-ui, sans-serif',
    borderRadius: '20px',
    decorLine: true,
  },

  /* 2. Bento — 灵感：Apple Keynote / WWDC 深色卡片
   *    深空灰背景 + 橙色聚焦 + 不对称网格 */
  bento: {
    accent: '#f97316',
    label: 'Bento Grid',
    icon: 'boxes',
    background: 'radial-gradient(ellipse at 20% 0%, rgba(249,115,22,0.06) 0%, transparent 50%), linear-gradient(180deg, #09090b 0%, #18181b 100%)',
    textColor: '#fafafa',
    sectionLayout: 'grid',
    sectionStyle: 'soft',
    numberShape: 'dot',
    dark: true,
    highlightTitle: 'Focus',
    titleFont: '"SF Pro Display", "Inter", "Noto Sans SC", system-ui, sans-serif',
    bodyFont: '"SF Pro Text", "Inter", "Noto Sans SC", system-ui, sans-serif',
    borderRadius: '24px',
  },

  /* 3. Spotlight — 灵感：Stripe / Linear 品牌风格
   *    纯白+微蓝渐变 + 蓝紫双色渐变强调 + 时间线布局 */
  spotlight: {
    accent: '#2563eb',
    label: 'Spotlight',
    icon: 'sparkles',
    background: 'linear-gradient(180deg, #ffffff 0%, #f8faff 50%, #eef2ff 100%)',
    textColor: '#0f172a',
    sectionLayout: 'timeline',
    sectionStyle: 'glass',
    numberShape: 'dot',
    badge: 'Visual Focus',
    highlightTitle: 'Quick Scan',
    titleFont: '"Inter", "Noto Sans SC", system-ui, sans-serif',
    bodyFont: '"Inter", "Noto Sans SC", system-ui, sans-serif',
    borderRadius: '28px',
    accentGradient: 'linear-gradient(135deg, #2563eb, #7c3aed)',
  },

  /* 4. Mono — 灵感：Swiss International Typographic Style / Helvetica 海报
   *    纯白背景 + 纯黑线条 + 方形数字标签 + 严格网格系统 */
  mono: {
    accent: '#000000',
    label: 'Swiss Mono',
    icon: 'newspaper',
    background: '#ffffff',
    textColor: '#000000',
    sectionLayout: 'stack',
    sectionStyle: 'outline',
    numberShape: 'square',
    masthead: true,
    highlightTitle: 'Core Points',
    titleFont: '"Helvetica Neue", "Arial", "Noto Sans SC", sans-serif',
    bodyFont: '"Helvetica Neue", "Arial", "Noto Sans SC", sans-serif',
    borderRadius: '0px',
    decorLine: true,
  },

  /* 5. Newspaper — 灵感：纽约时报 / 经济学人
   *    古典报纸质感 + 深棕强调 + 衬线体 + 双栏布局 */
  newspaper: {
    accent: '#78350f',
    label: 'The Daily',
    icon: 'newspaper',
    background: 'linear-gradient(180deg, #f9f5ec 0%, #f5efe2 100%)',
    textColor: '#1c1917',
    sectionLayout: 'report',
    sectionStyle: 'soft',
    numberShape: 'dot',
    masthead: true,
    highlightTitle: 'Headlines',
    titleFont: '"Playfair Display", "Georgia", "Noto Serif SC", serif',
    bodyFont: '"Georgia", "Noto Serif SC", "Times New Roman", serif',
    borderRadius: '4px',
    decorLine: true,
    columnLayout: true,
  },

  /* 6. Gallery — 灵感：画廊 / 展览策展 / Behance 项目展示
   *    白底 + 紫色渐变 + 玻璃态卡片 + 彩色交替面板 */
  gallery: {
    accent: '#7c3aed',
    label: 'Gallery Exhibit',
    icon: 'sparkles',
    background: 'linear-gradient(180deg, #fefefe 0%, #faf5ff 50%, #f5f0ff 100%)',
    textColor: '#1e1b4b',
    sectionLayout: 'grid',
    sectionStyle: 'glass',
    numberShape: 'pill',
    badge: 'Curated',
    highlightTitle: 'Featured',
    titleFont: '"DM Sans", "Inter", "Noto Sans SC", system-ui, sans-serif',
    bodyFont: '"DM Sans", "Inter", "Noto Sans SC", system-ui, sans-serif',
    borderRadius: '32px',
    accentGradient: 'linear-gradient(135deg, #7c3aed, #db2777)',
  },

  /* 7. Blueprint — 灵感：技术蓝图 / 深海工程图
   *    深蓝底色 + 青蓝强调 + 方形卡片 + 网格线装饰 */
  blueprint: {
    accent: '#38bdf8',
    label: 'Blueprint',
    icon: 'boxes',
    background: 'radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.08) 0%, transparent 60%), linear-gradient(180deg, #0c1222 0%, #0f1729 100%)',
    textColor: '#e2e8f0',
    sectionLayout: 'grid',
    sectionStyle: 'soft',
    numberShape: 'square',
    dark: true,
    highlightTitle: 'Specifications',
    titleFont: '"JetBrains Mono", "SF Mono", "Noto Sans SC", monospace',
    bodyFont: '"Inter", "Noto Sans SC", system-ui, sans-serif',
    borderRadius: '16px',
    decorLine: true,
  },

  /* 8. Aurora — 灵感：北欧极简 + 极光渐变 + 玻璃拟态
   *    柔和多彩渐变背景 + 透明玻璃卡片 + 绿色调 */
  aurora: {
    accent: '#059669',
    label: 'Aurora Flow',
    icon: 'sparkles',
    background: 'radial-gradient(ellipse at 10% 20%, rgba(16,185,129,0.15) 0%, transparent 50%), radial-gradient(ellipse at 90% 10%, rgba(99,102,241,0.12) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(244,114,182,0.08) 0%, transparent 50%), linear-gradient(180deg, #fafffe 0%, #f0fdf4 40%, #f5f3ff 100%)',
    textColor: '#064e3b',
    sectionLayout: 'stack',
    sectionStyle: 'glass',
    numberShape: 'dot',
    badge: 'Aurora',
    highlightTitle: 'Essence',
    titleFont: '"DM Sans", "Inter", "Noto Sans SC", system-ui, sans-serif',
    bodyFont: '"Inter", "Noto Sans SC", system-ui, sans-serif',
    borderRadius: '28px',
    accentGradient: 'linear-gradient(135deg, #059669, #6366f1)',
  },

  /* 9. Dossier — 灵感：McKinsey / 高管简报 / 商业报告
   *    浅灰底 + 深蓝强调 + 数据驱动布局 + 严肃报告感 */
  dossier: {
    accent: '#1e40af',
    label: 'Executive Brief',
    icon: 'newspaper',
    background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 50%, #f8fafc 100%)',
    textColor: '#0f172a',
    sectionLayout: 'report',
    sectionStyle: 'solid',
    numberShape: 'pill',
    highlightTitle: 'Key Findings',
    titleFont: '"Inter", "Noto Sans SC", system-ui, sans-serif',
    bodyFont: '"Inter", "Noto Sans SC", system-ui, sans-serif',
    borderRadius: '12px',
    decorLine: true,
  },

  /* 10. Pulse — 灵感：赛博朋克 / 霓虹 / 暗夜能量
   *     深黑底 + 红色霓虹 + 发光卡片边框 + 高能量设计 */
  pulse: {
    accent: '#f43f5e',
    label: 'Neon Pulse',
    icon: 'sparkles',
    background: 'radial-gradient(ellipse at 70% 0%, rgba(244,63,94,0.12) 0%, transparent 50%), radial-gradient(ellipse at 20% 80%, rgba(251,146,60,0.08) 0%, transparent 50%), linear-gradient(180deg, #0a0a0a 0%, #0f0f0f 50%, #0a0a0a 100%)',
    textColor: '#fafafa',
    sectionLayout: 'grid',
    sectionStyle: 'soft',
    numberShape: 'square',
    dark: true,
    badge: 'PULSE',
    highlightTitle: 'Signal',
    titleFont: '"Inter", "Noto Sans SC", system-ui, sans-serif',
    bodyFont: '"Inter", "Noto Sans SC", system-ui, sans-serif',
    borderRadius: '20px',
    accentGradient: 'linear-gradient(135deg, #f43f5e, #fb923c)',
  },
};

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3 ? normalized.split('').map((c) => `${c}${c}`).join('') : normalized;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function extractHighlightLines(markdown: string, limit = 4) {
  const lines = markdown.split('\n');
  const hits: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = trimmed.match(/^[-*+]\s+(.+)/)?.[1];
    if (bullet) hits.push(bullet.trim());
    const bolds = [...trimmed.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1].trim());
    hits.push(...bolds);
    if (/\d/.test(trimmed) && trimmed.length <= 60) hits.push(trimmed.replace(/^>\s*/, '').trim());
  }
  return [...new Set(hits.filter(Boolean))].slice(0, limit);
}

function parseLayoutContent(content: string): ParsedLayoutDocument {
  const lines = content.replace(/\r\n/g, '\n').trim().split('\n');
  let title = 'AI Layout';
  const intro: string[] = [];
  const sections: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('# ') && title === 'AI Layout') {
      title = line.replace(/^#\s+/, '').trim();
      continue;
    }
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { title: line.replace(/^##\s+/, '').trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(raw);
    else intro.push(raw);
  }
  if (current) sections.push(current);
  return {
    title,
    intro: intro.join('\n').trim(),
    sections: sections.map((section) => ({
      title: section.title,
      content: section.lines.join('\n').trim(),
    })),
    highlights: extractHighlightLines(content),
  };
}

function IconFor({ icon, color }: { icon: Preset['icon']; color: string }) {
  const props = { className: 'h-4 w-4', style: { color } };
  if (icon === 'boxes') return <Boxes {...props} />;
  if (icon === 'sparkles') return <Sparkles {...props} />;
  return <Newspaper {...props} />;
}

function MarkdownBlock({
  content,
  accentColor,
  isMobile,
  className,
}: {
  content: string;
  accentColor: string;
  isMobile: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className={cn('mb-4 font-semibold leading-tight', isMobile ? 'text-3xl' : 'text-4xl')}>{children}</h1>,
          h2: ({ children }) => <h2 className={cn('mb-3 font-semibold leading-tight', isMobile ? 'text-xl' : 'text-2xl')}>{children}</h2>,
          h3: ({ children }) => <h3 className={cn('mb-2 font-semibold leading-tight', isMobile ? 'text-base' : 'text-lg')}>{children}</h3>,
          p: ({ children }) => <p className={cn('mb-4 leading-7 opacity-90 last:mb-0', isMobile ? 'text-[14px]' : 'text-[15px]')}>{children}</p>,
          ul: ({ children }) => <ul className={cn('mb-4 list-disc space-y-2 pl-5 last:mb-0', isMobile ? 'text-[14px] leading-6' : 'text-[15px] leading-7')}>{children}</ul>,
          ol: ({ children }) => <ol className={cn('mb-4 list-decimal space-y-2 pl-5 last:mb-0', isMobile ? 'text-[14px] leading-6' : 'text-[15px] leading-7')}>{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold" style={{ color: accentColor }}>{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote className={cn('mb-4 rounded-2xl border-l-4 italic last:mb-0', isMobile ? 'px-3 py-3 text-[13px] leading-6' : 'px-4 py-3 text-sm leading-6')} style={{ borderColor: accentColor, backgroundColor: withAlpha(accentColor, 0.08) }}>
              {children}
            </blockquote>
          ),
          table: ({ children }) => <div className="mb-4 overflow-x-auto rounded-2xl border border-black/10 last:mb-0"><table className={cn('min-w-full border-collapse text-left', isMobile ? 'text-[12px]' : 'text-sm')}>{children}</table></div>,
          th: ({ children }) => <th className="border-b border-black/10 px-4 py-3 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-black/5 px-4 py-3">{children}</td>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4" style={{ color: accentColor }}>{children}</a>,
          code: ({ children }) => <code className={cn('rounded-md px-1.5 py-1', isMobile ? 'text-[12px]' : 'text-[13px]')} style={{ backgroundColor: withAlpha(accentColor, 0.08) }}>{children}</code>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* panelStyle — 根据 sectionStyle 和 preset 新属性返回卡片样式 */
function panelStyle(preset: Preset, accentColor: string, index: number) {
  const radius = preset.borderRadius || '28px';

  if (preset.sectionStyle === 'outline') {
    return { borderColor: accentColor || '#111111', backgroundColor: '#ffffff', borderRadius: radius };
  }
  if (preset.sectionStyle === 'glass') {
    /* 每个卡片用不同的柔和渐变背景，更有层次 */
    const glassBgs = [
      `linear-gradient(160deg, ${withAlpha(accentColor, 0.06)} 0%, ${withAlpha(accentColor, 0.02)} 100%)`,
      `linear-gradient(160deg, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0.02) 100%)`,
      `linear-gradient(160deg, rgba(236,72,153,0.06) 0%, rgba(236,72,153,0.02) 100%)`,
    ];
    return {
      borderColor: withAlpha(accentColor, 0.12),
      background: glassBgs[index % 3],
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: radius,
    };
  }
  if (preset.sectionStyle === 'soft') {
    return {
      borderColor: preset.dark ? withAlpha(accentColor, 0.15) : withAlpha(accentColor, 0.12),
      backgroundColor: preset.dark ? 'rgba(255,255,255,0.04)' : withAlpha(accentColor, 0.04),
      borderRadius: radius,
    };
  }
  /* solid */
  return {
    borderColor: withAlpha(accentColor, 0.1),
    backgroundColor: preset.dark ? 'rgba(255,255,255,0.03)' : '#ffffff',
    boxShadow: preset.dark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
    borderRadius: radius,
  };
}

function NumberBadge({ index, accentColor, shape, dark, preset }: { index: number; accentColor: string; shape: Preset['numberShape']; dark?: boolean; preset?: Preset }) {
  /* 渐变标签 — 如果 preset 有 accentGradient，使用渐变背景 */
  const hasGradient = preset?.accentGradient;
  const style = hasGradient
    ? { color: '#ffffff', background: preset.accentGradient }
    : { color: dark ? '#ffffff' : accentColor, backgroundColor: dark ? withAlpha(accentColor, 0.2) : withAlpha(accentColor, 0.08) };
  const radius = shape === 'square' ? (preset?.borderRadius === '0px' ? '0px' : '8px') : undefined;
  const shapeClass = shape === 'square' ? 'h-11 min-w-11 px-3' : 'h-11 min-w-11 rounded-full px-3';
  return <span className={cn('inline-flex items-center justify-center text-sm font-bold tracking-wide', shapeClass)} style={{ ...style, borderRadius: radius }}>{(index + 1).toString().padStart(2, '0')}</span>;
}

function renderSections({
  template,
  preset,
  document,
  accentColor,
  isMobile,
}: {
  template: AiLayoutTemplateId;
  preset: Preset;
  document: ParsedLayoutDocument;
  accentColor: string;
  isMobile: boolean;
}) {
  const titleFontStyle = preset.titleFont ? { fontFamily: preset.titleFont } : {};
  const bodyFontStyle = preset.bodyFont ? { fontFamily: preset.bodyFont } : {};
  const sectionRadius = preset.borderRadius || '28px';

  /* ====== Timeline 布局（Spotlight 等） ====== */
  if (preset.sectionLayout === 'timeline') {
    return (
      <div className="mt-10 space-y-5">
        {document.sections.map((section, index) => (
          <section
            key={`${section.title}-${index}`}
            className={cn('gap-4 border', isMobile ? 'space-y-4 p-5' : 'grid p-6 md:grid-cols-[96px_1fr]')}
            style={{ ...panelStyle(preset, accentColor, index), borderRadius: sectionRadius }}
          >
            {/* 序号徽章 — 如果有渐变就用渐变背景 */}
            <div
              className={cn('flex items-center justify-center text-2xl font-bold', isMobile ? 'h-16 w-16' : 'h-20 w-20')}
              style={{
                color: preset.accentGradient ? '#ffffff' : accentColor,
                background: preset.accentGradient || withAlpha(accentColor, 0.08),
                borderRadius: sectionRadius,
              }}
            >
              {(index + 1).toString().padStart(2, '0')}
            </div>
            <div style={bodyFontStyle}>
              <h2
                className={cn('mb-4 font-bold leading-tight', isMobile ? 'text-xl' : 'text-2xl')}
                style={titleFontStyle}
              >
                {section.title}
              </h2>
              <MarkdownBlock content={section.content} accentColor={accentColor} isMobile={isMobile} className={preset.dark ? 'text-white/84' : undefined} />
            </div>
          </section>
        ))}
      </div>
    );
  }

  /* ====== Report 布局（Newspaper / Dossier 等） ====== */
  if (preset.sectionLayout === 'report') {
    return (
      <div className="mt-5 space-y-4">
        {document.sections.map((section, index) => (
          <section
            key={`${section.title}-${index}`}
            className={cn('border p-5', preset.sectionStyle === 'soft' ? '' : '')}
            style={panelStyle(preset, accentColor, index)}
          >
            {/* 装饰线 — 部分风格在标题上方添加小色条 */}
            {preset.decorLine && index === 0 ? (
              <div className="mb-4 h-[3px] w-12" style={{ background: preset.accentGradient || accentColor, borderRadius: '2px' }} />
            ) : null}
            <div className="mb-3 flex items-center gap-3">
              <NumberBadge index={index} accentColor={accentColor} shape={preset.numberShape} dark={preset.dark} preset={preset} />
              <h2
                className={cn('font-bold leading-tight', isMobile ? 'text-lg' : 'text-xl')}
                style={titleFontStyle}
              >
                {section.title}
              </h2>
            </div>
            <div style={bodyFontStyle}>
              <MarkdownBlock content={section.content} accentColor={accentColor} isMobile={isMobile} className={preset.dark ? 'text-white/84' : undefined} />
            </div>
          </section>
        ))}
      </div>
    );
  }

  /* ====== Grid / Stack 布局 ====== */
  const containerClass = preset.sectionLayout === 'grid'
    ? (isMobile ? 'mt-8 space-y-4' : 'mt-8 grid gap-5 md:grid-cols-2')
    : 'mt-10 space-y-6';

  return (
    <div className={containerClass}>
      {document.sections.map((section, index) => (
        <section
          key={`${section.title}-${index}`}
          className={cn(
            'border',
            /* 第一个卡片在 grid 中跨两列（大卡片） */
            preset.sectionLayout === 'grid' && !isMobile && index % 4 === 0 ? 'md:col-span-2' : '',
            /* Pulse 风格：交错偏移让网格更有节奏 */
            template === 'pulse' && !isMobile && index % 4 === 1 ? 'md:translate-y-3' : '',
            isMobile ? 'p-5' : 'p-6',
          )}
          style={panelStyle(preset, accentColor, index)}
        >
          {/* 装饰线条 — Blueprint 风格在每个卡片顶部加亮线 */}
          {preset.decorLine && template === 'blueprint' ? (
            <div className="mb-4 h-[2px] w-8" style={{ background: accentColor, opacity: 0.6, borderRadius: '1px' }} />
          ) : null}

          <div className="mb-4 flex items-center justify-between gap-4">
            <h2
              className={cn('font-bold leading-tight', isMobile ? 'text-xl' : 'text-2xl', preset.dark ? 'text-white' : '')}
              style={titleFontStyle}
            >
              {section.title}
            </h2>
            {preset.sectionLayout === 'grid'
              ? <ArrowUpRight className="h-5 w-5 shrink-0" style={{ color: accentColor }} />
              : <NumberBadge index={index} accentColor={accentColor} shape={preset.numberShape} dark={preset.dark} preset={preset} />
            }
          </div>
          <div style={bodyFontStyle}>
            <MarkdownBlock content={section.content} accentColor={accentColor} isMobile={isMobile} className={preset.dark ? 'text-white/84' : undefined} />
          </div>
        </section>
      ))}
    </div>
  );
}

/* ==================================================================
 * AiLayoutViewer 主组件
 * 应用 preset 的新字体、圆角、装饰线等属性，提供更高级的渲染效果
 * ================================================================== */
export function AiLayoutViewer({
  content,
  template = DEFAULT_AI_LAYOUT_TEMPLATE,
  renderMode = DEFAULT_AI_LAYOUT_RENDER_MODE,
  themeColor,
  className,
}: AiLayoutViewerProps) {
  const document = parseLayoutContent(content);
  const preset = PRESETS[template];
  const accentColor = themeColor || preset.accent;
  const isMobile = renderMode === 'mobile';
  const highlightItems = document.highlights.slice(0, 4);

  /* 从 preset 获取字体配置 */
  const titleFontStyle = preset.titleFont ? { fontFamily: preset.titleFont } : {};
  const bodyFontStyle = preset.bodyFont ? { fontFamily: preset.bodyFont } : {};
  const outerRadius = preset.borderRadius === '0px' ? '0px' : '32px';
  const highlightRadius = preset.borderRadius || '28px';

  return (
    <div className={cn(className, isMobile ? 'mx-auto w-full max-w-[420px]' : 'w-full')}>
      <div
        className={cn('overflow-hidden', isMobile ? 'p-5' : 'p-8 md:p-10')}
        style={{
          background: preset.background,
          color: preset.textColor,
          borderRadius: outerRadius,
          ...(bodyFontStyle),
        }}
      >
        {/* ===== 顶部标签栏 ===== */}
        <div
          className={cn(
            'mb-6 flex items-center gap-3 text-xs uppercase tracking-[0.3em]',
            preset.dark ? 'text-white/60' : 'opacity-60',
            preset.masthead ? 'justify-between pb-4' : '',
          )}
          style={preset.masthead ? { borderBottom: `1px solid ${withAlpha(accentColor, 0.2)}` } : undefined}
        >
          <div className="flex items-center gap-3">
            <IconFor icon={preset.icon} color={accentColor} />
            <span style={{ letterSpacing: '0.15em' }}>{preset.label}</span>
          </div>
          {preset.masthead ? <span style={{ color: accentColor, fontWeight: 600 }}>Issue</span> : null}
        </div>

        {/* ===== Badge 标签 ===== */}
        {preset.badge ? (
          <div
            className="mb-5 inline-flex items-center px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em]"
            style={{
              color: preset.dark ? '#ffffff' : accentColor,
              background: preset.accentGradient || (preset.dark ? withAlpha(accentColor, 0.7) : withAlpha(accentColor, 0.08)),
              borderRadius: preset.borderRadius === '0px' ? '0px' : '100px',
            }}
          >
            {preset.badge}
          </div>
        ) : null}

        {/* ===== 装饰线 — Editorial / Mono / Dossier 风格在标题上方显示 ===== */}
        {preset.decorLine && !preset.masthead ? (
          <div
            className="mb-5 h-[3px] w-14"
            style={{ background: preset.accentGradient || accentColor, borderRadius: '2px' }}
          />
        ) : null}

        {/* ===== 标题 ===== */}
        {preset.masthead ? (
          <div className="text-center">
            {/* 报纸 / Mono 风格：居中大标题 + 装饰线 */}
            {preset.decorLine ? (
              <div className="mx-auto mb-5 h-[2px] w-20" style={{ background: accentColor }} />
            ) : null}
            <h1
              className={cn('mx-auto max-w-4xl font-bold leading-[1.1] uppercase', isMobile ? 'text-3xl' : 'text-5xl')}
              style={titleFontStyle}
            >
              {document.title}
            </h1>
            {preset.decorLine ? (
              <div className="mx-auto mt-5 h-[2px] w-20" style={{ background: accentColor }} />
            ) : null}
          </div>
        ) : (
          <h1
            className={cn('max-w-4xl font-bold leading-[1.1]', isMobile ? 'text-3xl' : 'text-[3.2rem]')}
            style={titleFontStyle}
          >
            {document.title}
          </h1>
        )}

        {/* ===== 正文区域 ===== */}
        {preset.sectionLayout === 'report' ? (
          /* --- Report 布局（Newspaper / Dossier）：左侧摘要 + 右侧正文 --- */
          <div className={cn('mt-8 gap-6', isMobile ? 'space-y-5' : 'grid md:grid-cols-[0.7fr_1.3fr]')}>
            {/* 左侧摘要面板 */}
            <div
              className="border p-5"
              style={{
                ...panelStyle(preset, accentColor, 0),
                borderRadius: highlightRadius,
              }}
            >
              <div
                className="mb-4 text-xs font-bold uppercase tracking-[0.3em]"
                style={{ color: accentColor }}
              >
                {preset.highlightTitle}
              </div>
              {highlightItems.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  className={cn('mt-3 px-4 py-3 text-sm leading-6', preset.dark ? 'text-white/80' : 'text-slate-700')}
                  style={{
                    backgroundColor: preset.dark ? 'rgba(255,255,255,0.04)' : withAlpha(accentColor, 0.04),
                    borderRadius: preset.borderRadius || '16px',
                    ...(bodyFontStyle),
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
            {/* 右侧正文+分栏 */}
            <div
              className="border p-5"
              style={{
                ...panelStyle(preset, accentColor, 1),
                borderRadius: highlightRadius,
              }}
            >
              {document.intro ? (
                <div style={bodyFontStyle} className={preset.columnLayout && !isMobile ? 'columns-2 gap-6' : ''}>
                  <MarkdownBlock content={document.intro} accentColor={accentColor} isMobile={isMobile} className={preset.dark ? 'text-white/84' : undefined} />
                </div>
              ) : null}
              {renderSections({ template, preset, document, accentColor, isMobile })}
            </div>
          </div>
        ) : (
          /* --- 非 Report 布局（其他 8 种风格） --- */
          <>
            <div className={cn('mt-8 gap-6', isMobile ? 'space-y-5' : 'grid md:grid-cols-[1.5fr_0.8fr]')}>
              {/* 左侧 intro */}
              <div style={bodyFontStyle}>
                {document.intro ? (
                  <MarkdownBlock content={document.intro} accentColor={accentColor} isMobile={isMobile} className={preset.dark ? 'text-white/84' : undefined} />
                ) : null}
              </div>
              {/* 右侧高亮面板 */}
              <div
                className="border px-5 py-6"
                style={{
                  borderColor: withAlpha(accentColor, preset.dark ? 0.2 : 0.12),
                  backgroundColor: preset.dark ? withAlpha(accentColor, 0.08) : withAlpha(accentColor, 0.04),
                  borderRadius: highlightRadius,
                }}
              >
                <div
                  className={cn('mb-4 text-xs font-bold uppercase tracking-[0.25em]', preset.dark ? 'text-white/80' : '')}
                  style={{ color: preset.dark ? undefined : accentColor }}
                >
                  {preset.highlightTitle}
                </div>
                <div className="space-y-3">
                  {highlightItems.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className={cn('px-4 py-3 text-sm leading-6', preset.dark ? 'text-white/80' : 'text-slate-700')}
                      style={{
                        backgroundColor: preset.dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                        borderRadius: preset.borderRadius || '16px',
                        ...(bodyFontStyle),
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {renderSections({ template, preset, document, accentColor, isMobile })}
          </>
        )}
      </div>
    </div>
  );
}
