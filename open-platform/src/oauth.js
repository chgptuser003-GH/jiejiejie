import { ShopeeClient } from './client.js';

const AUTH_PATH = '/api/v2/shop/auth_partner';
const TOKEN_PATH = '/api/v2/auth/token/get';
const REFRESH_PATH = '/api/v2/auth/access_token/get';

export class ShopeeOAuth {
  constructor(client) {
    if (!(client instanceof ShopeeClient)) throw new TypeError('ShopeeClient required');
    this.client = client;
  }

  authorizationUrl(redirectUrl) {
    const redirect = new URL(redirectUrl);
    if (redirect.protocol !== 'https:') throw new TypeError('OAuth redirect must use HTTPS');
    return this.client.buildUrl(AUTH_PATH, { query: { redirect: redirect.href } });
  }

  async exchangeCode({ code, shopId }) {
    if (!code || !shopId) throw new TypeError('code and shopId are required');
    const payload = await this.client.request({
      path: TOKEN_PATH,
      method: 'POST',
      body: { code, shop_id: Number(shopId), partner_id: Number(this.client.partnerId) },
    });
    return this.#tokenRecord(payload, shopId);
  }

  async refresh({ refreshToken, shopId }) {
    if (!refreshToken || !shopId) throw new TypeError('refreshToken and shopId are required');
    const payload = await this.client.request({
      path: REFRESH_PATH,
      method: 'POST',
      body: { refresh_token: refreshToken, shop_id: Number(shopId), partner_id: Number(this.client.partnerId) },
    });
    return this.#tokenRecord(payload, shopId);
  }

  #tokenRecord(payload, shopId) {
    const accessToken = payload.access_token;
    const refreshToken = payload.refresh_token;
    if (!accessToken || !refreshToken) throw new Error('Shopee token response is missing tokens');
    if (Array.isArray(payload.shop_id_list)
      && !payload.shop_id_list.map(String).includes(String(shopId))) {
      throw new Error('authorized shop list does not include the requested shop');
    }
    const now = Math.floor(this.client.clock() / 1000);
    const expiresIn = Number(payload.expire_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error('Shopee token response has an invalid expiry');
    }
    return {
      shopId: String(shopId),
      accessToken,
      refreshToken,
      accessExpiresAt: now + Math.min(expiresIn, 4 * 3600),
      refreshExpiresAt: now + Number(payload.refresh_token_expire_in ?? 30 * 86400),
    };
  }
}
