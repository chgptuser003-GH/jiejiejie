import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { ShopeeClient, ShopeeApiError, signRequest } from '../src/client.js';

test('public and shop signatures use the documented base strings', () => {
  const common = { partnerId: 123, partnerKey: 'test-secret', path: '/api/v2/product/get_item_list', timestamp: 1700000000 };
  const hmac = value => createHmac('sha256', 'test-secret').update(value).digest('hex');
  assert.equal(signRequest(common), hmac('123/api/v2/product/get_item_list1700000000'));
  assert.equal(signRequest({ ...common, accessToken: 'access', shopId: 456 }), hmac('123/api/v2/product/get_item_list1700000000access456'));
});

test('request signs URL, places POST data in body and reports API errors', async () => {
  let captured;
  const client = new ShopeeClient({
    partnerId: 123,
    partnerKey: 'test-secret',
    clock: () => 1700000000000,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200, json: async () => ({ error: '', response: { ok: true } }) };
    },
  });
  const result = await client.request({ path: '/api/v2/product/get_item_list', method: 'POST', body: { offset: 0 }, accessToken: 'access', shopId: 456 });
  assert.deepEqual(result.response, { ok: true });
  assert.equal(captured.url.host, 'openplatform.sandbox.test-stable.shopee.sg');
  assert.equal(captured.url.searchParams.get('shop_id'), '456');
  assert.equal(JSON.parse(captured.init.body).offset, 0);
  client.fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ error: 'permission_denied', message: 'No access', request_id: 'r1' }) });
  await assert.rejects(client.request({ path: '/api/v2/product/get_item_list' }), error => error instanceof ShopeeApiError && error.code === 'permission_denied' && error.requestId === 'r1');
});
