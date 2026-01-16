import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import {
  order as orderTable,
  subscription as subscriptionTable,
  credit as creditTable,
  user as userTable,
} from '@/config/db/schema';
import { getSnowId, getUuid } from '@/shared/lib/hash';
import {
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
  NewCredit,
  calculateCreditExpirationTime,
} from '@/shared/models/credit';
import {
  NewOrder,
  Order,
  OrderStatus,
  UpdateOrder,
  updateOrderByOrderNo,
  updateOrderInTransaction,
} from '@/shared/models/order';
import {
  PaymentSession,
  PaymentStatus,
  PaymentType,
} from '@/extensions/payment';
import {
  NewSubscription,
  Subscription,
  SubscriptionStatus,
} from '@/shared/models/subscription';
// 联盟功能暂时禁用 - 需要时取消注释
// import { getInvitationByInviteeId } from '@/shared/models/invitation';
// import { createCommission, CommissionStatus } from '@/shared/models/commission';

/**
 * payment manager
 */
export class PaymentManager {
  private providers: Map<string, any> = new Map();

  constructor() {}

  registerProvider(name: string, provider: any) {
    this.providers.set(name, provider);
  }

  getProvider(name: string) {
    return this.providers.get(name);
  }
}

let paymentService: PaymentManager | null = null;

export async function getPaymentService(): Promise<PaymentManager> {
  if (paymentService) {
    return paymentService;
  }

  paymentService = new PaymentManager();

  // dynamic import to avoid circular dependency
  const { StripeProvider } = await import('@/extensions/payment/stripe');
  const { CreemProvider } = await import('@/extensions/payment/creem');
  const { PayPalProvider } = await import('@/extensions/payment/paypal');
  const { getAllConfigs } = await import('@/shared/models/config');

  const configs = await getAllConfigs();

  if (configs.stripe_enabled === 'true') {
    paymentService.registerProvider(
      'stripe',
      new StripeProvider({
        secretKey: configs.stripe_secret_key,
        publishableKey: configs.stripe_publishable_key,
        signingSecret: configs.stripe_signing_secret || configs.stripe_webhook_secret,
        allowedPaymentMethods: configs.stripe_payment_methods ? JSON.parse(configs.stripe_payment_methods) : ['card'],
      })
    );
  }

  if (configs.creem_enabled === 'true') {
    paymentService.registerProvider(
      'creem',
      new CreemProvider({
        apiKey: configs.creem_api_key,
        signingSecret: configs.creem_signing_secret || configs.creem_webhook_secret,
        environment: (configs.creem_environment as 'sandbox' | 'production') || 'sandbox',
      })
    );
  }

  if (configs.paypal_enabled === 'true') {
    paymentService.registerProvider(
      'paypal',
      new PayPalProvider({
        clientId: configs.paypal_client_id,
        clientSecret: configs.paypal_client_secret,
        webhookSecret: configs.paypal_webhook_id || configs.paypal_signing_secret,
        environment: (configs.paypal_environment as 'sandbox' | 'production') || 'sandbox',
      })
    );
  }

  return paymentService;
}

/**
 * handle checkout success
 */
