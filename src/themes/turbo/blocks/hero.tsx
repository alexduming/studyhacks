'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Zap } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { Button } from '@/shared/components/ui/button';
import { Highlighter } from '@/shared/components/ui/highlighter';
import { cn } from '@/shared/lib/utils';
import { Hero as HeroType } from '@/shared/types/blocks/landing';

// 动画光束效果组件
const Beams = () => {
  return (
    <svg
      viewBox="0 0 1200 800"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <rect
        x="0"
        y="0"
        width="1200"
        height="800"
        fill="url(#beam1)"
        opacity="0.5"
      >
        <animate
          attributeName="x"
          from="-1200"
          to="1200"
          dur="20s"
          repeatCount="indefinite"
        />
      </rect>
      <rect
        x="0"
        y="0"
        width="1200"
        height="800"
        fill="url(#beam2)"
        opacity="0.5"
      >
        <animate
          attributeName="x"
          from="1200"
          to="-1200"
          dur="25s"
          repeatCount="indefinite"
        />
      </rect>
    </svg>
  );
};

const createFadeInVariant = (delay: number) => ({
  initial: {
    opacity: 0,
    y: 30,
    filter: 'blur(10px)',
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
  },
  transition: {
    duration: 0.8,
    delay,
    ease: [0.22, 1, 0.36, 1] as const,
  },
});

export function Hero({
  hero,
  className,
}: {
  hero: HeroType;
  className?: string;
}) {
  const highlightText = hero.highlight_text ?? '';
  let texts = null;
  if (highlightText) {
    texts = hero.title?.split(highlightText, 2);
  }

  return (
    <>
      <section
        id={hero.id}
        className={cn(
          'via-primary/10 relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-gray-950 to-gray-950',
          hero.className,
          className
        )}
      >
        {/* 光束效果背景 */}
        <div className="absolute inset-0 overflow-hidden">
          <Beams />
        </div>

        {/* 渐变叠加 */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-gray-950/50" />

        {/* 动画粒子背景 */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="bg-primary absolute h-1 w-1 rounded-full"
              initial={{
                x: Math.random() * 100 - 50,
                y: Math.random() * 100 - 50,
                opacity: Math.random() * 0.5,
              }}
              animate={{
                y: [0, -100, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: Math.random() * 3 + 2,
                repeat: Infinity,
                delay: Math.random() * 2,
                ease: 'easeInOut',
              }}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 text-center">
          {/* 公告栏 */}
          {hero.announcement && (
            <motion.div {...createFadeInVariant(0)}>
              <Link
                href={hero.announcement.url || ''}
                target={hero.announcement.target || '_self'}
                className="group border-primary/30 bg-primary/10 hover:border-primary/50 hover:bg-primary/20 mx-auto mb-8 inline-flex items-center gap-3 rounded-full border px-6 py-3 text-sm backdrop-blur-sm transition-all duration-300"
              >
                <Zap className="text-primary h-4 w-4" />
                {/* 公告栏文字根据 dark/light 模式自动切换颜色 */}
                <span className="text-foreground">
                  {hero.announcement.title}
                </span>
                <ArrowRight className="text-primary h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
          )}
          {/* 主标题 - 纯白色文字，highlight 为动态下划线 */}
          <motion.div {...createFadeInVariant(0.4)} className="mt-8">
            {texts && texts.length > 0 ? (
              <h1 className="text-5xl font-bold text-white sm:text-6xl md:text-7xl lg:text-8xl">
                {texts[0]}
                <span className="relative inline-block">
                  {/* 弱化的晕染效果 */}
                  <span className="from-primary/30 to-primary/20 absolute inset-0 bg-gradient-to-r opacity-30 blur-xl"></span>
                  {/* 动态下划线效果 */}
                  <Highlighter
                    action="underline"
                    color="rgb(139, 92, 246)"
                    strokeWidth={3}
                    animationDuration={800}
                    isView={true}
                  >
                    {highlightText}
                  </Highlighter>
                </span>
                {texts[1]}
              </h1>
            ) : (
              <h1 className="text-5xl font-bold text-white sm:text-6xl md:text-7xl lg:text-8xl">
                {hero.title}
              </h1>
            )}
          </motion.div>

          {/* 描述文本 */}
          <motion.p
            {...createFadeInVariant(0.6)}
            className="mx-auto mt-8 max-w-2xl text-lg text-gray-300 sm:text-xl md:text-2xl"
            dangerouslySetInnerHTML={{ __html: hero.description ?? '' }}
          />

          {/* 按钮组 */}
          {hero.buttons && (
            <motion.div
              {...createFadeInVariant(0.8)}
              className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
            >
              {hero.buttons.map((button, idx) => (
                <Button
                  asChild
                  size={button.size || 'lg'}
                  variant={idx === 0 ? 'default' : 'outline'}
                  className={cn(
                    'px-8 py-6 text-lg font-medium transition-all duration-300',
                    idx === 0
                      ? 'bg-primary hover:bg-primary/90 hover:shadow-primary/30 border-0 text-white shadow-lg transition-all duration-300 hover:shadow-xl'
                      : 'border-primary/40 text-primary/80 hover:border-primary/60 hover:bg-primary/10 backdrop-blur-sm'
                  )}
                  key={idx}
                >
                  <Link
                    href={button.url ?? ''}
                    target={button.target ?? '_self'}
                  >
                    {button.title}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              ))}
            </motion.div>
          )}

          {/* 提示文本 */}
          {hero.tip && (
            <motion.p
              {...createFadeInVariant(1)}
              className="mt-8 text-center text-sm text-gray-400"
              dangerouslySetInnerHTML={{ __html: hero.tip ?? '' }}
            />
          )}
        </div>

        {/* 底部渐变淡出效果 */}
        <div className="absolute right-0 bottom-0 left-0 h-32 bg-gradient-to-t from-gray-950 to-transparent" />
      </section>
    </>
  );
}
