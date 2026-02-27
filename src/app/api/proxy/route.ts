import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const preferredRegion = 'fra1';

const BASE_URL = 'https://www.rohlik.cz';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
  Referer: 'https://www.rohlik.cz/',
  Origin: 'https://www.rohlik.cz',
};

/**
 * Thin proxy to Rohlik API. Each call is one request — no timeout issues.
 * The browser orchestrates the full flow with delays.
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    path: string;
    method?: string;
    body?: unknown;
    cookies?: string;
  };

  const url = `${BASE_URL}${body.path}`;
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    'Content-Type': 'application/json',
  };

  if (body.cookies) {
    headers['Cookie'] = body.cookies;
  }

  const response = await fetch(url, {
    method: body.method ?? 'GET',
    headers,
    body: body.body ? JSON.stringify(body.body) : undefined,
    redirect: 'manual',
  });

  // Capture Set-Cookie headers and return them as JSON
  const setCookies = response.headers.getSetCookie();
  const cookies = setCookies
    .map((h) => h.split(';')[0].trim())
    .join('; ');

  const contentType = response.headers.get('content-type') ?? '';

  if (response.status === 429) {
    return NextResponse.json(
      { error: 'rate_limited', status: 429 },
      { status: 429 },
    );
  }

  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: 'non_json', status: response.status },
      { status: 502 },
    );
  }

  const data = await response.json();
  return NextResponse.json({
    data,
    cookies: cookies || undefined,
    status: response.status,
  });
}
