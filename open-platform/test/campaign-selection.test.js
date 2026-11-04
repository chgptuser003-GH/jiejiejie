import test from 'node:test';
import assert from 'node:assert/strict';
import { parseItemIds, selectBudgetCampaigns, selectDeletionCandidates, selectRoasCampaigns } from '../../extension/campaign-selection.js';

test('item ID parser accepts separators and rejects unsafe values', () => {
  assert.deepEqual([...parseItemIds('12, 13\n12，14')], ['12', '13', '14']);
  assert.throws(() => parseItemIds('', { required: true }), /至少一個/);
  assert.throws(() => parseItemIds('9007199254740993'), /格式不正確/);
});

test('deletion preview protects excluded items and unknown associations', () => {
  const campaigns = [
    { campaign_id: 1, common_info: { ad_type: 'manual', campaign_status: 'ongoing', item_id_list: [12, 13] } },
    { campaign_id: 2, common_info: { ad_type: 'auto', campaign_status: 'ongoing', item_id_list: [14] } },
    { campaign_id: 3, common_info: { ad_type: 'manual', campaign_status: 'paused', item_id_list: [12] } },
    { campaign_id: 4, common_info: { ad_type: 'manual', campaign_status: 'ongoing', item_id_list: [] } },
    { campaign_id: 5, common_info: { ad_type: 'manual', campaign_status: 'ongoing', item_id_list: [null] } },
  ];
  const excluded = selectDeletionCandidates(campaigns, parseItemIds('12'), 'exclude');
  assert.deepEqual(excluded.candidates.map(item => item.campaignId), [2]);
  assert.equal(excluded.unknown, 2);
  assert.equal(excluded.candidates[0].adType, 'auto');
  assert.deepEqual(excluded.unknownCampaigns.map(item => item.campaignId), [4, 5]);
  const included = selectDeletionCandidates(campaigns, parseItemIds('12', { required: true }), 'include');
  assert.deepEqual(included.candidates.map(item => item.campaignId), [1]);
  assert.equal(included.unknown, 2);
});

test('budget selection requires a complete scan and known product mapping', () => {
  const campaigns = [
    { campaign_id: 1, common_info: { ad_type: 'manual', campaign_status: 'ongoing', item_id_list: [12, 13] } },
    { campaign_id: 2, common_info: { ad_type: 'manual', campaign_status: 'ongoing', item_id_list: [14] } },
    { campaign_id: 3, common_info: { ad_type: 'manual', campaign_status: 'paused', item_id_list: [15] } },
  ];
  assert.deepEqual(selectBudgetCampaigns(campaigns, parseItemIds('12'), 'include', true)
    .candidates.map(item => item.campaignId), ['1']);
  assert.deepEqual(selectBudgetCampaigns(campaigns, parseItemIds('12'), 'exclude', true)
    .candidates.map(item => item.campaignId), ['2']);
  assert.deepEqual(selectBudgetCampaigns(campaigns, parseItemIds('99'), 'include', true).missingIds, ['99']);
  assert.throws(() => selectBudgetCampaigns(campaigns, parseItemIds('12'), 'include', false), /尚未掃描完整/);
  assert.throws(() => selectBudgetCampaigns([...campaigns, { campaign_id: 4, common_info: {
    ad_type: 'manual', campaign_status: 'ongoing', item_id_list: [] } }],
  parseItemIds('12'), 'include', true), /缺少商品關聯/);
});

test('ROAS selection rejects auto bidding and unknown bidding methods', () => {
  const campaigns = [
    { campaign_id: 1, common_info: { ad_type: 'manual', campaign_status: 'ongoing',
      bidding_method: 'manual', item_id_list: [12] } },
    { campaign_id: 2, common_info: { ad_type: 'manual', campaign_status: 'ongoing',
      bidding_method: 'auto', item_id_list: [13] } },
  ];
  assert.deepEqual(selectRoasCampaigns(campaigns, parseItemIds('12'), 'include', true)
    .candidates.map(item => item.campaignId), ['1']);
  assert.throws(() => selectRoasCampaigns(campaigns, parseItemIds('13'), 'include', true), /auto/);
  assert.throws(() => selectRoasCampaigns(campaigns.map(item => ({ ...item,
    common_info: { ...item.common_info, bidding_method: undefined } })),
  parseItemIds('12'), 'include', true), /未知/);
  assert.throws(() => selectRoasCampaigns(campaigns, parseItemIds('12'), 'include', false), /尚未掃描完整/);
});