export async function handleCheckoutSuccess({
  order,
  session,
}: {
  order: Order; // checkout order
  session: PaymentSession; // payment session
}) {
  const orderNo = order.orderNo;
  if (!orderNo) {
    throw new Error('invalid order');
  }

  if (order.paymentType === PaymentType.SUBSCRIPTION) {
    if (!session.subscriptionId || !session.subscriptionInfo) {
      throw new Error('subscription id or subscription info not found');
    }
  }

  // payment success
  if (session.paymentStatus === PaymentStatus.SUCCESS) {
    // update order status to be paid
    const updateOrder: UpdateOrder = {
      status: OrderStatus.PAID,
      paymentResult: JSON.stringify(session.paymentResult),
      paymentAmount: session.paymentInfo?.paymentAmount,
      paymentCurrency: session.paymentInfo?.paymentCurrency,
      discountAmount: session.paymentInfo?.discountAmount,
      discountCurrency: session.paymentInfo?.discountCurrency,
      discountCode: session.paymentInfo?.discountCode,
      paymentEmail: session.paymentInfo?.paymentEmail,
      paidAt: session.paymentInfo?.paidAt,
      invoiceId: session.paymentInfo?.invoiceId,
      invoiceUrl: session.paymentInfo?.invoiceUrl,
      subscriptionNo: '',
      transactionId: session.paymentInfo?.transactionId,
      paymentUserName: session.paymentInfo?.paymentUserName,
      paymentUserId: session.paymentInfo?.paymentUserId,
    };

    // new subscription
    let newSubscription: NewSubscription | undefined = undefined;
    const subscriptionInfo = session.subscriptionInfo;

    // subscription first payment
    if (subscriptionInfo) {
      // new subscription
      newSubscription = {
        id: getUuid(),
        subscriptionNo: getSnowId(),
        userId: order.userId,
        userEmail: order.paymentEmail || order.userEmail,
        orderId: order.id,
        planId: order.productId || '',
        status: subscriptionInfo.status || SubscriptionStatus.ACTIVE,
        paymentProvider: order.paymentProvider,
        subscriptionId: subscriptionInfo.subscriptionId,
        subscriptionResult: JSON.stringify(session.subscriptionResult),
        productId: order.productId,
        description: subscriptionInfo.description || 'Subscription Created',
        amount: subscriptionInfo.amount,
        currency: subscriptionInfo.currency,
        interval: subscriptionInfo.interval,
        intervalCount: subscriptionInfo.intervalCount,
        trialPeriodDays: subscriptionInfo.trialPeriodDays,
        currentPeriodStart: subscriptionInfo.currentPeriodStart,
        currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
        billingUrl: subscriptionInfo.billingUrl,
        planName: order.planName || order.productName,
        productName: order.productName,
        creditsAmount: order.creditsAmount,
        creditsValidDays: order.creditsValidDays,
        paymentProductId: order.paymentProductId,
        paymentUserId: session.paymentInfo?.paymentUserId,
      };

      updateOrder.subscriptionNo = newSubscription.subscriptionNo;
      updateOrder.subscriptionId = session.subscriptionId;
      updateOrder.subscriptionResult = JSON.stringify(
        session.subscriptionResult
      );
    }

    // grant credit for order
    let newCredit: NewCredit | undefined = undefined;
    if (order.creditsAmount && order.creditsAmount > 0) {
      const credits = order.creditsAmount;
      const expiresAt =
        credits > 0
          ? calculateCreditExpirationTime({
              creditsValidDays: order.creditsValidDays || 0,
              currentPeriodEnd: subscriptionInfo?.currentPeriodEnd,
            })
          : null;

      newCredit = {
        id: getUuid(),
        userId: order.userId,
        userEmail: order.userEmail,
        orderNo: order.orderNo,
        subscriptionNo: newSubscription?.subscriptionNo,
        transactionNo: getSnowId(),
        transactionType: CreditTransactionType.GRANT,
        transactionScene:
          order.paymentType === PaymentType.SUBSCRIPTION
            ? CreditTransactionScene.SUBSCRIPTION
            : CreditTransactionScene.PAYMENT,
        credits: credits,
        remainingCredits: credits,
        description: `Grant credit`,
        expiresAt: expiresAt,
        status: CreditStatus.ACTIVE,
      };
    }

    // --- Affiliate Commission Logic Start ---
    // 联盟功能暂时禁用 - 需要时取消注释
    /*
    try {
      // 1. Check if user was invited
      const invitation = await getInvitationByInviteeId(order.userId);
      
      if (invitation && invitation.inviterId) {
        // 2. Calculate commission (e.g. 20%)
        // TODO: Get rate from config
        const commissionRate = 0.20; 
        const commissionAmount = Math.floor(order.amount * commissionRate);

        if (commissionAmount > 0) {
          // 3. Create commission record
          await createCommission({
            id: getUuid(),
            userId: invitation.inviterId,
            orderId: order.id,
            amount: commissionAmount,
            currency: order.currency,
            status: CommissionStatus.PAID, // Auto-approve for now, or use PENDING if manual approval needed
            type: 'one_time',
            rate: '20%',
            description: `Commission for order ${order.orderNo}`,
          });

          console.log(`✅ Commission created for inviter ${invitation.inviterId}: ${commissionAmount} ${order.currency}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to process affiliate commission:', error);
      // Don't fail the payment flow if commission fails
    }
    */
    // --- Affiliate Commission Logic End ---

    await updateOrderInTransaction({
      orderNo,
      updateOrder,
      newSubscription,
      newCredit,
    });
  } else if (
    session.paymentStatus === PaymentStatus.FAILED ||
    session.paymentStatus === PaymentStatus.CANCELED
  ) {
    // update order status to be failed
    await updateOrderByOrderNo(orderNo, {
      status: OrderStatus.FAILED,
      paymentResult: JSON.stringify(session.paymentResult),
    });
  } else if (session.paymentStatus === PaymentStatus.PROCESSING) {
    // update order payment result
    await updateOrderByOrderNo(orderNo, {
      paymentResult: JSON.stringify(session.paymentResult),
    });
  } else {
    throw new Error('unknown payment status');
  }
}

