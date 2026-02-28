import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { getRandomProxy, markProxyFailed } from '@/lib/proxy-pool';

export const runtime = 'nodejs';

const BASE_URL = 'https://www.rohlik.cz';
const INTERNAL_DELAY_MS = 750;
const MAX_PROXY_RETRIES = 3;

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

async function rohlikFetch(
  path: string,
  method: string,
  cookies: string,
  clientIp?: string,
  body?: unknown,
): Promise<{ data: unknown; cookies: string; status: number; error?: string }> {
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    'Content-Type': 'application/json',
  };
  if (cookies) headers['Cookie'] = cookies;
  if (clientIp) headers['X-Forwarded-For'] = clientIp;

  const url = `${BASE_URL}${path}`;
  const fetchOptions: Record<string, unknown> = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };

  // Try with proxy rotation (up to MAX_PROXY_RETRIES), then fall back to direct
  for (let attempt = 0; attempt <= MAX_PROXY_RETRIES; attempt++) {
    const proxy = await getRandomProxy();

    let response: Response;
    if (proxy) {
      try {
        const agent = new ProxyAgent(proxy.url);
        const undiciResponse = await undiciFetch(url, {
          ...fetchOptions,
          dispatcher: agent,
        } as Parameters<typeof undiciFetch>[1]);
        // Convert undici response to standard Response
        const responseBody = await undiciResponse.text();
        const responseHeaders = new Headers();
        for (const [key, value] of undiciResponse.headers) {
          responseHeaders.append(key, value);
        }
        response = new Response(responseBody, {
          status: undiciResponse.status,
          statusText: undiciResponse.statusText,
          headers: responseHeaders,
        });
      } catch (err) {
        // Network error with this proxy — blacklist and retry
        console.error(`[proxy] Proxy ${proxy.address} (${proxy.country}) failed:`, err);
        markProxyFailed(proxy.address);
        if (attempt < MAX_PROXY_RETRIES) continue;
        // All retries exhausted — fall back to direct fetch
        response = await fetch(url, {
          ...fetchOptions,
          redirect: 'manual',
        } as RequestInit);
      }
    } else {
      // No proxy available — direct fetch (local dev)
      response = await fetch(url, {
        ...fetchOptions,
        redirect: 'manual',
      } as RequestInit);
    }

    const setCookies = response.headers.getSetCookie();
    const newCookies = setCookies.map((h) => h.split(';')[0].trim()).join('; ');

    if (response.status === 429) {
      return { data: null, cookies: newCookies, status: 429 };
    }

    const ct = response.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      // Cloudflare block — blacklist this proxy and retry with a different one
      if (proxy && attempt < MAX_PROXY_RETRIES) {
        console.warn(`[proxy] Cloudflare blocked proxy ${proxy.address} (${proxy.country}), retrying...`);
        markProxyFailed(proxy.address);
        continue;
      }
      return { data: null, cookies: newCookies, status: response.status, error: 'cloudflare_blocked' };
    }

    const data = await response.json();
    return { data, cookies: newCookies || cookies, status: response.status };
  }

  // Should not reach here, but safety fallback
  return { data: null, cookies, status: 503, error: 'all_proxies_failed' };
}

/**
 * Proxy to Rohlik API.
 *
 * Supports single requests and batch mode for order details.
 * Batch mode fetches multiple paths in sequence with internal delays,
 * reducing the number of function invocations and Cloudflare scrutiny.
 */
export async function POST(req: NextRequest) {
  const payload = await req.json() as {
    // Single request
    path?: string;
    method?: string;
    body?: unknown;
    cookies?: string;
    // Batch mode: fetch multiple paths in one call
    batch?: string[];
  };

  const cookies = payload.cookies ?? '';

  // Forward client IP so Cloudflare sees a residential Czech IP, not datacenter
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined;

  // Batch mode — fetch multiple order details in sequence
  if (payload.batch) {
    const results: Array<{ path: string; data: unknown; status: number }> = [];
    let currentCookies = cookies;

    for (let i = 0; i < payload.batch.length; i++) {
      if (i > 0) await sleep(INTERNAL_DELAY_MS);

      const path = payload.batch[i];
      const result = await rohlikFetch(path, 'GET', currentCookies, clientIp);

      if (result.status === 429) {
        // Return partial results + flag that we got rate-limited
        return NextResponse.json({
          results,
          rateLimited: true,
          rateLimitedAt: i,
          cookies: currentCookies,
        });
      }

      if (result.cookies) currentCookies = result.cookies;
      results.push({ path, data: result.data, status: result.status });
    }

    return NextResponse.json({ results, cookies: currentCookies });
  }

  // Single request mode
  const result = await rohlikFetch(
    payload.path!,
    payload.method ?? 'GET',
    cookies,
    clientIp,
    payload.body,
  );

  if (result.status === 429) {
    return NextResponse.json(
      { error: 'rate_limited', status: 429 },
      { status: 429 },
    );
  }

  return NextResponse.json({
    data: result.data,
    cookies: result.cookies || undefined,
    status: result.status,
    ...(result.error ? { error: result.error } : {}),
  });
}
