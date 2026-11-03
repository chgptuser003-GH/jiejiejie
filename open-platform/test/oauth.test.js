import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopeeClient } from '../src/client.js';
import { ShopeeOAuth } from '../src/oauth.js';

test('authorization URL is signed and targets the configured redirect', () => {
  const client = new ShopeeClient({ partnerId: 12, partnerKey: 'key', clock: () => 1700000000000 });
  const url = new ShopeeOAuth(client).authorizationUrl('https://app.example.test/callback');
  assert.equal(url.pathname, '/api/v2/shop/auth_partner');
  assert.equal(url.searchParams.get('redirect'), 'https://app.example.test/callback');
  assert.ok(url.searchParams.get('sign'));
});

test('token exchange and refresh keep per-shop identity and rotated token', async () => {
  const calls = [];
  const client = new ShopeeClient({ partnerId: 12, partnerKey: 'key', clock: () => 1700000000000,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ access_token: `access-${calls.length}`, refresh_token: `refresh-${calls.length}`, expire_in: 14400, shop_id_list: [456] }) };
    },
  });
  const oauth = new ShopeeOAuth(client);
  const first = await oauth.exchangeCode({ code: 'one-use', shopId: 456 });
  const second = await oauth.refresh({ refreshToken: first.refreshToken, shopId: 456 });
  assert.equal(first.shopId, '456');
  assert.equal(first.accessExpiresAt, 1700014400);
  assert.equal(second.refreshToken, 'refresh-2');
  assert.equal(calls[0].url.pathname, '/api/v2/auth/token/get');
  assert.deepEqual(calls[1].body, { refresh_token: 'refresh-1', shop_id: 456, partner_id: 12 });
});
