import { createHmac } from 'node:crypto';

const DEFAULT_HOSTS = Object.freeze({
  sandbox: 'https://openplatform.sandbox.test-stable.shopee.sg',
  production: 'https://partner.shopeemobile.com',
});

export class ShopeeApiError extends Error {
  constructor(message, { status, code, requestId } = {}) {
    super(message);
    this.name = 'ShopeeApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function required(value, name) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new TypeError(`${name} is required`);
  }
  return String(value);
}

function apiPath(path) {
  if (typeof path !== 'string' || !/^\/api\/v2\/[a-z0-9_/-]+$/i.test(path)) {
    throw new TypeError('path must be an /api/v2/ endpoint path');
  }
  return path;
}

export function signRequest({ partnerId, partnerKey, path, timestamp, accessToken, shopId }) {
  const partner = required(partnerId, 'partnerId');
  const key = required(partnerKey, 'partnerKey');
  const target = apiPath(path);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new TypeError('timestamp must be a positive Unix second');
  }
  const hasShop = accessToken !== undefined || shopId !== undefined;
  if (hasShop && (accessToken === undefined || shopId === undefined)) {
    throw new TypeError('accessToken and shopId must be provided together');
  }
  const base = `${partner}${target}${timestamp}${hasShop ? `${required(accessToken, 'accessToken')}${required(shopId, 'shopId')}` : ''}`;
  return createHmac('sha256', key).update(base, 'utf8').digest('hex');
}

export class ShopeeClient {
  constructor({ partnerId, partnerKey, environment = 'sandbox', host, fetchImpl = fetch, clock = Date.now }) {
    this.partnerId = required(partnerId, 'partnerId');
    this.partnerKey = required(partnerKey, 'partnerKey');
    this.host = host ?? DEFAULT_HOSTS[environment];
    if (!this.host || !/^https:\/\//.test(this.host)) throw new TypeError('A supported HTTPS host is required');
    this.fetchImpl = fetchImpl;
    this.clock = clock;
  }

  buildUrl(path, { query = {}, accessToken, shopId } = {}) {
    const target = apiPath(path);
    const timestamp = Math.floor(this.clock() / 1000);
    const sign = signRequest({
      partnerId: this.partnerId,
      partnerKey: this.partnerKey,
      path: target,
      timestamp,
      accessToken,
      shopId,
    });
    const url = new URL(target, this.host);
    url.searchParams.set('partner_id', this.partnerId);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);
    if (accessToken !== undefined) {
      url.searchParams.set('access_token', required(accessToken, 'accessToken'));
      url.searchParams.set('shop_id', required(shopId, 'shopId'));
    }
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (['partner_id', 'timestamp', 'sign', 'access_token', 'shop_id'].includes(key)) {
        throw new TypeError(`reserved query parameter: ${key}`);
      }
      for (const entry of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(key, String(entry));
      }
    }
    return url;
  }

  async request({ path, method = 'GET', query, body, accessToken, shopId, signal }) {
    const verb = method.toUpperCase();
    if (!['GET', 'POST'].includes(verb)) throw new TypeError('Shopee API method must be GET or POST');
    if (verb === 'GET' && body !== undefined) throw new TypeError('GET cannot include a request body');
    const url = this.buildUrl(path, { query, accessToken, shopId });
    const response = await this.fetchImpl(url, {
      method: verb,
      headers: verb === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: verb === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      signal,
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new ShopeeApiError(payload.message || payload.error || `HTTP ${response.status}`, {
        status: response.status,
        code: payload.error,
        requestId: payload.request_id,
      });
    }
    return payload;
  }
}
