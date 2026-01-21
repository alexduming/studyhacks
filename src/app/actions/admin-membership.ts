'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { user, order, subscription } from '@/config/db/schema';
import { getUuid, getSnowId } from '@/shared/lib/hash';
import { OrderStatus } from '@/shared/models/order';
import { SubscriptionStatus } from '@/shared/models/subscription';
import { PaymentType } from '@/extensions/payment';
import { getCanonicalPlanInfo } from '@/shared/config/pricing-guard';

/**
 * Manually set user membership level
 */
export async function manageUserMembership(prevState: any, formData: FormData) {
  const userId = formData.get('userId') as string;
  const planId = formData.get('planId') as string; // 'free', 'plus-monthly', 'pro-monthly', etc.
  
  if (!userId || !planId) {
    return { success: false, error: 'User ID and Plan ID are required' };
  }

  try {
    const [targetUser] = await db()
      .select()
      .from(user)
      .where(eq(user.id, userId));

    if (!targetUser) {
      return { success: false, error: 'User not found' };
    }

    const now = new Date();

    // If setting to free, we just need to cancel or expire active subscriptions
    if (planId === 'free') {
      await db()
        .update(subscription)
        .set({ status: SubscriptionStatus.EXPIRED, updatedAt: now })
        .where(eq(subscription.userId, userId));
      
      revalidatePath('/[locale]/(admin)/admin/users', 'page');
      return { success: true };
    }

    // Pro/Plus plans
    const planInfo = getCanonicalPlanInfo(planId);
    if (!planInfo) {
      return { success: false, error: 'Invalid plan selected' };
    }

    const isYearly = planId.includes('yearly');
    const productName = planId.includes('pro') 
      ? `StudyHacks Pro ${isYearly ? 'Yearly' : 'Monthly'}`
      : `StudyHacks Plus ${isYearly ? 'Yearly' : 'Monthly'}`;
    
    const planName = planId.includes('pro') ? 'Pro' : 'Plus';
    const interval = isYearly ? 'year' : 'month';
    const amount = planId.includes('pro') ? (isYearly ? 1399 * 12 : 1999) : (isYearly ? 699 * 12 : 999);

    const currentPeriodStart = new Date(now);
    const currentPeriodEnd = new Date(now);
    if (isYearly) {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    } else {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }

    // 1. Create Order
    const orderId = getUuid();
    await db().insert(order).values({
      id: orderId,
      orderNo: getSnowId(),
      userId,
      userEmail: targetUser.email || '',
      status: OrderStatus.PAID,
      amount,
      currency: 'USD',
      productId: planId,
      productName,
      planName,
      paymentType: PaymentType.SUBSCRIPTION,
      paymentInterval: interval,
      paymentProvider: 'manual',
      checkoutInfo: JSON.stringify({ source: 'admin_action', createdAt: now.toISOString() }),
      paidAt: now,
      creditsAmount: planInfo.credits,
      creditsValidDays: planInfo.valid_days,
      description: `Manual membership assignment - ${productName}`,
    });

    // 2. Cancel existing subscriptions
    await db()
      .update(subscription)
      .set({ status: SubscriptionStatus.EXPIRED, updatedAt: now })
      .where(eq(subscription.userId, userId));

    // 3. Create New Subscription
    const subscriptionNo = getSnowId();
    const subscriptionId = getUuid();

    // Use raw SQL for subscription insertion as we know the table might have missing columns
    await db().execute(sql`
      INSERT INTO subscription (
        id, subscription_no, user_id, user_email, status,
        plan_name, product_id, product_name,
        amount, currency, interval, interval_count,
        payment_provider, subscription_id, subscription_result,
        credits_amount, credits_valid_days,
        current_period_start, current_period_end,
        description, created_at, updated_at
      ) VALUES (
        ${subscriptionId}, ${subscriptionNo}, ${userId}, ${targetUser.email || ''}, ${SubscriptionStatus.ACTIVE},
        ${planName}, ${planId}, ${productName},
        ${amount}, ${'USD'}, ${interval}, ${1},
        ${'manual'}, ${`manual_${subscriptionNo}`}, ${JSON.stringify({ source: 'admin_action', createdAt: now.toISOString() })},
        ${planInfo.credits}, ${planInfo.valid_days},
        ${currentPeriodStart.toISOString()}::timestamp, ${currentPeriodEnd.toISOString()}::timestamp,
        ${`Manual membership - ${productName}`}, ${now.toISOString()}::timestamp, ${now.toISOString()}::timestamp
      )
    `);

    revalidatePath('/[locale]/(admin)/admin/users', 'page');
    return { success: true };
  } catch (error) {
    console.error('[Admin Membership] Error:', error);
    return { success: false, error: 'Internal server error' };
  }
}





