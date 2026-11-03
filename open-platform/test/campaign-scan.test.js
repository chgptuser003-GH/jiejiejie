import test from 'node:test';
import assert from 'node:assert/strict';
import { scanCampaignPages } from '../../extension/campaign-scan.js';

test('campaign scan advances offsets and reports a complete result', async () => {
  const offsets = [];
  const handled = [];
  const result = await scanCampaignPages({
    pageSize: 2, maxPages: 3,
    fetchPage: async ({ offset }) => {
      offsets.push(offset);
      return offset === 0
        ? { campaign_list: [{ campaign_id: 11 }, { campaign_id: 12 }], has_next_page: true }
        : { campaign_list: [{ campaign_id: 13 }], has_next_page: false };
    },
    onPage: async campaigns => handled.push(...campaigns.map(c => c.campaign_id)),
  });
  assert.deepEqual(offsets, [0, 2]);
  assert.deepEqual(handled, [11, 12, 13]);
  assert.deepEqual(result, { scanned: 3, pages: 2, complete: true, nextOffset: null });
});

test('campaign scan refuses duplicate IDs and incomplete next pages', async () => {
  await assert.rejects(scanCampaignPages({
    pageSize: 1, maxPages: 2,
    fetchPage: async () => ({ campaign_list: [{ campaign_id: 11 }], has_next_page: true }),
    onPage: async () => {},
  }), /分頁重複/);
  await assert.rejects(scanCampaignPages({
    fetchPage: async () => ({ campaign_list: [], has_next_page: true }),
    onPage: async () => {},
  }), /分頁資料不完整/);
});

test('campaign scan marks a capped result incomplete', async () => {
  const result = await scanCampaignPages({
    pageSize: 1, maxPages: 1, startOffset: 7,
    fetchPage: async () => ({ campaign_list: [{ campaign_id: 20 }], has_next_page: true }),
    onPage: async () => {},
  });
  assert.deepEqual(result, { scanned: 1, pages: 1, complete: false, nextOffset: 8 });
});
