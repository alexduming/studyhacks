'use client';

import { useEffect, useState } from 'react';
import { Check, Lightbulb, Loader2, SendHorizonal, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { SmartIcon } from '@/shared/blocks/common';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { useAppContext } from '@/shared/contexts/app';
import { getCookie } from '@/shared/lib/cookie';
import { cn } from '@/shared/lib/utils';
import { Subscription } from '@/shared/models/subscription';
import {
  PricingCurrency,
  PricingItem,
  Pricing as PricingType,
} from '@/shared/types/blocks/pricing';

// Helper function to get all available currencies from a pricing item
function getCurrenciesFromItem(item: PricingItem | null): PricingCurrency[] {
  if (!item) return [];

  // Always include the default currency first
  const defaultCurrency: PricingCurrency = {
    currency: item.currency,
    amount: item.amount,
    price: item.price || '',
    original_price: item.original_price || '',
  };

  // Add additional currencies if available
  if (item.currencies && item.currencies.length > 0) {
    return [defaultCurrency, ...item.currencies];
  }

  return [defaultCurrency];
}

// Helper function to select initial currency based on locale
function getInitialCurrency(
  currencies: PricingCurrency[],
  _locale: string,
  defaultCurrency: string
): string {
  // 货币切换入口已被移除，为确保 Stripe 仍以默认币种结算
  // 这里始终返回定价项的默认 currency
  if (currencies.length === 0) return defaultCurrency;
  return defaultCurrency;
}

export function Pricing({
  pricing,
  className,
  currentSubscription,
}: {
  pricing: PricingType;
  className?: string;
  currentSubscription?: Subscription;
}) {
  const locale = useLocale();
  const t = useTranslations('pricing.page');
  const { user, setIsShowSignModal, configs } = useAppContext();

  // 月付/年付切换状态管理
  // 业务说明：这个状态用来控制显示月付还是年付的定价方案
  // - 'monthly' 表示显示月付方案（Free, Plus, Pro 的月付版本）
  // - 'yearly' 表示显示年付方案（Free, Plus, Pro 的年付版本）
  // 初始值优先选择：当前订阅的 group > 标记为 featured 的 group > 第一个 group
  const [group, setGroup] = useState(() => {
    // 查找当前订阅对应的定价项
    const currentItem = pricing.items?.find(
      (i) => i.product_id === currentSubscription?.productId
    );

    // 优先查找标记为 featured 的 group（通常是"最受欢迎"的选项）
    const featuredGroup = pricing.groups?.find((g) => g.is_featured);

    // 返回优先级：当前订阅的 group > featured group > 第一个 group
    return (
      currentItem?.group || featuredGroup?.name || pricing.groups?.[0]?.name
    );
  });

  // 根据选中的 group 过滤显示的定价项
  // 业务说明：只显示与当前选中 group 匹配的定价方案
  // 如果 item 没有 group 字段，则始终显示（兼容旧数据）
  const visibleItems = pricing.items
    ? pricing.items.filter((item) => !item.group || item.group === group)
    : [];

  const [isLoading, setIsLoading] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);

  // Currency state management for each item
  // Store selected currency and displayed item for each product_id
  const [itemCurrencies, setItemCurrencies] = useState<
    Record<string, { selectedCurrency: string; displayedItem: PricingItem }>
  >({});

  // Initialize currency states for all items
  useEffect(() => {
    if (pricing.items && pricing.items.length > 0) {
      const initialCurrencyStates: Record<
        string,
        { selectedCurrency: string; displayedItem: PricingItem }
      > = {};

      pricing.items.forEach((item) => {
        const currencies = getCurrenciesFromItem(item);
        const selectedCurrency = getInitialCurrency(
          currencies,
          locale,
          item.currency
        );

        // Create displayed item with selected currency
        const currencyData = currencies.find(
          (c) => c.currency.toLowerCase() === selectedCurrency.toLowerCase()
        );

        const displayedItem = currencyData
          ? {
              ...item,
              currency: currencyData.currency,
              amount: currencyData.amount,
              price: currencyData.price,
              original_price: currencyData.original_price,
              // Override with currency-specific payment settings if available
              payment_product_id:
                currencyData.payment_product_id || item.payment_product_id,
              payment_providers:
                currencyData.payment_providers || item.payment_providers,
            }
          : item;

        initialCurrencyStates[item.product_id] = {
          selectedCurrency,
          displayedItem,
        };
      });

      setItemCurrencies(initialCurrencyStates);
    }
  }, [pricing.items, locale]);

  // Handler for currency change
  const handleCurrencyChange = (productId: string, currency: string) => {
    const item = pricing.items?.find((i) => i.product_id === productId);
    if (!item) return;

    const currencies = getCurrenciesFromItem(item);
    const currencyData = currencies.find(
      (c) => c.currency.toLowerCase() === currency.toLowerCase()
    );

    if (currencyData) {
      const displayedItem = {
        ...item,
        currency: currencyData.currency,
        amount: currencyData.amount,
        price: currencyData.price,
        original_price: currencyData.original_price,
        // Override with currency-specific payment settings if available
        payment_product_id:
          currencyData.payment_product_id || item.payment_product_id,
        payment_providers:
          currencyData.payment_providers || item.payment_providers,
      };

      setItemCurrencies((prev) => ({
        ...prev,
        [productId]: {
          selectedCurrency: currency,
          displayedItem,
        },
      }));
    }
  };

  const handlePayment = async (item: PricingItem) => {
    if (!user) {
      setIsShowSignModal(true);
      return;
    }

    // Use displayed item with selected currency
    const displayedItem =
      itemCurrencies[item.product_id]?.displayedItem || item;

    // Always direct checkout to avoid extra modal steps
    handleCheckout(displayedItem, configs.default_payment_provider);
  };

  const getAffiliateMetadata = ({
    paymentProvider,
  }: {
    paymentProvider: string;
  }) => {
    const affiliateMetadata: Record<string, string> = {};

    // get Affonso referral
    if (
      configs.affonso_enabled === 'true' &&
      ['stripe', 'creem'].includes(paymentProvider)
    ) {
      const affonsoReferral = getCookie('affonso_referral') || '';
      affiliateMetadata.affonso_referral = affonsoReferral;
    }

    // get PromoteKit referral
    if (
      configs.promotekit_enabled === 'true' &&
      ['stripe'].includes(paymentProvider)
    ) {
      const promotekitReferral =
        typeof window !== 'undefined' && (window as any).promotekit_referral
          ? (window as any).promotekit_referral
          : getCookie('promotekit_referral') || '';
      affiliateMetadata.promotekit_referral = promotekitReferral;
    }

    return affiliateMetadata;
  };

  const handleCheckout = async (
    item: PricingItem,
    paymentProvider?: string,
    forceCny: boolean = false
  ) => {
    try {
      if (!user) {
        setIsShowSignModal(true);
        return;
      }

      const affiliateMetadata = getAffiliateMetadata({
        paymentProvider: paymentProvider || '',
      });

      const params = {
        product_id: item.product_id,
        currency: forceCny ? 'CNY' : item.currency,
        locale: locale || 'en',
        payment_provider: paymentProvider || '',
        metadata: affiliateMetadata,
      };

      setIsLoading(true);
      setProductId(item.product_id);

      const response = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (response.status === 401) {
        setIsLoading(false);
        setProductId(null);
        // setPricingItem(null); // Fix: Removed undefined function call
        setIsShowSignModal(true);
        return;
      }

      if (!response.ok) {
        throw new Error(`request failed with status ${response.status}`);
      }

      const { code, message, data } = await response.json();
      if (code !== 0) {
        throw new Error(message);
      }

      const { checkoutUrl } = data;
      if (!checkoutUrl) {
        throw new Error('checkout url not found');
      }

      window.location.href = checkoutUrl;
    } catch (e: any) {
      console.log('checkout failed: ', e);
      toast.error('checkout failed: ' + e.message);

      setIsLoading(false);
      setProductId(null);
    }
  };

  useEffect(() => {
    if (pricing.items) {
      const featuredItem = pricing.items.find((i) => i.is_featured);
      setProductId(featuredItem?.product_id || pricing.items[0]?.product_id);
      setIsLoading(false);
    }
  }, [pricing.items]);

  return (
    <section
      id={pricing.id}
      className={cn('py-24 md:py-36', pricing.className, className)}
    >
      <div className="mx-auto mb-12 px-4 text-center md:px-8">
        {pricing.sr_only_title && (
          <h1 className="sr-only">{pricing.sr_only_title}</h1>
        )}
        <h2 className="mb-6 text-3xl font-bold text-pretty lg:text-4xl">
          {pricing.title}
        </h2>
        <p className="text-muted-foreground mx-auto mb-4 max-w-xl lg:max-w-none lg:text-lg">
          {pricing.description}
        </p>
      </div>

      <div className="container">
        {/* 
          月付/年付切换按钮区域
          业务说明：这个切换按钮让用户可以在月付和年付之间快速切换
          - 点击 "Pay monthly" 会显示所有月付方案（group === 'monthly'）
          - 点击 "Pay yearly" 会显示所有年付方案（group === 'yearly'）
          - 选中的按钮会高亮显示，未选中的按钮显示为灰色
        */}
        {pricing.groups && pricing.groups.length > 0 && (
          <div className="mx-auto mt-8 mb-16 flex w-full justify-center md:max-w-lg">
            <div className="border-border/60 bg-muted/60 inline-flex items-center gap-2 rounded-full border px-1 py-1 text-xs">
              {/* 月付按钮 */}
              <button
                type="button"
                onClick={() => setGroup('monthly')}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  group === 'monthly'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Pay monthly
              </button>

              {/* 中间提示文案：年付更省钱（仅在中等以上屏幕显示） */}
              <span className="text-muted-foreground hidden text-[11px] md:inline">
                Save more with annual billing
              </span>

              {/* 年付按钮 */}
              <button
                type="button"
                onClick={() => setGroup('yearly')}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  group === 'yearly'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Pay yearly
              </button>
            </div>
          </div>
        )}

        <div
          className={`mt-0 grid w-full gap-6 md:grid-cols-${
            visibleItems.length
          }`}
        >
          {visibleItems.map((item: PricingItem, idx) => {
            let isCurrentPlan = false;
            if (
              currentSubscription &&
              currentSubscription.productId === item.product_id
            ) {
              isCurrentPlan = true;
            }

            // Get currency state for this item
            const currencyState = itemCurrencies[item.product_id];
            const displayedItem = currencyState?.displayedItem || item;
            const selectedCurrency =
              currencyState?.selectedCurrency || item.currency;
            const currencies = getCurrenciesFromItem(item);

            return (
              <Card key={idx} className="relative">
                {item.label && (
                  <span className="from-primary/80 absolute inset-x-0 -top-3 mx-auto flex h-6 w-fit items-center rounded-full bg-linear-to-br/increasing to-amber-300 px-3 py-1 text-xs font-medium text-amber-950 ring-1 ring-white/20 ring-offset-1 ring-offset-gray-950/5 ring-inset">
                    {item.label}
                  </span>
                )}

                <CardHeader>
                  {/* 付款方式标签：在卡片最显眼位置区分 Pay monthly / Pay annually */}
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-semibold',
                        item.interval === 'year'
                          ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                          : 'bg-muted text-foreground/80 border-border/60 border'
                      )}
                    >
                      {item.interval === 'year'
                        ? 'Pay annually'
                        : 'Pay monthly'}
                    </span>
                    {item.interval === 'year' && (
                      <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[11px] font-bold text-emerald-950">
                        Save 30%
                      </span>
                    )}
                  </div>

                  <CardTitle className="font-medium">
                    <h3 className="text-base font-semibold">{item.title}</h3>
                  </CardTitle>

                  <div className="my-3 flex items-baseline gap-2">
                    {displayedItem.original_price && (
                      <span className="text-muted-foreground text-sm line-through">
                        {displayedItem.original_price}
                      </span>
                    )}

                    <div className="my-3 block text-2xl font-semibold">
                      <span className="text-primary">
                        {displayedItem.price}
                      </span>{' '}
                      {displayedItem.unit ? (
                        <span className="text-muted-foreground text-sm font-normal">
                          {displayedItem.unit}
                        </span>
                      ) : (
                        ''
                      )}
                    </div>

                  </div>

                  <CardDescription className="text-sm">
                    {item.description}
                  </CardDescription>
                  {item.tip && (
                    <span className="text-muted-foreground text-sm">
                      {item.tip}
                    </span>
                  )}

                  {locale === 'zh' && item.cn_amount && item.cn_amount > 0 && (
                    <div className="text-muted-foreground mt-4 flex items-center justify-start gap-2 text-xs">
                      <span>{t('or_pay_with') || 'Or pay with'}</span>
                      <button
                        type="button"
                        onClick={() => handleCheckout(item, undefined, true)}
                        className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-2 rounded-md border px-2 py-1 transition-colors"
                      >
                        <SmartIcon
                          name="RiWechatPayFill"
                          className="size-5 text-[#09B83E]"
                        />
                        <SmartIcon
                          name="RiAlipayFill"
                          className="size-5 text-[#1678FF]"
                        />
                      </button>
                    </div>
                  )}

                  {isCurrentPlan ? (
                    <Button
                      variant="outline"
                      className="mt-4 h-9 w-full px-4 py-2"
                      disabled
                    >
                      <span className="hidden text-sm md:block">
                        {t('current_plan')}
                      </span>
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handlePayment(item)}
                      disabled={isLoading}
                      className={cn(
                        'focus-visible:ring-ring inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                        'mt-4 h-9 w-full px-4 py-2',
                        'bg-primary text-primary-foreground hover:bg-primary/90 border-[0.5px] border-white/25 shadow-md shadow-black/20'
                      )}
                    >
                      {isLoading && item.product_id === productId ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          <span className="block">{t('processing')}</span>
                        </>
                      ) : (
                        <>
                          {item.button?.icon && (
                            <SmartIcon
                              name={item.button?.icon as string}
                              className="size-4"
                            />
                          )}
                          <span className="block">{item.button?.title}</span>
                        </>
                      )}
                    </Button>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  <hr className="border-dashed" />

                  {item.features_title && (
                    <p className="text-sm font-medium">{item.features_title}</p>
                  )}
                  <ul className="list-outside space-y-3 text-sm">
                    {item.features?.map((item, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <Check className="size-3" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
