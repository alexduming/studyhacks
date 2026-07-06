import { getTranslations } from 'next-intl/server';

import {
  PaymentInterval,
  PaymentOrder,
  PaymentPrice,
  PaymentType,
} from '@/extensions/payment';
import {
  diffPlanCredits,
  getCanonicalPlanInfo,
} from '@/shared/config/pricing-guard';
import { getSnowId, getUuid } from '@/shared/lib/hash';
import {
  getPlanTier,
  getYearlyCycleInfo,
  isPaidMembershipProduct,
  YearlyUpgradeContext,
} from '@/shared/lib/membership-upgrade';
import { respData, respErr } from '@/shared/lib/resp';
import { getAllConfigs } from '@/shared/models/config';
import {
  createOrder,
  NewOrder,
  OrderStatus,
  updateOrderByOrderNo,
} from '@/shared/models/order';
import { getCurrentSubscription } from '@/shared/models/subscription';
import { getUserInfo } from '@/shared/models/user';
import { getInvitationByInviteeId } from '@/shared/models/invitation';
import { getPaymentService } from '@/shared/services/payment';
import { PricingCurrency } from '@/shared/types/blocks/pricing';

export async function POST(req: Request) {
  try {
    const { product_id, currency, locale, payment_provider, metadata } =
      await req.json();
    if (!product_id) {
      return respErr('product_id is required');
    }

    const t = await getTranslations({
      locale: locale || 'en',
      namespace: 'pricing',
    });
    const pricing = t.raw('pricing');

    const pricingItem = pricing.items.find(
      (item: any) => item.product_id === product_id
    );

    if (!pricingItem) {
      return respErr('pricing item not found');
    }

    if (!pricingItem.product_id && !pricingItem.amount) {
      return respErr('invalid pricing item');
    }

    // get sign user
    const user = await getUserInfo();
    if (!user || !user.email) {
      return respErr('no auth, please sign in');
    }

    // get configs
    const configs = await getAllConfigs();

    // choose payment provider
    let paymentProviderName = payment_provider || '';
    if (!paymentProviderName) {
      paymentProviderName = configs.default_payment_provider;
    }
    if (!paymentProviderName) {
      return respErr('no payment provider configured');
    }

    // Validate payment provider against allowed providers
    // First check currency-specific payment_providers if currency is provided
    let allowedProviders: string[] | undefined;

    if (
      currency &&
      currency.toLowerCase() !== (pricingItem.currency || 'usd').toLowerCase()
    ) {
      const selectedCurrencyData = pricingItem.currencies?.find(
        (c: PricingCurrency) =>
          c.currency.toLowerCase() === currency.toLowerCase()
      );
      allowedProviders = selectedCurrencyData?.payment_providers;
    }

    // Fallback to default payment_providers if not found in currency config
    if (!allowedProviders || allowedProviders.length === 0) {
      allowedProviders = pricingItem.payment_providers;
    }

    // If payment_providers is configured, validate the selected provider
    if (allowedProviders && allowedProviders.length > 0) {
      if (!allowedProviders.includes(paymentProviderName)) {
        return respErr(
          `payment provider ${paymentProviderName} is not supported for this currency`
        );
      }
    }

    // get default payment provider
    const paymentService = await getPaymentService();

    const paymentProvider = paymentService.getProvider(paymentProviderName);
    if (!paymentProvider || !paymentProvider.name) {
      return respErr('no payment provider configured');
    }

    // checkout currency and amount - calculate from server-side data only (never trust client input)
    // Security: currency can be provided by frontend, but amount must be calculated server-side
    const defaultCurrency = (pricingItem.currency || 'usd').toLowerCase();
    let checkoutCurrency = defaultCurrency;
    let checkoutAmount = pricingItem.amount;

    // If currency is provided, validate it and find corresponding amount from server-side data
    if (currency) {
      const requestedCurrency = currency.toLowerCase();

      // Check if requested currency is the default currency
      if (requestedCurrency === defaultCurrency) {
        checkoutCurrency = defaultCurrency;
        checkoutAmount = pricingItem.amount;
      } else if (pricingItem.currencies && pricingItem.currencies.length > 0) {
        // Find amount for the requested currency in currencies list
        const selectedCurrencyData = pricingItem.currencies.find(
          (c: PricingCurrency) => c.currency.toLowerCase() === requestedCurrency
        );
        if (selectedCurrencyData) {
          // Valid currency found, use it
          checkoutCurrency = requestedCurrency;
          checkoutAmount = selectedCurrencyData.amount;
        }
        // If currency not found in list, fallback to default (already set above)
      }
      // If no currencies list exists, fallback to default (already set above)
    }

    const membershipInterval: PaymentInterval =
      pricingItem.interval || PaymentInterval.ONE_TIME;
    let paymentInterval = membershipInterval;
    let paymentType =
      membershipInterval === PaymentInterval.ONE_TIME
        ? PaymentType.ONE_TIME
        : PaymentType.SUBSCRIPTION;

    // CNY checkout must be one-time, but the membership interval should stay
    // aligned with the purchased plan so yearly memberships still last a year.
    if (checkoutCurrency.toLowerCase() === 'cny') {
      paymentType = PaymentType.ONE_TIME;
    }

    let upgradeContext: YearlyUpgradeContext | null = null;
    const currentSubscription = await getCurrentSubscription(user.id);

    if (
      paymentInterval === PaymentInterval.YEAR &&
      currentSubscription &&
      currentSubscription.userId === user.id &&
      currentSubscription.subscriptionNo &&
      currentSubscription.interval === PaymentInterval.YEAR &&
      isPaidMembershipProduct(currentSubscription.productId) &&
      isPaidMembershipProduct(pricingItem.product_id) &&
      getPlanTier(pricingItem.product_id) > getPlanTier(currentSubscription.productId)
    ) {
      const currentPricingItem = pricing.items.find(
        (item: any) => item.product_id === currentSubscription.productId
      );
      const currentPlanAmount = currentPricingItem
        ? getPricingAmountForCurrency(currentPricingItem, checkoutCurrency)
        : null;
      const targetPlanAmount = getPricingAmountForCurrency(
        pricingItem,
        checkoutCurrency
      );
      const canCreateProratedUpgradeCharge = paymentProviderName !== 'creem';

      if (
        canCreateProratedUpgradeCharge &&
        typeof currentPlanAmount === 'number' &&
        currentPlanAmount > 0 &&
        typeof targetPlanAmount === 'number' &&
        targetPlanAmount > currentPlanAmount
      ) {
        const currentPeriodStart = new Date(currentSubscription.currentPeriodStart);
        const currentPeriodEnd = new Date(currentSubscription.currentPeriodEnd);
        const now = new Date();
        const totalMs =
          currentPeriodEnd.getTime() - currentPeriodStart.getTime();
        const remainingMs = currentPeriodEnd.getTime() - now.getTime();

        if (totalMs > 0 && remainingMs > 0) {
          const currentPlanInfo = getCanonicalPlanInfo(
            currentSubscription.productId || ''
          );
          const targetPlanInfo = getCanonicalPlanInfo(pricingItem.product_id);

          if (currentPlanInfo && targetPlanInfo) {
            const cycleInfo = getYearlyCycleInfo({
              currentPeriodStart,
              currentPeriodEnd,
              now,
            });

            upgradeContext = {
              mode: 'yearly_prorated',
              sourceSubscriptionNo: currentSubscription.subscriptionNo || '',
              sourceProductId: currentSubscription.productId || '',
              currentPeriodStart: currentPeriodStart.toISOString(),
              currentPeriodEnd: currentPeriodEnd.toISOString(),
	              currentCycleStart: cycleInfo.currentCycleStart.toISOString(),
	              currentCycleEnd: cycleInfo.currentCycleEnd.toISOString(),
	              currentMonthNumber: cycleInfo.currentMonthNumber,
	              currentPlanAmount,
	              targetPlanAmount,
	              proratedAmount: Math.max(
	                1,
	                Math.ceil(
	                  ((targetPlanAmount - currentPlanAmount) * remainingMs) / totalMs
	                )
	              ),
	              immediateCreditsDelta:
	                (targetPlanInfo.credits ?? 0) - (currentPlanInfo.credits ?? 0),
	            };

            checkoutAmount = upgradeContext.proratedAmount;
            paymentType = PaymentType.ONE_TIME;
            paymentInterval = membershipInterval;
          }
        }
      }
    }

    const orderNo = getSnowId();

    // get payment product id from pricing table in local file
    // First try to get currency-specific payment_product_id
    let paymentProductId = '';

    // If currency is provided and different from default, check currency-specific payment_product_id
    if (currency && currency.toLowerCase() !== defaultCurrency) {
      const selectedCurrencyData = pricingItem.currencies?.find(
        (c: PricingCurrency) =>
          c.currency.toLowerCase() === currency.toLowerCase()
      );
      if (selectedCurrencyData?.payment_product_id) {
        paymentProductId = selectedCurrencyData.payment_product_id;
      }
    }

    // Fallback to default payment_product_id if not found in currency config
    if (!paymentProductId) {
      paymentProductId = pricingItem.payment_product_id || '';
    }

    // If still not found, get from payment provider's config
    if (!paymentProductId) {
      paymentProductId = await getPaymentProductId(
        pricingItem.product_id,
        paymentProviderName,
        checkoutCurrency
      );
    }

    // build checkout price with correct amount for selected currency
    const checkoutPrice: PaymentPrice = {
      amount: checkoutAmount,
      currency: checkoutCurrency,
    };

    if (!paymentProductId) {
      // checkout price validation
      if (!checkoutPrice.amount || !checkoutPrice.currency) {
        return respErr('invalid checkout price');
      }
    } else {
      paymentProductId = paymentProductId.trim();
    }

    let callbackBaseUrl = `${configs.app_url}`;
    if (locale && locale !== configs.default_locale) {
      callbackBaseUrl += `/${locale}`;
    }

    const callbackUrl =
      paymentType === PaymentType.SUBSCRIPTION || upgradeContext
        ? `${callbackBaseUrl}/settings/billing`
        : `${callbackBaseUrl}/settings/payments`;

    // build checkout order
    const checkoutOrder: PaymentOrder & {
      upgradeContext?: YearlyUpgradeContext;
    } = {
      description: upgradeContext
        ? `${pricingItem.product_name} upgrade`
        : pricingItem.product_name,
      customer: {
        name: user.name,
        email: user.email,
      },
      type: paymentType,
      metadata: {
        app_name: configs.app_name,
        order_no: orderNo,
        user_id: user.id,
        ...(upgradeContext
          ? {
              membership_upgrade_mode: upgradeContext.mode,
              membership_upgrade_from: upgradeContext.sourceProductId,
            }
          : {}),
        ...(metadata || {}),
      },
      successUrl: `${configs.app_url}/api/payment/callback?order_no=${orderNo}`,
      cancelUrl: `${callbackBaseUrl}/pricing`,
    };

    if (upgradeContext) {
      checkoutOrder.upgradeContext = upgradeContext;
    }

    // checkout with predefined product
    if (paymentProductId) {
      checkoutOrder.productId = paymentProductId;
    }

    // checkout dynamically
    checkoutOrder.price = checkoutPrice;
    if (paymentType === PaymentType.SUBSCRIPTION) {
      // subscription mode
      checkoutOrder.plan = {
        interval: paymentInterval,
        name: pricingItem.product_name,
      };
    } else {
      // one-time mode
    }

    const currentTime = new Date();

    // build order info
    const canonicalPlan = getCanonicalPlanInfo(pricingItem.product_id);
    if (!canonicalPlan) {
      return respErr('unsupported pricing product');
    }

    const diffWarn = diffPlanCredits(pricingItem);
    if (diffWarn) {
      console.warn(diffWarn);
    }

    // 分销系统：查询用户的推荐人
    // 如果用户是通过邀请码注册的，记录推荐人ID到订单中
    let referrerId: string | null = null;
    try {
      const invitation = await getInvitationByInviteeId(user.id);
      if (invitation && invitation.inviterId) {
        referrerId = invitation.inviterId;
      }
    } catch (e) {
      console.error('Failed to get referrer:', e);
    }

    const order: NewOrder = {
      id: getUuid(),
      orderNo: orderNo,
      userId: user.id,
      userEmail: user.email,
      status: OrderStatus.PENDING,
      amount: checkoutAmount, // use the amount for selected currency
      currency: checkoutCurrency,
      productId: pricingItem.product_id,
      paymentType: paymentType,
      paymentInterval: paymentInterval,
      paymentProvider: paymentProvider.name,
      checkoutInfo: JSON.stringify(checkoutOrder),
      createdAt: currentTime,
      productName: pricingItem.product_name,
      description: upgradeContext
        ? `${currentSubscription?.planName || currentSubscription?.productName || 'Current plan'} -> ${pricingItem.plan_name || pricingItem.product_name}`
        : pricingItem.description,
      callbackUrl: callbackUrl,
      creditsAmount: upgradeContext ? 0 : canonicalPlan.credits,
      creditsValidDays: canonicalPlan.valid_days,
      planName: pricingItem.plan_name || '',
      paymentProductId: paymentProductId,
      referrerId: referrerId, // 分销系统：记录推荐人ID
    };

    // create order
    await createOrder(order);

    try {
      // create payment
      const result = await paymentProvider.createPayment({
        order: checkoutOrder,
      });

      // update order status to created, waiting for payment
      await updateOrderByOrderNo(orderNo, {
        status: OrderStatus.CREATED, // means checkout created, waiting for payment
        checkoutInfo: JSON.stringify({
          ...result.checkoutParams,
          ...(upgradeContext ? { upgradeContext } : {}),
        }),
        checkoutResult: JSON.stringify(result.checkoutResult),
        checkoutUrl: result.checkoutInfo.checkoutUrl,
        paymentSessionId: result.checkoutInfo.sessionId,
        paymentProvider: result.provider,
      });

      return respData(result.checkoutInfo);
    } catch (e: any) {
      // update order status to completed, means checkout failed
      await updateOrderByOrderNo(orderNo, {
        status: OrderStatus.COMPLETED, // means checkout failed
        checkoutInfo: JSON.stringify(checkoutOrder),
      });

      return respErr('checkout failed: ' + e.message);
    }
  } catch (e: any) {
    console.log('checkout failed:', e);
    return respErr('checkout failed: ' + e.message);
  }
}

// get payemt product id from payment provider's config
async function getPaymentProductId(
  productId: string,
  provider: string,
  checkoutCurrency: string
) {
  if (provider !== 'creem') {
    // currently only creem supports payment product id mapping
    return;
  }

  try {
    const configs = await getAllConfigs();
    const creemProductIds = configs.creem_product_ids;
    if (creemProductIds) {
      const productIds = JSON.parse(creemProductIds);
      return (
        productIds[`${productId}_${checkoutCurrency}`] || productIds[productId]
      );
    }
  } catch (e: any) {
    console.log('get payment product id failed:', e);
    return;
  }
}

function getPricingAmountForCurrency(
  pricingItem: any,
  checkoutCurrency: string
): number | null {
  const defaultCurrency = (pricingItem.currency || 'usd').toLowerCase();
  if (checkoutCurrency.toLowerCase() === defaultCurrency) {
    return pricingItem.amount;
  }

  const currencyItem = pricingItem.currencies?.find(
    (item: PricingCurrency) =>
      item.currency.toLowerCase() === checkoutCurrency.toLowerCase()
  );

  return typeof currencyItem?.amount === 'number' ? currencyItem.amount : null;
}
