import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

export const runtime = 'nodejs';
export const preferredRegion = 'fra1';
export const maxDuration = 60;

const BASE_URL = 'https://www.rohlik.cz';
const INTERNAL_DELAY_MS = 750;
const CACHE_TTL = 90 * 24 * 60 * 60; // 90 days — categories rarely change

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
  Referer: 'https://www.rohlik.cz/',
  Origin: 'https://www.rohlik.cz',
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Bulk category lookup with Redis caching.
 *
 * Accepts { productIds: number[], cookies: string }
 * Returns { categories: Record<string, { l1, l2, l3 }> }
 *
 * Checks Redis first, only fetches from Rohlik for cache misses.
 * This dramatically reduces API calls since product categories rarely change.
 */
export async function POST(req: NextRequest) {
  const { productIds, cookies } = (await req.json()) as {
    productIds: number[];
    cookies: string;
  };

  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined;

  // 1. Check Redis cache for all product IDs
  const cacheKeys = productIds.map((pid) => `cat:${pid}`);
  let cached: ({ l1: string; l2: string; l3: string } | null)[];
  try {
    cached = await kv.mget<{ l1: string; l2: string; l3: string }>(cacheKeys);
  } catch {
    // Redis unavailable — treat all as cache misses
    cached = productIds.map(() => null);
  }

  const result: Record<string, { l1: string; l2: string; l3: string }> = {};
  const missingIds: number[] = [];
  const missingIndices: number[] = [];

  for (let i = 0; i < productIds.length; i++) {
    if (cached[i]) {
      result[String(productIds[i])] = cached[i]!;
    } else {
      missingIds.push(productIds[i]);
      missingIndices.push(i);
    }
  }

  // 2. Fetch cache misses from Rohlik API
  const toCache: Array<{ key: string; value: unknown; ex: number }> = [];

  for (let i = 0; i < missingIds.length; i++) {
    if (i > 0) await sleep(INTERNAL_DELAY_MS);

    const pid = missingIds[i];
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      'Content-Type': 'application/json',
    };
    if (cookies) headers['Cookie'] = cookies;
    if (clientIp) headers['X-Forwarded-For'] = clientIp;

    try {
      const response = await fetch(
        `${BASE_URL}/api/v1/products/${pid}/categories`,
        { headers, redirect: 'manual' },
      );

      if (response.status === 429) {
        // Return what we have so far + list of remaining IDs
        // Save what we've collected to cache before returning
        if (toCache.length > 0) {
          try { await kv.mset(toCache); } catch { /* ignore */ }
        }

        return NextResponse.json({
          categories: result,
          remaining: missingIds.slice(i),
          rateLimited: true,
        });
      }

      if (response.status === 404) {
        const cat = { l1: 'Discontinued', l2: '', l3: '' };
        result[String(pid)] = cat;
        toCache.push({ key: `cat:${pid}`, value: cat, ex: CACHE_TTL });
        continue;
      }

      const ct = response.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) continue;

      const data = (await response.json()) as {
        categories?: Array<{ level: number; name: string }>;
      };
      const cats = data.categories ?? [];
      const cat = {
        l1: cats.find((c) => c.level === 1)?.name ?? '',
        l2: cats.find((c) => c.level === 2)?.name ?? '',
        l3: cats.find((c) => c.level === 3)?.name ?? '',
      };
      result[String(pid)] = cat;
      toCache.push({ key: `cat:${pid}`, value: cat, ex: CACHE_TTL });
    } catch {
      // Skip failed product, continue with others
      continue;
    }
  }

  // 3. Save newly fetched categories to Redis cache
  if (toCache.length > 0) {
    try { await kv.mset(toCache); } catch { /* ignore cache write errors */ }
  }

  return NextResponse.json({ categories: result });
}
