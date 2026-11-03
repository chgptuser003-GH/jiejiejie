import assert from 'node:assert/strict';
import test from 'node:test';
import { AdsService } from '../src/ads-service.js';
import { ShopeeClient } from '../src/client.js';
import { ProductService } from '../src/product-service.js';

test('product list uses official repeated status query parameters', async () => {
  const client = new ShopeeClient({ partnerId: 12, partnerKey: 'key', clock: () => 1700000000000 });
  const url = client.buildUrl('/api/v2/product/get_item_list', {
    accessToken: 'access', shopId: 456,
    query: { item_status: ['NORMAL', 'UNLIST'], offset: 0, page_size: 100 },
  });
  assert.deepEqual(url.searchParams.getAll('item_status'), ['NORMAL', 'UNLIST']);
  const calls = [];
  const service = new ProductService({ request: async (shopId, options) => {
    calls.push({ shopId, options });
    return { response: { item: [], has_next_page: false } };
  } });
  assert.deepEqual(await service.listItems(456, { statuses: ['NORMAL', 'UNLIST'] }), { item: [], has_next_page: false });
  assert.equal(calls[0].options.path, '/api/v2/product/get_item_list');
  await assert.rejects(service.listItems(456, { pageSize: 101 }), /pageSize/);
});

test('Ads adapter maps official list, settings, create and edit endpoints', async () => {
  const calls = [];
  const ads = new AdsService({ request: async (shopId, options) => {
    calls.push({ shopId, options });
    return { response: { campaign_list: [], campaign_id: 999 } };
  } });
  await ads.listCampaignIds(456, { adType: 'manual' });
  await ads.getCampaignSettings(456, [111, 222]);
  await ads.getDailyPerformance(456, { campaignIds: [111, 222], startDate: '01-11-2026', endDate: '01-11-2026' });
  await ads.getHourlyPerformance(456, { campaignIds: [111, 222], performanceDate: '01-11-2026' });
  await ads.createManualProductAd(456, { itemId: 123, budget: 85, startDate: '01-11-2026', roasTarget: 3, referenceId: 'create-1' });
  await ads.editManualProductAd(456, { campaignId: 999, action: 'change_budget', budget: 100, referenceId: 'edit-1' });
  await ads.checkGmsShopEligibility(456);
  await ads.createGmsShopCampaign(456, { startDate: '01-11-2026', dailyBudget: 100, roasTarget: 0, referenceId: 'gms-1' });
  await ads.editGmsShopCampaign(456, { campaignId: 888, action: 'change_roas_target', roasTarget: 3, referenceId: 'gms-edit-1' });
  assert.deepEqual(calls.map(call => call.options.path), [
    '/api/v2/ads/get_product_level_campaign_id_list',
    '/api/v2/ads/get_product_level_campaign_setting_info',
    '/api/v2/ads/get_product_campaign_daily_performance',
    '/api/v2/ads/get_product_campaign_hourly_performance',
    '/api/v2/ads/create_manual_product_ads',
    '/api/v2/ads/edit_manual_product_ads',
    '/api/v2/ads/check_create_gms_product_campaign_eligibility',
    '/api/v2/ads/create_gms_product_campaign',
    '/api/v2/ads/edit_gms_product_campaign',
  ]);
  assert.equal(calls[1].options.query.campaign_id_list, '111,222');
  assert.equal(calls[2].options.query.start_date, '01-11-2026');
  assert.equal(calls[3].options.query.performance_date, '01-11-2026');
  assert.equal(calls[4].options.body.roas_target, 3);
  assert.equal(calls[4].options.body.reference_id, 'create-1');
  assert.equal(calls[5].options.body.edit_action, 'change_budget');
  assert.equal(calls[5].options.body.budget, 100);
  assert.equal(calls[7].options.body.roas_target, 0);
  assert.equal(calls[8].options.body.roas_target, 3);
  await assert.rejects(ads.editManualProductAd(456, { campaignId: 999, action: 'change_roas_target', roasTarget: -1 }), /roasTarget/);
});
