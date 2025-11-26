'use client';

import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { cn } from '@/shared/lib/utils';
import { Logos as LogosType } from '@/shared/types/blocks/landing';

export function Logos({
  logos,
  className,
}: {
  logos: LogosType;
  className?: string;
}) {
  return (
    <section
      id={logos.id}
      className={cn('py-16 md:py-24', logos.className, className)}
    >
      <div className={`mx-auto max-w-5xl px-6`}>
        <ScrollAnimation>
          {/*
            这里渲染 Logo 区块的标题文案
            - 文案来自多语言配置（locale 的 landing.json -> logos.title）
            - 居中 + 中等字号，作为这一组 Logo 的说明文字
          */}
          <p className="text-md text-center font-medium">{logos.title}</p>
        </ScrollAnimation>
        <ScrollAnimation delay={0.2}>
          {/*
            这里渲染一排 Logo 图标
            设计目标：
            - 保持实现简单（只用一层 flex 布局），避免引入复杂的滚动动画
            - 在不同屏幕宽度下自动换行，整体始终居中
            - 使用灰度 + 透明度，让 Logo 更“低调”地融入页面，而不是喧宾夺主

            技术点：
            - flex + flex-wrap: 一行放不下会自动换行
            - gap-x / gap-y: 控制横纵间距
            - max-w-4xl: 限制内容最大宽度，避免在超宽屏幕上拉得太散
          */}
          <div className="mx-auto mt-12 flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-16 sm:gap-y-10">
            {logos.items?.map((item, idx) => {
              // 如果没有配置图片地址，直接跳过这一项，避免渲染一个空的 img 标签
              if (!item.image?.src) return null;

              return (
                <img
                  key={idx}
                  // 说明：
                  // - h-8 / sm:h-10: 小屏幕高度更小，大屏幕稍大一点
                  // - w-auto + object-contain: 始终按比例缩放，不会被拉伸
                  // - grayscale opacity-80: 统一变成略微灰度、半透明的风格
                  // - dark:invert: 深色模式下做反色处理，保证在深背景上也清晰
                  className="h-8 w-auto object-contain opacity-80 grayscale sm:h-10 dark:invert"
                  src={item.image.src}
                  alt={item.image.alt ?? item.title ?? 'logo'}
                  height={40}
                  // width 使用 auto，让浏览器按比例计算
                />
              );
            })}
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}