/**
 * handle payment success
 */
export async function handlePaymentSuccess({
  order,
  session,
}: {
  order: Order; // checkout order
  session: PaymentSession; // payment session
}) {
  const orderNo = order.orderNo;
  if (!orderNo) {
    throw new Error('invalid order');
  }

  if (order.paymentType === PaymentType.SUBSCRIPTION) {
    if (!session.subscriptionId || !session.subscriptionInfo) {
      throw new Error('subscription id or subscription info not found');
    }
  }

  // payment success
  if (session.paymentStatus === PaymentStatus.SUCCESS) {
    // update order status to be paid
    const updateOrder: UpdateOrder = {
      status: OrderStatus.PAID,
      paymentResult: JSON.stringify(session.paymentResult),
      paymentAmount: session.paymentInfo?.paymentAmount,
      paymentCurrency: session.paymentInfo?.paymentCurrency,
      discountAmount: session.paymentInfo?.discountAmount,
      discountCurrency: session.paymentInfo?.discountCurrency,
      discountCode: session.paymentInfo?.discountCode,
      paymentEmail: session.paymentInfo?.paymentEmail,
      paymentUserName: session.paymentInfo?.paymentUserName,
      paymentUserId: session.paymentInfo?.paymentUserId,
      paidAt: session.paymentInfo?.paidAt,
      invoiceId: session.paymentInfo?.invoiceId,
      invoiceUrl: session.paymentInfo?.invoiceUrl,
    };

    // new subscription
    let newSubscription: NewSubscription | undefined = undefined;
    const subscriptionInfo = session.subscriptionInfo;

    // subscription first payment
    if (subscriptionInfo) {
      // new subscription
      newSubscription = {
        id: getUuid(),
        subscriptionNo: getSnowId(),
        userId: order.userId,
        userEmail: order.paymentEmail || order.userEmail,
        orderId: order.id,
        planId: order.productId || '',
        status: SubscriptionStatus.ACTIVE,
        paymentProvider: order.paymentProvider,
        subscriptionId: subscriptionInfo.subscriptionId,
        subscriptionResult: JSON.stringify(session.subscriptionResult),
        productId: order.productId,
        description: subscriptionInfo.description,
        amount: subscriptionInfo.amount,
        currency: subscriptionInfo.currency,
        interval: subscriptionInfo.interval,
        intervalCount: subscriptionInfo.intervalCount,
        trialPeriodDays: subscriptionInfo.trialPeriodDays,
        currentPeriodStart: subscriptionInfo.currentPeriodStart,
        currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
        planName: order.planName || order.productName,
        billingUrl: subscriptionInfo.billingUrl,
        productName: order.productName,
        creditsAmount: order.creditsAmount,
        creditsValidDays: order.creditsValidDays,
        paymentProductId: order.paymentProductId,
        paymentUserId: session.paymentInfo?.paymentUserId,
      };

      updateOrder.subscriptionId = session.subscriptionId;
      updateOrder.subscriptionResult = JSON.stringify(
        session.subscriptionResult
      );
    }

    // grant credit for order
    let newCredit: NewCredit | undefined = undefined;
    if (order.creditsAmount && order.creditsAmount > 0) {
      const credits = order.creditsAmount;
      const expiresAt =
        credits > 0
          ? calculateCreditExpirationTime({
              creditsValidDays: order.creditsValidDays || 0,
              currentPeriodEnd: subscriptionInfo?.currentPeriodEnd,
            })
          : null;

      newCredit = {
        id: getUuid(),
        userId: order.userId,
        userEmail: order.userEmail,
        orderNo: order.orderNo,
        subscriptionNo: newSubscription?.subscriptionNo,
        transactionNo: getSnowId(),
        transactionType: CreditTransactionType.GRANT,
        transactionScene:
          order.paymentType === PaymentType.SUBSCRIPTION
            ? CreditTransactionScene.SUBSCRIPTION
            : CreditTransactionScene.PAYMENT,
        credits: credits,
        remainingCredits: credits,
        description: `Grant credit`,
        expiresAt: expiresAt,
        status: CreditStatus.ACTIVE,
      };
    }

    // --- Affiliate Commission Logic Start ---
    // 联盟功能暂时禁用 - 需要时取消注释
    /*
    // Handle recurring payment commission if needed
    try {
        const invitation = await getInvitationByInviteeId(order.userId);
        
        if (invitation && invitation.inviterId) {
          // Recurring commission logic (optional, keeping it consistent with initial payment for now)
          const commissionRate = 0.20; 
          const commissionAmount = Math.floor(order.amount * commissionRate);
  
          if (commissionAmount > 0) {
            await createCommission({
              id: getUuid(),
              userId: invitation.inviterId,
              orderId: order.id,
              amount: commissionAmount,
              currency: order.currency,
              status: CommissionStatus.PAID,
              type: 'recurring',
              rate: '20%',
              description: `Recurring commission for order ${order.orderNo}`,
            });
            console.log(`✅ Recurring commission created for inviter ${invitation.inviterId}`);
          }
        }
      } catch (error) {
        console.error('❌ Failed to process recurring affiliate commission:', error);
      }
    */
    // --- Affiliate Commission Logic End ---

    await updateOrderInTransaction({
      orderNo,
      updateOrder,
      newSubscription,
      newCredit,
    });
  } else {
    throw new Error('unknown payment status');
  }
}

