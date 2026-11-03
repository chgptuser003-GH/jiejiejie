import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { ShopeeApiError } from './client.js';
import { ShopAuthorizationError } from './shop-session.js';

function send(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16384) throw new Error('request body too large');
  }
  return JSON.parse(body || '{}');
}

function ids(searchParams) {
  const value = searchParams.get('ids') ?? '';
  return value.split(',').map(id => id.trim()).filter(Boolean);
}

export function createGatewayServer({ shopId, pairToken, redirectUrl, oauth, session, products, ads,
  clock = Date.now }) {
  if (!shopId || !pairToken || !redirectUrl || !oauth || !session || !products || !ads) {
    throw new TypeError('gateway configuration is incomplete');
  }
  const states = new Map();
  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/health') {
      return send(response, 200, { status: 'ready', shopId: String(shopId), environment: 'sandbox' });
    }
    if (request.headers.authorization !== `Bearer ${pairToken}`) {
      return send(response, 401, { error: 'pairing_required' });
    }
    try {
      if (request.method === 'GET' && url.pathname === '/oauth/start') {
        for (const [oldState, expiry] of states) {
          if (clock() > expiry) states.delete(oldState);
        }
        const state = randomBytes(24).toString('hex');
        states.set(state, clock() + 10 * 60_000);
        const redirect = new URL(redirectUrl);
        redirect.searchParams.set('state', state);
        return send(response, 200, {
          authorizationUrl: oauth.authorizationUrl(redirect.href).href,
          redirectOrigin: redirect.origin,
        });
      }
      if (request.method === 'POST' && url.pathname === '/oauth/finish') {
        const { code, state, shopId: callbackShopId } = await readJson(request);
        const expiry = states.get(state);
        states.delete(state);
        if (!expiry || clock() > expiry || String(callbackShopId) !== String(shopId) || !code) {
          return send(response, 400, { error: 'invalid_authorization_callback' });
        }
        return send(response, 200, await session.authorize({ code, shopId }));
      }
      if (request.method === 'POST' && url.pathname === '/api/ads/manual') {
        const body = await readJson(request);
        if (String(body.shopId) !== String(shopId) || body.confirm !== 'CREATE_SANDBOX_MANUAL_AD') {
          return send(response, 400, { error: 'sandbox_confirmation_required' });
        }
        if (body.roasTarget !== undefined && body.roasTarget !== '') {
          return send(response, 400, { error: 'roas_target_unsupported_for_auto_bidding',
            message: '此建立工具使用 auto 競價，不設定目標 ROAS。' });
        }
        const result = await ads.createManualProductAd(shopId, {
          itemId: Number(body.itemId),
          budget: Number(body.budget),
          startDate: body.startDate,
          endDate: body.endDate || '',
          roasTarget: body.roasTarget === undefined || body.roasTarget === ''
            ? undefined : Number(body.roasTarget),
          biddingMethod: 'auto',
          referenceId: body.referenceId,
        });
        return send(response, 200, { shopId: String(shopId), result });
      }
      if (request.method === 'POST' && url.pathname === '/api/ads/manual/edit') {
        const body = await readJson(request);
        if (String(body.shopId) !== String(shopId) || body.confirm !== 'EDIT_SANDBOX_MANUAL_AD') {
          return send(response, 400, { error: 'sandbox_confirmation_required' });
        }
        const action = body.action;
        if (!['change_budget', 'change_roas_target', 'pause', 'resume'].includes(action)) {
          return send(response, 400, { error: 'unsupported_edit_action' });
        }
        const campaignId = Number(body.campaignId);
        if (!Number.isSafeInteger(campaignId) || campaignId <= 0) {
          return send(response, 400, { error: 'invalid_campaign_id' });
        }
        const settings = await ads.getCampaignSettings(shopId, [campaignId]);
        const campaign = (settings.campaign_list || []).find(item => Number(item.campaign_id) === campaignId);
        if (!campaign) return send(response, 404, { error: 'campaign_not_found' });
        const current = campaign.common_info;
        if (current?.ad_type !== 'manual') {
          return send(response, 400, { error: 'manual_campaign_required' });
        }
        if (action === 'change_roas_target' && current.bidding_method === 'auto') {
          return send(response, 400, { error: 'roas_target_unsupported_for_auto_bidding',
            message: '此活動使用 auto 競價，蝦皮不允許直接修改目標 ROAS。' });
        }
        if ((action === 'pause' && current.campaign_status !== 'ongoing')
          || (action === 'resume' && current.campaign_status !== 'paused')) {
          return send(response, 400, { error: 'invalid_campaign_status_for_action' });
        }
        if (body.expectedStatus !== current.campaign_status
          || Number(body.expectedBudget) !== Number(current.campaign_budget)
          || Number(body.expectedRoasTarget) !== Number(campaign.auto_bidding_info?.roas_target ?? 0)) {
          return send(response, 409, { error: 'campaign_changed', message: '活動設定已變更，請重新預覽。' });
        }
        const result = await ads.editManualProductAd(shopId, {
          campaignId,
          action,
          budget: action === 'change_budget' ? Number(body.budget) : undefined,
          roasTarget: action === 'change_roas_target' ? Number(body.roasTarget) : undefined,
          referenceId: body.referenceId,
        });
        return send(response, 200, { shopId: String(shopId), campaignId, action, result });
      }
      if (request.method === 'GET' && url.pathname === '/api/items') {
        return send(response, 200, await products.listItems(shopId, {
          statuses: url.searchParams.getAll('status').length ? url.searchParams.getAll('status') : ['NORMAL'],
          offset: Number(url.searchParams.get('offset') ?? 0),
          pageSize: Number(url.searchParams.get('pageSize') ?? 100),
        }));
      }
      if (request.method === 'GET' && url.pathname === '/api/ads') {
        return send(response, 200, await ads.listCampaignIds(shopId, {
          adType: url.searchParams.get('type') ?? 'all',
          offset: Number(url.searchParams.get('offset') ?? 0),
          limit: Number(url.searchParams.get('limit') ?? 5000),
        }));
      }
      if (request.method === 'GET' && url.pathname === '/api/ads/settings') {
        return send(response, 200, await ads.getCampaignSettings(shopId, ids(url.searchParams)));
      }
      if (request.method === 'GET' && url.pathname === '/api/ads/daily') {
        return send(response, 200, await ads.getDailyPerformance(shopId, {
          campaignIds: ids(url.searchParams),
          startDate: url.searchParams.get('startDate'),
          endDate: url.searchParams.get('endDate'),
        }));
      }
      if (request.method === 'GET' && url.pathname === '/api/ads/hourly') {
        return send(response, 200, await ads.getHourlyPerformance(shopId, {
          campaignIds: ids(url.searchParams),
          performanceDate: url.searchParams.get('date'),
        }));
      }
      return send(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof ShopAuthorizationError) {
        return send(response, 409, { error: error.code });
      }
      if (error instanceof ShopeeApiError) {
        const status = error.status >= 400 && error.status < 600 ? error.status : 502;
        return send(response, status, {
          error: error.code || 'shopee_api_error',
          message: error.message,
          requestId: error.requestId,
        });
      }
      if (error instanceof TypeError || error instanceof SyntaxError) {
        return send(response, 400, { error: 'invalid_request', message: error.message });
      }
      return send(response, 502, { error: 'gateway_error' });
    }
  });
}
