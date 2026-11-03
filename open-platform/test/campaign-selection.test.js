import test from 'node:test';
import assert from 'node:assert/strict';
import { parseItemIds, selectDeletionCandidates } from '../../extension/campaign-selection.js';

test('item ID parser accepts separators and rejects unsafe values', () => {
  assert.deepEqual([...parseItemIds('12, 13\n12，14')], ['12', '13', '14']);
  assert.throws(() => parseItemIds('', { required: true }), /至少一個/);
  assert.throws(() => parseItemIds('9007199254740993'), /格式不正確/);
});

test('deletion preview protects excluded items and unknown associations', () => {
  const campaigns = [
    { campaign_id: 1, common_info: { campaign_status: 'ongoing', item_id_list: [12, 13] } },
    { campaign_id: 2, common_info: { campaign_status: 'ongoing', item_id_list: [14] } },
    { campaign_id: 3, common_info: { campaign_status: 'paused', item_id_list: [12] } },
    { campaign_id: 4, common_info: { campaign_status: 'ongoing', item_id_list: [] } },
  ];
  const excluded = selectDeletionCandidates(campaigns, parseItemIds('12'), 'exclude');
  assert.deepEqual(excluded.candidates.map(item => item.campaignId), [2]);
  assert.equal(excluded.unknown, 1);
  const included = selectDeletionCandidates(campaigns, parseItemIds('12', { required: true }), 'include');
  assert.deepEqual(included.candidates.map(item => item.campaignId), [1]);
  assert.equal(included.unknown, 1);
});
