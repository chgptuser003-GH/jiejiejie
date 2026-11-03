import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateBudgetTopup } from '../src/budget-rule.js';

const rule = { add_amount_twd: 100, max_budget_twd: 500, gap_range: { min: 30, max: 50 }, delay_min: 2 };
const metrics = { dailyBudgetTwd: 450, spendTwd: 410, liveSpendTwd: 420, click: 40, roi: 4 };
const afternoon = new Date('2026-11-01T06:00:00Z'); // 14:00 in Taiwan

test('budget rule caps the actual increase and uses the higher spend reading', () => {
  assert.deepEqual(evaluateBudgetTopup({ rule, metrics, now: afternoon }), {
    eligible: true, reason: 'matched', gapTwd: 30,
    targetBudgetTwd: 500, actualIncreaseTwd: 50, delayMinutes: 2,
  });
});

test('budget rule blocks conditions that no longer qualify at execution time', () => {
  assert.equal(evaluateBudgetTopup({ rule, metrics: { ...metrics, liveSpendTwd: 300, spendTwd: 300 }, now: afternoon }).reason, 'gap_not_reached');
  assert.equal(evaluateBudgetTopup({ rule: { ...rule, cpc_limit: 5 }, metrics: { ...metrics, click: 1 }, now: afternoon }).reason, 'cpc_limit_exceeded');
  assert.equal(evaluateBudgetTopup({ rule: { ...rule, min_roi: 5 }, metrics, now: afternoon }).reason, 'roi_below_minimum');
  assert.equal(evaluateBudgetTopup({ rule, metrics, now: new Date('2026-11-01T15:56:00Z') }).reason, 'daily_reset_window');
});