export async function handleSubscriptionRenewal({
  subscription,
  session,
}: {
  subscription: Subscription; // subscription
  session: PaymentSession; // payment session
}) {
  if (session.paymentStatus !== PaymentStatus.SUCCESS) {
    throw new Error('payment not success');
  }

  const orderNo = getSnowId();
  const subscriptionInfo = session.subscriptionInfo;

  if (!subscriptionInfo) {
    throw new Error('subscription info not found');
  }

  // create new order for renewal
  const order: NewOrder = {
    id: getUuid(),
    orderNo: orderNo,
    userId: subscription.userId,
    userEmail: subscription.userEmail,
    status: OrderStatus.PAID,
    amount: subscriptionInfo.amount ?? 0,
    currency: subscriptionInfo.currency ?? '',
    productId: subscription.productId,
    planName: subscription.planName,
    productName: subscription.productName,
    paymentType: PaymentType.SUBSCRIPTION,
    paymentInterval: subscriptionInfo.interval,
    paymentProvider: subscription.paymentProvider || '',
    paymentProductId: subscription.paymentProductId,
    paymentSessionId: session.metadata?.sessionId || '',
    checkoutInfo: JSON.stringify(session.metadata?.checkoutInfo || {}),
    paymentResult: JSON.stringify(session.paymentResult),
    transactionId: session.paymentInfo?.transactionId,
    subscriptionId: subscription.subscriptionId,
    subscriptionNo: subscription.subscriptionNo,
    subscriptionResult: JSON.stringify(session.subscriptionResult),
    paymentEmail: session.paymentInfo?.paymentEmail,
    paymentAmount: session.paymentInfo?.paymentAmount ?? 0,
    paymentCurrency: session.paymentInfo?.paymentCurrency ?? '',
    paidAt: session.paymentInfo?.paidAt,
    invoiceId: session.paymentInfo?.invoiceId,
    invoiceUrl: session.paymentInfo?.invoiceUrl,
    description: `Subscription Renewal: ${subscription.productName}`,
    creditsAmount: subscription.creditsAmount,
    creditsValidDays: subscription.creditsValidDays,
  };

  // grant credit
  let newCredit: NewCredit | undefined = undefined;
  if (order.creditsAmount && order.creditsAmount > 0) {
    const credits = order.creditsAmount;
    const expiresAt =
      credits > 0
        ? calculateCreditExpirationTime({
            creditsValidDays: order.creditsValidDays || 0,
            currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
          })
        : null;

    newCredit = {
      id: getUuid(),
      userId: order.userId,
      userEmail: order.userEmail,
      orderNo: order.orderNo,
      subscriptionNo: subscription.subscriptionNo,
      transactionNo: getSnowId(),
      transactionType: CreditTransactionType.GRANT,
      transactionScene: CreditTransactionScene.RENEWAL,
      credits: credits,
      remainingCredits: credits,
      description: `Grant credit for renewal`,
      expiresAt: expiresAt,
      status: CreditStatus.ACTIVE,
    };
  }

  // update subscription
  const updateSubscriptionData = {
    currentPeriodStart: subscriptionInfo.currentPeriodStart,
    currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
    status: subscriptionInfo.status || SubscriptionStatus.ACTIVE,
    subscriptionResult: JSON.stringify(session.subscriptionResult),
  };

  // --- Affiliate Commission Logic Start ---
  // 联盟功能暂时禁用 - 需要时取消注释
  /*
  // Handle renewal commission
  try {
    const invitation = await getInvitationByInviteeId(order.userId);
    
    if (invitation && invitation.inviterId) {
      const commissionRate = 0.20; 
      const commissionAmount = Math.floor(order.amount * commissionRate);

      if (commissionAmount > 0) {
        await createCommission({
          id: getUuid(),
          userId: invitation.inviterId,
          orderId: order.id,
          amount: commissionAmount,
          currency: order.currency,
          status: CommissionStatus.PAID,
          type: 'renewal',
          rate: '20%',
          description: `Renewal commission for subscription ${subscription.subscriptionNo}`,
        });
        console.log(`✅ Renewal commission created for inviter ${invitation.inviterId}`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to process renewal affiliate commission:', error);
  }
  */
  // --- Affiliate Commission Logic End ---

  // update in transaction
  const result = await db().transaction(async (tx) => {
    // create order
    await tx.insert(orderTable).values(order);

    // grant credit
    if (newCredit) {
      await tx.insert(creditTable).values(newCredit);
    }

    // update subscription
    await tx
      .update(subscriptionTable)
      .set(updateSubscriptionData)
      .where(eq(subscriptionTable.id, subscription.id));
  });

  return result;
}

