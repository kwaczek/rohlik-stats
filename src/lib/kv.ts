/**
 * KV store abstraction.
 *
 * In production (when REDIS_URL is set), uses Upstash Redis.
 * In local development, uses a simple file-based store in .kv-local/.
 */

import * as fs from 'fs';
import * as path from 'path';

interface KVStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<void>;
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
    // Replace special chars for filesystem safety
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dir, `${safeKey}.json`);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const fp = this.filePath(key);
    if (!fs.existsSync(fp)) return null;

    try {
      const raw = fs.readFileSync(fp, 'utf-8');
      const entry = JSON.parse(raw);

      // Check TTL expiry
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
}

/** Lazy-loaded Upstash Redis for production */
let _redis: KVStore | null = null;

async function getRedis(): Promise<KVStore> {
  if (!_redis) {
    // @upstash/redis fromEnv() reads UPSTASH_REDIS_REST_URL / KV_REST_API_URL
    const mod = await import('@upstash/redis');
    const client = mod.Redis.fromEnv();
    _redis = {
      get: async <T = unknown>(key: string) => {
        const val = await client.get<T>(key);
        return val ?? null;
      },
      set: async (key: string, value: unknown, options?: { ex?: number }) => {
        if (options?.ex) {
          await client.set(key, value, { ex: options.ex });
        } else {
          await client.set(key, value);
        }
      },
    };
  }
  return _redis;
}

/** Exported KV instance — automatically picks local or Redis based on env */
function createKV(): KVStore {
  const isLocal = !process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL;

  if (isLocal) {
    return new LocalKV();
  }

  // Return a proxy that lazy-loads Redis
  return {
    get: async <T = unknown>(key: string) => {
      const store = await getRedis();
      return store.get<T>(key);
    },
    set: async (key: string, value: unknown, options?: { ex?: number }) => {
      const store = await getRedis();
      return store.set(key, value, options);
    },
  };
}

export const kv = createKV();
