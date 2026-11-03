import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopSession } from '../src/shop-session.js';

test('session refreshes expiring tokens once and persists rotation before use', async () => {
  let record = { shopId: '456', accessToken: 'old', refreshToken: 'refresh-old', accessExpiresAt: 1000, refreshExpiresAt: 90000 };
  let refreshCalls = 0;
  const requestCalls = [];
  const session = new ShopSession({
    client: { clock: () => 1000000, request: async options => { requestCalls.push(options); return { response: { ok: true } }; } },
    oauth: { refresh: async () => { refreshCalls++; return { ...record, accessToken: 'new', refreshToken: 'refresh-new', accessExpiresAt: 2000 }; } },
    vault: { get: async () => record, put: async next => { record = next; } },
  });
  await Promise.all([
    session.request(456, { path: '/api/v2/product/get_item_list' }),
    session.request(456, { path: '/api/v2/product/get_item_list' }),
  ]);
  assert.equal(refreshCalls, 1);
  assert.equal(record.refreshToken, 'refresh-new');
  assert.deepEqual(requestCalls.map(x => x.accessToken), ['new', 'new']);
});
