import assert from 'node:assert/strict';
import test from 'node:test';
import { dateRangeFromPreset, matchesCampaignMetrics, matchesMetricConditions, summarizeDailyMetrics } from '../../extension/ad-filter.js';

test('campaign metric matching combines only selected conditions', () => {
  const metrics = { clicks: 4, cpc: 2, roi: null, spend: 8 };
  const criteria = { clicksAtLeast: 3, cpcAtMost: 1, roiAtLeast: null, spendAtLeast: null };
  assert.equal(matchesCampaignMetrics(metrics, criteria, 'any'), true);
  assert.equal(matchesCampaignMetrics(metrics, criteria, 'all'), false);
  assert.equal(matchesCampaignMetrics(metrics, { clicksAtLeast: null, cpcAtMost: null,
    roiAtLeast: null, spendAtLeast: null }, 'any'), true);
});

test('campaign metric matching does not treat unavailable CPC or ROAS as zero', () => {
  const metrics = { clicks: 0, cpc: null, roi: null, spend: 0 };
  const criteria = { clicksAtLeast: null, cpcAtMost: 1, roiAtLeast: 2, spendAtLeast: null };
  assert.equal(matchesCampaignMetrics(metrics, criteria, 'any'), false);
  assert.equal(matchesCampaignMetrics(metrics, criteria, 'all'), false);
  assert.throws(() => matchesCampaignMetrics(metrics, criteria, 'xor'), TypeError);
});

test('legacy filter uses strict thresholds and excludes unknown metrics', () => {
  const conditions = [
    { metric: 'impressions', op: 'eq', value: 0 },
    { metric: 'spend', op: 'range', value: 10, upper: 20 },
  ];
  assert.equal(matchesMetricConditions({ impressions: null, spend: 15 }, conditions, 'any'), true);
  assert.equal(matchesMetricConditions({ impressions: null, spend: 15 }, conditions, 'all'), false);
  assert.equal(matchesMetricConditions({ impressions: 0, spend: 20 }, conditions, 'all'), true);
  assert.equal(matchesMetricConditions({ impressions: 0, spend: 21 }, conditions, 'all'), false);
  assert.equal(matchesMetricConditions({ impressions: 5, clicks: 0 },
    [{ op: 'view_no_click' }], 'any'), true);
});

test('date presets cross month boundaries in Taipei calendar dates', () => {
  assert.deepEqual(dateRangeFromPreset('2026-11-04', 'last7'),
    { start: '2026-10-29', end: '2026-11-04' });
  assert.deepEqual(dateRangeFromPreset('2026-11-04', 'yesterday'),
    { start: '2026-11-03', end: '2026-11-03' });
});

test('daily metric summary keeps unavailable values distinct from measured zero', () => {
  assert.deepEqual(summarizeDailyMetrics([]), {
    impressions: null, clicks: null, spend: null, cpc: null, roi: null,
  });
  assert.equal(summarizeDailyMetrics([{ clicks: '' }]).clicks, null);
  assert.deepEqual(summarizeDailyMetrics([{ impression: 0, clicks: 0, expense: 0, broad_gmv: 0 }]), {
    impressions: 0, clicks: 0, spend: 0, cpc: null, roi: null,
  });
  assert.deepEqual(summarizeDailyMetrics([{ impression: 20, clicks: 2, expense: 10, broad_gmv: 30 }]), {
    impressions: 20, clicks: 2, spend: 10, cpc: 5, roi: 3,
  });
});
