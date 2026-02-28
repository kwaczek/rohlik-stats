/**
 * KV store abstraction.
 *
 * Priority order:
 * 1. Upstash Redis (when UPSTASH_REDIS_REST_URL is set) — REST-based, works everywhere
 * 2. Standard Redis (when REDIS_URL is set) — TCP-based via `redis` package
 * 3. Local file-based store — for development without any Redis
 */

import * as fs from 'fs';
import * as path from 'path';

interface KVStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<void>;
  mget<T = unknown>(keys: string[]): Promise<(T | null)[]>;
  mset(entries: Array<{ key: string; value: unknown; ex?: number }>): Promise<void>;
}

/** File-based KV for local development */
class LocalKV implements KVStore {
  private dir: string;

  constructor() {
    this.dir = path.join(process.cwd(), '.kv-local');
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  private filePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dir, `${safeKey}.json`);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const fp = this.filePath(key);
    if (!fs.existsSync(fp)) return null;

    try {
      const raw = fs.readFileSync(fp, 'utf-8');
      const entry = JSON.parse(raw);

      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        fs.unlinkSync(fp);
        return null;
      }

      return entry.value as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    const fp = this.filePath(key);
    const entry: { value: unknown; expiresAt?: number } = { value };
    if (options?.ex) {
      entry.expiresAt = Date.now() + options.ex * 1000;
    }
    fs.writeFileSync(fp, JSON.stringify(entry));
  }

  async mget<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map((k) => this.get<T>(k)));
  }

  async mset(entries: Array<{ key: string; value: unknown; ex?: number }>): Promise<void> {
    for (const e of entries) {
      await this.set(e.key, e.value, e.ex ? { ex: e.ex } : undefined);
    }
  }
}

/** Upstash Redis KV — REST-based, no persistent connections needed */
class UpstashKV implements KVStore {
  private async getClient() {
    const { Redis } = await import('@upstash/redis');
    return new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const client = await this.getClient();
    const val = await client.get<T>(key);
    return val ?? null;
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    const client = await this.getClient();
    if (options?.ex) {
      await client.set(key, value, { ex: options.ex });
    } else {
      await client.set(key, value);
    }
  }

  async mget<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const client = await this.getClient();
    const values = await client.mget<T[]>(...keys);
    return values.map((v) => v ?? null);
  }

  async mset(entries: Array<{ key: string; value: unknown; ex?: number }>): Promise<void> {
    if (entries.length === 0) return;
    const client = await this.getClient();
    const pipeline = client.pipeline();
    for (const e of entries) {
      if (e.ex) {
        pipeline.set(e.key, e.value, { ex: e.ex });
      } else {
        pipeline.set(e.key, e.value);
      }
    }
    await pipeline.exec();
  }
}

/** Redis KV — creates a fresh connection per operation for serverless safety */
class RedisKV implements KVStore {
  private async withClient<R>(fn: (client: import('redis').RedisClientType) => Promise<R>): Promise<R> {
    const { createClient } = await import('redis');
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    try {
      return await fn(client as import('redis').RedisClientType);
    } finally {
      await client.disconnect();
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return this.withClient(async (client) => {
      const val = await client.get(key);
      if (val === null) return null;
      try {
        return JSON.parse(val) as T;
      } catch {
        return val as unknown as T;
      }
    });
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    return this.withClient(async (client) => {
      const serialized = JSON.stringify(value);
      if (options?.ex) {
        await client.set(key, serialized, { EX: options.ex });
      } else {
        await client.set(key, serialized);
      }
    });
  }

  async mget<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    return this.withClient(async (client) => {
      const values = await client.mGet(keys);
      return values.map((v) => {
        if (v === null) return null;
        try { return JSON.parse(v) as T; }
        catch { return v as unknown as T; }
      });
    });
  }

  async mset(entries: Array<{ key: string; value: unknown; ex?: number }>): Promise<void> {
    if (entries.length === 0) return;
    return this.withClient(async (client) => {
      const pipeline = client.multi();
      for (const e of entries) {
        const serialized = JSON.stringify(e.value);
        if (e.ex) {
          pipeline.set(e.key, serialized, { EX: e.ex });
        } else {
          pipeline.set(e.key, serialized);
        }
      }
      await pipeline.exec();
    });
  }
}

/** Exported KV instance — picks Upstash, standard Redis, or local file store */
function createKV(): KVStore {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashKV();
  }
  if (process.env.REDIS_URL) {
    return new RedisKV();
  }
  return new LocalKV();
}

export const kv = createKV();
