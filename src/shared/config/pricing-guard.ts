import { PricingItem } from '@/shared/types/blocks/pricing';

/**
 * Pricing 权威配置表
 * 为防止翻译文件被误改导致发放错误积分，这里只存业务所需的数字字段
 * 一旦翻译里的 credits/valid_days 被改动，我们仍会以这里为准进行订单和积分计算
 */
const CANONICAL_PLAN_MAP: Record<
  string,
  Pick<PricingItem, 'credits' | 'valid_days'>
> = {
  'free': { credits: 10, valid_days: 30 },
  'plus-monthly': { credits: 600, valid_days: 30 },
  'pro-monthly': { credits: 2000, valid_days: 30 },
  'free-yearly': { credits: 10, valid_days: 30 },
  'plus-yearly': { credits: 600, valid_days: 30 },
  'pro-yearly': { credits: 2000, valid_days: 30 },
};

export function getCanonicalPlanInfo(productId?: string) {
  if (!productId) {
    return null;
  }

  return CANONICAL_PLAN_MAP[productId] || null;
}

/**
 * 比对翻译文件和权威配置，如果发现差异返回警告字符串
 * 仅用于 console.warn 提示运营同学修正翻译里的数字
 */
export function diffPlanCredits(
  item: PricingItem
): string | null {
  const canonical = getCanonicalPlanInfo(item.product_id);
  if (!canonical) {
    return null;
  }

  if (
    (typeof item.credits === 'number' && item.credits !== canonical.credits) ||
    (typeof item.valid_days === 'number' &&
      item.valid_days !== canonical.valid_days)
  ) {
    return `[pricing] "${item.product_id}" credits mismatch. canonical=${canonical.credits}/${canonical.valid_days}, translation=${item.credits}/${item.valid_days}`;
  }

  return null;
}


