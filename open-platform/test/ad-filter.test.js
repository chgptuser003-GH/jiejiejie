import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesCampaignMetrics } from '../../extension/ad-filter.js';

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
