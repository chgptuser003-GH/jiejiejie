import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCampaignHealth } from '../../extension/ad-health.js';

const base = {
  info: { campaign_status: 'ongoing', campaign_budget: 85, item_id_list: [846071597] },
  productById: new Map([['846071597', 'NORMAL']]),
  productsAvailable: true, metricsAvailable: true, impressions: 12,
};

test('health classification separates checked, unknown, and review cases', () => {
  assert.equal(classifyCampaignHealth(base).level, 'checked');
  assert.equal(classifyCampaignHealth({ ...base, impressions: null }).level, 'unknown');
  assert.equal(classifyCampaignHealth({ ...base, productById: new Map() }).level, 'unknown');
  assert.equal(classifyCampaignHealth({ ...base,
    productById: new Map([['846071597', 'UNLIST']]) }).level, 'review');
  assert.equal(classifyCampaignHealth({ ...base,
    info: { ...base.info, campaign_budget: 0 } }).level, 'review');
});

test('zero exposure is an observation rather than a violation', () => {
  const result = classifyCampaignHealth({ ...base, impressions: 0 });
  assert.equal(result.level, 'checked');
  assert.match(result.notes.join('；'), /零曝光/);
  assert.equal(classifyCampaignHealth({ ...base, info: null }).level, 'unknown');
});
