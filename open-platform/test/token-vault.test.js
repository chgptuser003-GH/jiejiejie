import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EncryptedTokenVault } from '../src/token-vault.js';

test('vault encrypts per-shop tokens and retains rotated credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shopee-vault-'));
  try {
    const filePath = join(dir, 'tokens.json');
    const vault = new EncryptedTokenVault({ filePath, encryptionKey: randomBytes(32) });
    const record = { shopId: '456', accessToken: 'secret-access', refreshToken: 'secret-refresh', accessExpiresAt: 1700014400 };
    await vault.put(record);
    assert.deepEqual(await vault.get('456'), record);
    assert.equal(await vault.get('789'), null);
    const onDisk = await readFile(filePath, 'utf8');
    assert.equal(onDisk.includes('secret-access'), false);
    await vault.put({ ...record, refreshToken: 'rotated-refresh' });
    assert.equal((await vault.get('456')).refreshToken, 'rotated-refresh');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
