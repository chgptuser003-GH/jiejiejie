import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class EncryptedTokenVault {
  constructor({ filePath, encryptionKey }) {
    if (!filePath) throw new TypeError('filePath is required');
    const key = Buffer.isBuffer(encryptionKey) ? encryptionKey : Buffer.from(encryptionKey ?? '', 'base64');
    if (key.length !== 32) throw new TypeError('encryptionKey must be 32 bytes');
    this.filePath = filePath;
    this.key = key;
    this.pending = Promise.resolve();
  }

  async get(shopId) {
    const all = await this.#readAll();
    return all[String(shopId)] ?? null;
  }

  async put(record) {
    if (!record?.shopId || !record.accessToken || !record.refreshToken) {
      throw new TypeError('a complete per-shop token record is required');
    }
    const operation = this.pending.then(async () => {
      const all = await this.#readAll();
      all[String(record.shopId)] = record;
      await this.#writeAll(all);
    });
    this.pending = operation.catch(() => {});
    return operation;
  }

  async #readAll() {
    let data;
    try {
      data = JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
    if (data.version !== 1) throw new Error('unsupported token vault version');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(data.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(data.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  }

  async #writeAll(records) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(records), 'utf8'), cipher.final()]);
    const data = JSON.stringify({
      version: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    });
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, data, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporaryPath, this.filePath);
  }
}