/**
 * handle subscription updated
 */
export async function handleSubscriptionUpdated({
  subscription: existingSubscription,
  session,
}: {
  subscription: Subscription;
  session: PaymentSession;
}) {
  const subscriptionInfo = session.subscriptionInfo;
  if (!subscriptionInfo) {
    throw new Error('subscription info not found');
  }

  const updateSubscriptionData = {
    status: subscriptionInfo.status || SubscriptionStatus.ACTIVE,
    currentPeriodStart: subscriptionInfo.currentPeriodStart,
    currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
    subscriptionResult: JSON.stringify(session.subscriptionResult),
    amount: subscriptionInfo.amount,
    currency: subscriptionInfo.currency,
    interval: subscriptionInfo.interval,
    intervalCount: subscriptionInfo.intervalCount,
  };

  await db()
    .update(subscriptionTable)
    .set(updateSubscriptionData)
    .where(eq(subscriptionTable.id, existingSubscription.id));
}

/**
 * handle subscription canceled
 */
export async function handleSubscriptionCanceled({
  subscription: existingSubscription,
  session,
}: {
  subscription: Subscription;
  session: PaymentSession;
}) {
  const subscriptionInfo = session.subscriptionInfo;

  await db()
    .update(subscriptionTable)
    .set({
      status: SubscriptionStatus.CANCELED,
      subscriptionResult: JSON.stringify(session.subscriptionResult),
      canceledAt: new Date(),
      currentPeriodEnd: subscriptionInfo?.currentPeriodEnd,
    })
    .where(eq(subscriptionTable.id, existingSubscription.id));
}
