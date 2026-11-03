export class ShopAuthorizationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ShopAuthorizationError';
    this.code = code;
  }
}

export class ShopSession {
  constructor({ client, oauth, vault, refreshBeforeSeconds = 300 }) {
    if (!client || !oauth || !vault) throw new TypeError('client, oauth and vault are required');
    this.client = client;
    this.oauth = oauth;
    this.vault = vault;
    this.refreshBeforeSeconds = refreshBeforeSeconds;
    this.refreshing = new Map();
  }

  async authorize({ code, shopId }) {
    const record = await this.oauth.exchangeCode({ code, shopId });
    await this.vault.put(record);
    return { shopId: record.shopId, accessExpiresAt: record.accessExpiresAt };
  }

  async accessTokenFor(shopId) {
    const id = String(shopId);
    const record = await this.vault.get(id);
    if (!record) throw new ShopAuthorizationError('shop_authorization_required');
    const now = Math.floor(this.client.clock() / 1000);
    if (record.accessExpiresAt > now + this.refreshBeforeSeconds) return record.accessToken;
    if (record.refreshExpiresAt && record.refreshExpiresAt <= now) {
      throw new ShopAuthorizationError('shop_authorization_expired');
    }
    if (!this.refreshing.has(id)) {
      const task = (async () => {
        const next = await this.oauth.refresh({ refreshToken: record.refreshToken, shopId: id });
        await this.vault.put(next);
        return next.accessToken;
      })();
      this.refreshing.set(id, task);
      task.finally(() => { if (this.refreshing.get(id) === task) this.refreshing.delete(id); }).catch(() => {});
    }
    return this.refreshing.get(id);
  }

  async request(shopId, options) {
    const accessToken = await this.accessTokenFor(shopId);
    return this.client.request({ ...options, accessToken, shopId });
  }
}
