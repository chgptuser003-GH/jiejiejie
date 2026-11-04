import assert from 'node:assert/strict';
import test from 'node:test';
import { createGatewayServer } from '../src/gateway.js';
import { ShopeeApiError } from '../src/client.js';

test('local gateway requires pairing, routes read-only calls, and validates OAuth state', async () => {
  const calls = [];
  const editCalls = [];
  let biddingMethod = 'auto';
  const server = createGatewayServer({
    shopId: '228006723', pairToken: 'pair-test', redirectUrl: 'https://example.test/callback',
    oauth: { authorizationUrl: redirect => new URL(`https://shopee.test/auth?redirect=${encodeURIComponent(redirect)}`) },
    session: { authorize: async values => { calls.push(values); return { shopId: '228006723' }; } },
    products: { listItems: async (_id, options) => ({ item: [options.statuses] }) },
    ads: {
      listCampaignIds: async () => ({ campaign_list: [{ campaign_id: 123 }] }),
      createManualProductAd: async (_id, values) => {
        if (values.itemId === 999) throw new ShopeeApiError('not eligible', { status: 200, code: 'not_eligible' });
        calls.push(values);
        return { campaign_id: 321 };
      },
      getCampaignSettings: async () => ({ campaign_list: [{ campaign_id: 321,
        common_info: { ad_type: 'manual', campaign_status: 'ongoing', campaign_budget: 85,
          bidding_method: biddingMethod },
        auto_bidding_info: { roas_target: 0 } }] }),
      editManualProductAd: async (_id, values) => { editCalls.push(values); return { campaign_id: 321 }; },
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const authorized = { headers: { authorization: 'Bearer pair-test' } };
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/ads`)).status, 401);
    const createRequest = body => fetch(`${base}/api/ads/manual`, {
      method: 'POST',
      headers: { ...authorized.headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal((await createRequest({ shopId: '228006723', itemId: 846071597, budget: 85,
      startDate: '03-11-2026' })).status, 400);
    const unsupportedCreateRoas = await createRequest({ shopId: '228006723',
      confirm: 'CREATE_SANDBOX_MANUAL_AD', itemId: 846071597, budget: 85,
      startDate: '03-11-2026', roasTarget: 3 });
    assert.equal(unsupportedCreateRoas.status, 400);
    assert.equal((await unsupportedCreateRoas.json()).error, 'roas_target_unsupported_for_auto_bidding');
    const created = await createRequest({ shopId: '228006723', confirm: 'CREATE_SANDBOX_MANUAL_AD',
      itemId: 846071597, budget: 85, startDate: '03-11-2026', referenceId: 'sandbox-one' });
    assert.deepEqual(await created.json(), { shopId: '228006723', result: { campaign_id: 321 } });
    assert.deepEqual(calls.pop(), { itemId: 846071597, budget: 85,
      startDate: '03-11-2026', endDate: '', roasTarget: undefined,
      biddingMethod: 'auto', referenceId: 'sandbox-one' });
    const rejected = await createRequest({ shopId: '228006723', confirm: 'CREATE_SANDBOX_MANUAL_AD',
      itemId: 999, budget: 85, startDate: '03-11-2026' });
    assert.equal(rejected.status, 502);
    assert.equal((await rejected.json()).error, 'not_eligible');
    const editRequest = body => fetch(`${base}/api/ads/manual/edit`, {
      method: 'POST',
      headers: { ...authorized.headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal((await editRequest({ shopId: '228006723', campaignId: 321,
      action: 'change_budget', budget: 90 })).status, 400);
    const stale = await editRequest({ shopId: '228006723', confirm: 'EDIT_SANDBOX_MANUAL_AD',
      campaignId: 321, action: 'change_budget', budget: 90,
      expectedStatus: 'ongoing', expectedBudget: 80, expectedRoasTarget: 0 });
    assert.equal(stale.status, 409);
    const edited = await editRequest({ shopId: '228006723', confirm: 'EDIT_SANDBOX_MANUAL_AD',
      campaignId: 321, action: 'change_budget', budget: 90,
      expectedStatus: 'ongoing', expectedBudget: 85, expectedRoasTarget: 0, referenceId: 'edit-1' });
    assert.equal(edited.status, 200);
    assert.deepEqual(editCalls, [{ campaignId: 321, action: 'change_budget', budget: 90,
      roasTarget: undefined, referenceId: 'edit-1' }]);
    const unsupportedRoas = await editRequest({ shopId: '228006723', confirm: 'EDIT_SANDBOX_MANUAL_AD',
      campaignId: 321, action: 'change_roas_target', roasTarget: 3,
      expectedStatus: 'ongoing', expectedBudget: 85, expectedRoasTarget: 0 });
    assert.equal(unsupportedRoas.status, 400);
    assert.equal((await unsupportedRoas.json()).error, 'roas_target_unsupported_for_auto_bidding');
    assert.equal(editCalls.length, 1);
    biddingMethod = 'manual';
    const manualRoas = await editRequest({ shopId: '228006723', confirm: 'EDIT_SANDBOX_MANUAL_AD',
      campaignId: 321, action: 'change_roas_target', roasTarget: 3,
      expectedStatus: 'ongoing', expectedBudget: 85, expectedRoasTarget: 0,
      referenceId: 'edit-roas-1' });
    assert.equal(manualRoas.status, 200);
    assert.deepEqual(editCalls[1], { campaignId: 321, action: 'change_roas_target',
      budget: undefined, roasTarget: 3, referenceId: 'edit-roas-1' });
    const invalidResume = await editRequest({ shopId: '228006723', confirm: 'EDIT_SANDBOX_MANUAL_AD',
      campaignId: 321, action: 'resume', expectedStatus: 'ongoing',
      expectedBudget: 85, expectedRoasTarget: 0 });
    assert.equal(invalidResume.status, 400);
    assert.equal((await invalidResume.json()).error, 'invalid_campaign_status_for_action');
    const items = await (await fetch(`${base}/api/items?status=NORMAL&status=UNLIST`, authorized)).json();
    assert.deepEqual(items.item, [['NORMAL', 'UNLIST']]);
    const start = await (await fetch(`${base}/oauth/start`, authorized)).json();
    assert.equal(start.redirectOrigin, 'https://example.test');
    const state = new URL(new URL(start.authorizationUrl).searchParams.get('redirect')).searchParams.get('state');
    const finish = await fetch(`${base}/oauth/finish`, {
      method: 'POST',
      headers: { ...authorized.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'one-use', shopId: '228006723', state }),
    });
    assert.equal(finish.status, 200);
    assert.deepEqual(calls, [{ code: 'one-use', shopId: '228006723' }]);
    const replay = await fetch(`${base}/oauth/finish`, {
      method: 'POST', headers: { ...authorized.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'one-use', shopId: '228006723', state }),
    });
    assert.equal(replay.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
