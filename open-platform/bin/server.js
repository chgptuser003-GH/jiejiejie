import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { AdsService } from '../src/ads-service.js';
import { ShopeeClient } from '../src/client.js';
import { createGatewayServer } from '../src/gateway.js';
import { ShopeeOAuth } from '../src/oauth.js';
import { ProductService } from '../src/product-service.js';
import { ShopSession } from '../src/shop-session.js';
import { EncryptedTokenVault } from '../src/token-vault.js';

const env = process.env;
const required = ['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY', 'SHOPEE_SHOP_ID',
  'SHOPEE_REDIRECT_URL', 'SHOPEE_VAULT_KEY_BASE64'];
const missing = required.filter(name => !env[name]);
if (missing.length) {
  process.stderr.write(`Missing environment variables: ${missing.join(', ')}\n`);
  process.exit(1);
}

const client = new ShopeeClient({
  partnerId: env.SHOPEE_PARTNER_ID,
  partnerKey: env.SHOPEE_PARTNER_KEY,
  environment: 'sandbox',
});
const oauth = new ShopeeOAuth(client);
const vault = new EncryptedTokenVault({
  filePath: resolve(env.SHOPEE_VAULT_FILE ?? 'data/tokens.json'),
  encryptionKey: env.SHOPEE_VAULT_KEY_BASE64,
});
const session = new ShopSession({ client, oauth, vault });
const pairToken = env.SHOPEE_PAIR_TOKEN ?? randomBytes(24).toString('base64url');
const server = createGatewayServer({
  shopId: env.SHOPEE_SHOP_ID,
  pairToken,
  redirectUrl: env.SHOPEE_REDIRECT_URL,
  oauth,
  session,
  products: new ProductService(session),
  ads: new AdsService(session),
});
const port = Number(env.SHOPEE_LOCAL_PORT ?? 8787);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Shopee sandbox gateway: http://127.0.0.1:${port}\n`);
  process.stdout.write(`Extension pairing code: ${pairToken}\n`);
});
