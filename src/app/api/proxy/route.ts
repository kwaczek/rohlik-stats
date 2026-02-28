import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BASE_URL = 'https://www.rohlik.cz';
const INTERNAL_DELAY_MS = 750;

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

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  const setCookies = response.headers.getSetCookie();
  const newCookies = setCookies.map((h) => h.split(';')[0].trim()).join('; ');

  if (response.status === 429) {
    return { data: null, cookies: newCookies, status: 429 };
  }

  const ct = response.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return { data: null, cookies: newCookies, status: response.status, error: 'cloudflare_blocked' };
  }

  const data = await response.json();
  return { data, cookies: newCookies || cookies, status: response.status };
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
