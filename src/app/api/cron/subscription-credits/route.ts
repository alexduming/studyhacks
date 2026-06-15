import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gt, gte, inArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { credit, subscription } from '@/config/db/schema';
import { getCanonicalPlanInfo } from '@/shared/config/pricing-guard';
import { getUuid } from '@/shared/lib/hash';
import { getYearlyCycleInfo } from '@/shared/lib/membership-upgrade';
import {
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
} from '@/shared/models/credit';
import { SubscriptionStatus } from '@/shared/models/subscription';

export const runtime = 'nodejs';
export const maxDuration = 300;

type GrantedCredit = {
  metadata?: string | null;
  description?: string | null;
};

function getGrantedMonthNumber(entry: GrantedCredit) {
  if (entry.metadata) {
    try {
      const parsed = JSON.parse(entry.metadata);
      if (
        typeof parsed?.monthNumber === 'number' &&
        Number.isInteger(parsed.monthNumber)
      ) {
        return parsed.monthNumber;
      }
    } catch {
      // Fall back to legacy description parsing.
    }
  }

  const match = entry.description?.match(/month (\d+) of subscription/i);
  return match ? parseInt(match[1], 10) : 0;
}

function getCronAuthError(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[subscription-credits] CRON_SECRET is not configured');
    return NextResponse.json(
      { error: 'Cron is not configured' },
      { status: 500 }
    );
  }

  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

async function distributeSubscriptionCredits(request: NextRequest) {
  const authError = getCronAuthError(request);
  if (authError) {
    return authError;
  }

  try {
    const database = db();
    const now = new Date();
    const activeYearlySubscriptions = await database
      .select()
      .from(subscription)
      .where(
        and(
          eq(subscription.interval, 'year'),
          inArray(subscription.status, [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PENDING_CANCEL,
            SubscriptionStatus.TRIALING,
          ]),
          gt(subscription.currentPeriodEnd, now)
        )
      );

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const processed: Array<{
      subscriptionNo: string;
      userId: string;
      credits: number;
      monthNumber: number;
    }> = [];
    const errors: Array<{ subscriptionNo: string; error: string }> = [];

    for (const sub of activeYearlySubscriptions) {
      try {
        const subscriptionStart = new Date(sub.currentPeriodStart);
        const subscriptionEnd = new Date(sub.currentPeriodEnd);
        const cycle = getYearlyCycleInfo({
          currentPeriodStart: subscriptionStart,
          currentPeriodEnd: subscriptionEnd,
          now,
        });

        // Month 1 is granted during checkout or manual membership creation.
        if (cycle.currentMonthNumber === 1) {
          skippedCount++;
          continue;
        }

        const canonicalPlan = getCanonicalPlanInfo(sub.productId || '');
        const monthlyCredits =
          sub.creditsAmount && sub.creditsAmount > 0
            ? sub.creditsAmount
            : canonicalPlan?.credits;
        const validDays =
          sub.creditsValidDays && sub.creditsValidDays > 0
            ? sub.creditsValidDays
            : canonicalPlan?.valid_days || 30;

        if (!monthlyCredits || monthlyCredits <= 0) {
          throw new Error(
            `No valid credit amount for product ${sub.productId || 'unknown'}`
          );
        }

        const subscriptionKey = sub.subscriptionNo || sub.id;
        const transactionNo = `subscription-credit:${subscriptionKey}:month:${cycle.currentMonthNumber}`;
        const expiresAt = new Date(now);
        expiresAt.setUTCDate(expiresAt.getUTCDate() + validDays);
        const finalExpiresAt =
          expiresAt > subscriptionEnd ? subscriptionEnd : expiresAt;

        const result = await database.transaction(async (tx) => {
          const subscriptionScope = sub.subscriptionNo
            ? eq(credit.subscriptionNo, sub.subscriptionNo)
            : and(
                eq(credit.userId, sub.userId),
                gte(credit.createdAt, subscriptionStart)
              );
          const existingCredits = await tx
            .select({
              metadata: credit.metadata,
              description: credit.description,
            })
            .from(credit)
            .where(
              and(
                subscriptionScope,
                eq(credit.transactionType, CreditTransactionType.GRANT),
                eq(credit.transactionScene, CreditTransactionScene.SUBSCRIPTION)
              )
            );

          if (
            existingCredits.some(
              (entry) =>
                getGrantedMonthNumber(entry) === cycle.currentMonthNumber
            )
          ) {
            return 'already-granted' as const;
          }

          const inserted = await tx
            .insert(credit)
            .values({
              id: getUuid(),
              userId: sub.userId,
              userEmail: sub.userEmail || '',
              subscriptionNo: sub.subscriptionNo || undefined,
              transactionNo,
              transactionType: CreditTransactionType.GRANT,
              transactionScene: CreditTransactionScene.SUBSCRIPTION,
              credits: monthlyCredits,
              remainingCredits: monthlyCredits,
              description: `Subscription credits - month ${cycle.currentMonthNumber} of subscription (${sub.productName || sub.productId || 'Membership'})`,
              metadata: JSON.stringify({
                monthNumber: cycle.currentMonthNumber,
                cycleStart: cycle.currentCycleStart.toISOString(),
                grantKey: transactionNo,
                source: 'subscription_credit_cron',
              }),
              expiresAt: finalExpiresAt,
              status: CreditStatus.ACTIVE,
            })
            .onConflictDoNothing({ target: credit.transactionNo })
            .returning({ id: credit.id });

          return inserted.length > 0
            ? ('granted' as const)
            : ('conflict' as const);
        });

        if (result !== 'granted') {
          skippedCount++;
          continue;
        }

        successCount++;
        processed.push({
          subscriptionNo: sub.subscriptionNo || '',
          userId: sub.userId,
          credits: monthlyCredits,
          monthNumber: cycle.currentMonthNumber,
        });
      } catch (error) {
        errorCount++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          subscriptionNo: sub.subscriptionNo || '',
          error: errorMessage,
        });
        console.error(
          `[subscription-credits] Failed subscription ${sub.subscriptionNo || sub.id}:`,
          error
        );
      }
    }

    return NextResponse.json({
      success: errorCount === 0,
      message: 'Subscription credits distribution completed',
      stats: {
        totalSubscriptions: activeYearlySubscriptions.length,
        successCount,
        skippedCount,
        errorCount,
        checkDate: now.toISOString(),
      },
      processed: processed.length > 0 ? processed : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[subscription-credits] Distribution failed:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to distribute subscription credits',
      },
      { status: 500 }
    );
  }
}

// Vercel Cron invokes configured paths with GET.
export async function GET(request: NextRequest) {
  return distributeSubscriptionCredits(request);
}

// Keep POST for authenticated manual recovery and operational testing.
export async function POST(request: NextRequest) {
  return distributeSubscriptionCredits(request);
}
