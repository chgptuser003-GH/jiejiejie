import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAdCreationItems } from '../../extension/ad-create-selection.js';

test('batch ad creation requires listed items and complete known campaign associations', () => {
  const items = [{ item_id: 12, item_status: 'NORMAL' }, { item_id: 13, item_status: 'UNLIST' }];
  const ads = [{ campaign_id: 1, common_info: { item_id_list: [14] } }];
  assert.deepEqual(selectAdCreationItems(items, ads, new Set(['12']), true), [items[0]]);
  assert.throws(() => selectAdCreationItems(items, ads, new Set(['13']), true), /在架商品/);
  assert.throws(() => selectAdCreationItems(items, ads, new Set(['12']), false), /尚未掃描完整/);
  assert.throws(() => selectAdCreationItems(items, [{ campaign_id: 2, common_info: {} }],
    new Set(['12']), true), /缺少商品關聯/);
  assert.throws(() => selectAdCreationItems(items, [{ campaign_id: 2,
    common_info: { item_id_list: [] } }], new Set(['12']), true), /缺少商品關聯/);
  assert.throws(() => selectAdCreationItems(items, [{ campaign_id: 2,
    common_info: { item_id_list: [12] } }], new Set(['12']), true), /已出現在廣告活動/);
});
