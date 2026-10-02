import assert from 'node:assert/strict';
import test from 'node:test';

import { addMonthsClamped, getYearlyCycleInfo } from './membership-upgrade';

test('addMonthsClamped keeps the subscription anchor at month end', () => {
  const start = new Date('2026-01-31T08:30:00.000Z');

  assert.equal(
    addMonthsClamped(start, 1).toISOString(),
    '2026-02-28T08:30:00.000Z'
  );
  assert.equal(
    addMonthsClamped(start, 2).toISOString(),
    '2026-03-31T08:30:00.000Z'
  );
});

test('getYearlyCycleInfo advances only after the monthly anniversary', () => {
  const currentPeriodStart = new Date('2026-03-22T16:24:34.000Z');
  const currentPeriodEnd = new Date('2027-03-22T16:24:34.000Z');

  const beforeAnniversary = getYearlyCycleInfo({
    currentPeriodStart,
    currentPeriodEnd,
    now: new Date('2026-05-22T16:24:33.999Z'),
  });
  const onAnniversary = getYearlyCycleInfo({
    currentPeriodStart,
    currentPeriodEnd,
    now: new Date('2026-05-22T16:24:34.000Z'),
  });

  assert.equal(beforeAnniversary.currentMonthNumber, 2);
  assert.equal(onAnniversary.currentMonthNumber, 3);
  assert.equal(
    onAnniversary.currentCycleStart.toISOString(),
    '2026-05-22T16:24:34.000Z'
  );
  assert.equal(
    onAnniversary.currentCycleEnd.toISOString(),
    '2026-06-22T16:24:34.000Z'
  );
});

test('getYearlyCycleInfo does not create a thirteenth yearly cycle', () => {
  const currentPeriodStart = new Date('2026-01-31T08:30:00.000Z');
  const currentPeriodEnd = new Date('2027-01-31T08:30:00.000Z');
  const cycle = getYearlyCycleInfo({
    currentPeriodStart,
    currentPeriodEnd,
    now: currentPeriodEnd,
  });

  assert.equal(cycle.currentMonthNumber, 12);
  assert.equal(
    cycle.currentCycleEnd.toISOString(),
    currentPeriodEnd.toISOString()
  );
});
