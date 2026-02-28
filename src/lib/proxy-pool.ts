/**
 * Proxy pool manager — fetches proxies from Webshare API and rotates them.
 *
 * Caches proxy list in-memory for 5 minutes. Supports blacklisting failed proxies.
 * Falls back to null (direct fetch) if WEBSHARE_API_KEY is not set.
 */

interface WebshareProxy {
  proxy_address: string;
  port: number;
  username: string;
  password: string;
  country_code: string;
  valid: boolean;
}

interface WebshareResponse {
  count: number;
  results: WebshareProxy[];
}

export interface ProxyInfo {
  url: string;
  address: string;
  country: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BLACKLIST_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedProxies: WebshareProxy[] = [];
let cacheTimestamp = 0;

const blacklist = new Map<string, number>(); // address -> blacklisted-at timestamp

async function fetchProxies(): Promise<WebshareProxy[]> {
  const apiKey = process.env.WEBSHARE_API_KEY;
  if (!apiKey) return [];

  const res = await fetch(
    'https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=100',
    {
      headers: { Authorization: `Token ${apiKey}` },
    },
  );

  if (!res.ok) {
    console.error(`[proxy-pool] Webshare API error: ${res.status} ${res.statusText}`);
    return cachedProxies; // return stale cache on error
  }

  const data = (await res.json()) as WebshareResponse;
  return data.results.filter((p) => p.valid);
}

async function getProxies(): Promise<WebshareProxy[]> {
  const now = Date.now();
  if (cachedProxies.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProxies;
  }

  cachedProxies = await fetchProxies();
  cacheTimestamp = now;
  return cachedProxies;
}

function cleanBlacklist(): void {
  const now = Date.now();
  for (const [address, timestamp] of blacklist) {
    if (now - timestamp > BLACKLIST_TTL_MS) {
      blacklist.delete(address);
    }
  }
}

export async function getRandomProxy(): Promise<ProxyInfo | null> {
  const apiKey = process.env.WEBSHARE_API_KEY;
  if (!apiKey) return null;

  const proxies = await getProxies();
  if (proxies.length === 0) return null;

  cleanBlacklist();

  let available = proxies.filter((p) => !blacklist.has(p.proxy_address));

  // If all proxies are blacklisted, clear and retry
  if (available.length === 0) {
    blacklist.clear();
    available = proxies;
  }

  const proxy = available[Math.floor(Math.random() * available.length)];
  return {
    url: `http://${proxy.username}:${proxy.password}@${proxy.proxy_address}:${proxy.port}`,
    address: proxy.proxy_address,
    country: proxy.country_code,
  };
}

export function markProxyFailed(address: string): void {
  blacklist.set(address, Date.now());
}

export async function getProxyCount(): Promise<number> {
  const proxies = await getProxies();
  return proxies.length;
}
