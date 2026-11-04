import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAllShopAds } from '../../extension/all-shop-query.js';

test('query matches original distinction between ongoing products and paused campaigns', () => {
  const actual = classifyAllShopAds(['11', '12', '13'], [
    { campaign_id: 1, common_info: { campaign_status: 'ongoing', item_id_list: [11] } },
    { campaign_id: 2, common_info: { campaign_status: 'paused', item_id_list: [12] } },
  ]);
  assert.deepEqual(actual, { withoutOngoingAds: ['12', '13'], pausedCampaignIds: ['2'] });
});

test('query refuses incomplete ongoing campaign association', () => {
  assert.throws(() => classifyAllShopAds(['11'], [
    { campaign_id: 1, common_info: { campaign_status: 'ongoing' } },
  ]), /缺少商品關聯/);
});
