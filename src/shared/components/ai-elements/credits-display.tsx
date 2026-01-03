'use client';

import { Sparkles } from 'lucide-react';

/**
 * 按钮上的积分消耗徽章组件
 * 
 * 非程序员解释：
 * - 这是一个美观的积分消耗提示徽章
 * - 显示为一个带背景的小标签，包含sparkles图标和消耗的积分数
 * - 用户一眼就能看到这个功能需要消耗多少积分
 * 
 * 使用方法：
 * ```tsx
 * <Button>
 *   <CreditsCost credits={3} />
 *   生成笔记
 * </Button>
 * ```
 * 
 * @param credits - 消耗的积分数（默认3）
 * @param className - 自定义样式类名
 */
export function CreditsCost({
  credits = 3,
  className = '',
}: {
  credits?: number;
  className?: string;
}) {
  return (
    <span className={`pointer-events-none flex items-center px-2 py-1 bg-white/0 rounded text-sm font-medium mr-2 ${className}`}>
      <Sparkles className="h-4 w-4 mr-1" />
      {credits}
    </span>
  );
}

/**
 * 积分徽章组件（用于按钮文字后面）
 * 
 * 非程序员解释：
 * - 显示为一个小徽章，放在按钮文字后面
 * - 例如："生成笔记 [3]"
 * 
 * @param credits - 消耗的积分数
 */
export function CreditsBadge({ credits = 3 }: { credits?: number }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold">
      <Sparkles className="h-3 w-3" />
      {credits}
    </span>
  );
}

