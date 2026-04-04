export interface YearlyUpgradeContext {
  mode: 'yearly_prorated';
  sourceSubscriptionNo: string;
  sourceProductId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  currentCycleStart: string;
  currentCycleEnd: string;
  currentMonthNumber: number;
  currentPlanAmount: number;
  targetPlanAmount: number;
  proratedAmount: number;
  immediateCreditsDelta: number;
}

export function getPlanTier(productId?: string | null) {
  if (!productId) {
    return 0;
  }

  if (productId.startsWith('pro-')) {
    return 2;
  }

  if (productId.startsWith('plus-')) {
    return 1;
  }

  return 0;
}

export function isPaidMembershipProduct(productId?: string | null) {
  return getPlanTier(productId) > 0;
}

export function getMembershipPeriodEnd({
  startAt,
  interval,
  fallbackDays,
}: {
  startAt: Date;
  interval?: string | null;
  fallbackDays?: number;
}) {
  const endAt = new Date(startAt);

  if (interval === 'year') {
    endAt.setFullYear(endAt.getFullYear() + 1);
    return endAt;
  }

  if (interval === 'month') {
    endAt.setMonth(endAt.getMonth() + 1);
    return endAt;
  }

  if (interval === 'week') {
    endAt.setDate(endAt.getDate() + 7);
    return endAt;
  }

  if (interval === 'day') {
    endAt.setDate(endAt.getDate() + 1);
    return endAt;
  }

  endAt.setDate(endAt.getDate() + (fallbackDays || 30));
  return endAt;
}

export function getYearlyCycleInfo({
  currentPeriodStart,
  currentPeriodEnd,
  now = new Date(),
}: {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  now?: Date;
}) {
  let currentMonthNumber = 1;
  let currentCycleStart = new Date(currentPeriodStart);
  let nextCycleStart = new Date(currentCycleStart);
  nextCycleStart.setMonth(nextCycleStart.getMonth() + 1);

  while (nextCycleStart <= now && nextCycleStart < currentPeriodEnd) {
    currentCycleStart = new Date(nextCycleStart);
    nextCycleStart = new Date(currentCycleStart);
    nextCycleStart.setMonth(nextCycleStart.getMonth() + 1);
    currentMonthNumber += 1;
  }

  const currentCycleEnd =
    nextCycleStart < currentPeriodEnd
      ? new Date(nextCycleStart)
      : new Date(currentPeriodEnd);

  return {
    currentMonthNumber,
    currentCycleStart,
    currentCycleEnd,
  };
}

export function parseYearlyUpgradeContext(value: unknown) {
  if (!value) {
    return null;
  }

  const raw =
    typeof value === 'string'
      ? safeJsonParse(value)
      : typeof value === 'object'
        ? value
        : null;

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Partial<YearlyUpgradeContext>;
  if (
    candidate.mode !== 'yearly_prorated' ||
    !candidate.sourceSubscriptionNo ||
    !candidate.sourceProductId ||
    !candidate.currentPeriodStart ||
    !candidate.currentPeriodEnd ||
    !candidate.currentCycleStart ||
    !candidate.currentCycleEnd ||
    typeof candidate.currentMonthNumber !== 'number' ||
    typeof candidate.currentPlanAmount !== 'number' ||
    typeof candidate.targetPlanAmount !== 'number' ||
    typeof candidate.proratedAmount !== 'number' ||
    typeof candidate.immediateCreditsDelta !== 'number'
  ) {
    return null;
  }

  return candidate as YearlyUpgradeContext;
}

export function getYearlyUpgradeContextFromCheckoutInfo(
  checkoutInfo?: string | null
) {
  if (!checkoutInfo) {
    return null;
  }

  const parsed = safeJsonParse(checkoutInfo);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  return parseYearlyUpgradeContext(
    (parsed as { upgradeContext?: unknown }).upgradeContext
  );
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
