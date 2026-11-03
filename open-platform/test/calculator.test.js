import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateProfit } from '../src/calculator.js';

test('calculator preserves the legacy fee, shipping and currency formula', () => {
  const result = calculateProfit({ sellPrice: 460, purchasePrice: 40, weight: 0.5 });
  const revenue = 460 * 0.915 * 0.885 / 4.6;
  const cost = 40 + 3.5 + 12 * 0.5;
  assert.equal(result.rmbValue, revenue);
  assert.equal(result.totalCost, cost);
  assert.equal(result.profit, revenue - cost);
  assert.equal(result.roi, 460 / ((revenue - cost) * 4.5));
});

test('calculator avoids infinite ROI and rejects invalid rates', () => {
  assert.equal(calculateProfit({ sellPrice: 0 }).profitRate, null);
  assert.equal(calculateProfit({ sellPrice: 1, purchasePrice: 100 }).roi, null);
  assert.throws(() => calculateProfit({ twToCnyRate: 0 }), /exchange rates/);
});
