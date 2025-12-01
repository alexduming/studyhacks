'use client';

import { motion } from 'framer-motion';
import {
  Brain,
  FileText,
  Headphones,
  MessageSquare,
  Users,
  Zap,
} from 'lucide-react';

import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { cn } from '@/shared/lib/utils';
import { Features as FeaturesType } from '@/shared/types/blocks/landing';

// 图标映射
const iconMap = {
  Brain,
  FileText,
  MessageSquare,
  Users,
  Zap,
  Headphones,
};

export function Features({
  features,
  className,
}: {
  features: FeaturesType;
  className?: string;
}) {
  return (
    <section
      id={features.id}
      className={cn(
        'via-primary/5 relative bg-gradient-to-b from-gray-950 to-gray-950 py-24 md:py-32',
        features.className,
        className
      )}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden">
        {/* 深紫色背景装饰 - 匹配图片配色 */}
        <div className="bg-primary/10 absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />
        <div className="bg-primary/15 absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl" />
      </div>

      <div className="relative container">
        <ScrollAnimation>
          <div className="mx-auto mb-20 max-w-4xl text-center text-balance">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
            >
              {/* 深紫色渐变标题 - 匹配图片配色 */}
              <h2 className="via-primary/90 to-primary/70 mb-6 bg-gradient-to-r from-white bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-5xl">
                {features.title}
              </h2>
              <p className="mx-auto max-w-2xl text-lg text-gray-300 md:text-xl">
                {features.description}
              </p>
            </motion.div>
          </div>
        </ScrollAnimation>

        <ScrollAnimation delay={0.2}>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.items?.map((item, idx) => {
              const IconComponent =
                iconMap[item.icon as keyof typeof iconMap] || Brain;

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 50, scale: 0.9 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: 0.6,
                    delay: idx * 0.1,
                    ease: 'backOut',
                  }}
                  viewport={{ once: true }}
                  className="group relative"
                >
                  {/* 深紫色渐变卡片 - 匹配图片配色 */}
                  <div className="border-primary/20 from-primary/5 hover:border-primary/40 hover:shadow-primary/10 to-primary/5 relative h-full rounded-2xl border bg-gradient-to-br p-8 backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
                    {/* 背景光效 - 深紫色 */}
                    <div className="from-primary/10 to-primary/15 absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                    {/* 内容 */}
                    <div className="relative z-10 space-y-6">
                      {/* 图标容器 - 深紫色渐变 */}
                      <div className="from-primary to-primary/80 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br p-1">
                        <div className="flex h-full w-full items-center justify-center rounded-xl bg-gray-950">
                          <IconComponent className="text-primary h-8 w-8" />
                        </div>
                      </div>

                      {/* 标题和描述 */}
                      <div className="space-y-3">
                        <h3 className="text-xl font-bold text-white">
                          {item.title}
                        </h3>
                        <p className="leading-relaxed text-gray-400">
                          {item.description}
                        </p>
                      </div>

                      {/* 装饰线 */}
                      <div className="from-primary/50 h-px bg-gradient-to-r to-transparent" />
                    </div>

                    {/* 悬停效果 */}
                    <motion.div
                      className="border-primary/30 absolute inset-0 rounded-2xl border"
                      initial={{ opacity: 0, scale: 0.95 }}
                      whileHover={{ opacity: 1, scale: 1.02 }}
                      transition={{ duration: 0.3 }}
                      style={{
                        boxShadow: '0 0 40px rgba(168, 85, 247, 0.1)',
                      }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ScrollAnimation>

        {/* 底部装饰 */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          viewport={{ once: true }}
          className="mt-20 flex justify-center"
        >
          <div className="via-primary/50 h-px w-24 bg-gradient-to-r from-transparent to-transparent" />
        </motion.div>
      </div>
    </section>
  );
}
