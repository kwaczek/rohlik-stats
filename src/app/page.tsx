'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

type Phase = 'idle' | 'loading' | 'error';

const SCREENSHOTS = [
  {
    src: '/screenshots/overview.png',
    alt: 'Prehled mesicnich utrat',
    title: 'Mesicni utraty',
    desc: 'Celkovy prehled kolik utracite za nakupy kazdy mesic',
    wide: true,
  },
  {
    src: '/screenshots/categories.png',
    alt: 'Kategorie produktu',
    title: 'Kategorie',
    desc: 'Rozdeleni utrat do kategorii s moznosti zanoreni',
    wide: false,
  },
  {
    src: '/screenshots/product-detail.png',
    alt: 'Detail produktu',
    title: 'Detail produktu',
    desc: 'Historie nakupu a ceny kazdeho produktu',
    wide: false,
  },
  {
    src: '/screenshots/price-trend.png',
    alt: 'Vyvoj ceny',
    title: 'Cenove trendy',
    desc: 'Jak se menila cena vasich oblibenych produktu v case',
    wide: true,
  },
];

// ---------------------------------------------------------------------------
// Client-side proxy helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;
const MAX_429_RETRIES = 5;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface ProxyResult {
  data: unknown;
  cookies?: string;
  status: number;
}

async function proxyCall(
  path: string,
  opts: { method?: string; body?: unknown; cookies?: string },
): Promise<ProxyResult> {
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        method: opts.method ?? 'GET',
        body: opts.body,
        cookies: opts.cookies,
      }),
    });

    if (res.status === 429) {
      // Wait and retry — Cloudflare rate limit
      const wait = 30 + attempt * 15;
      await sleep(wait * 1000);
      continue;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as Record<string, string>).error ?? `Proxy error ${res.status}`);
    }

    return (await res.json()) as ProxyResult;
  }
  throw new Error('Prilis mnoho pozadavku (429). Zkuste to pozdeji.');
}

// ---------------------------------------------------------------------------
// Client-side data processing (mirrors server-side processStats)
// ---------------------------------------------------------------------------

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  unitPrice: number;
  textualAmount: string;
}

interface ProductStats {
  n: string; ta: string; c0: string; c1: string; c2: string;
  ts: number; tq: number; to: number; ap: number; mp: number; xp: number;
  fd: string; ld: string;
  h: Record<string, [number, number, number]>;
}

interface StatsData {
  p: Record<string, ProductStats>;
  mo: Record<string, [number, number]>;
}

function r2(n: number) { return Math.round(n * 100) / 100; }
function toMonth(d: string) { return d.slice(0, 7); }

function processStats(
  orders: Record<string, { date: string; amount: number; items: OrderItem[] }>,
  categories: Record<string, { l1: string; l2: string; l3: string }>,
): StatsData {
  const p: Record<string, ProductStats> = {};
  const mo: Record<string, [number, number]> = {};
  const DEFAULT = { l1: 'Uncategorized', l2: '', l3: '' };

  for (const order of Object.values(orders)) {
    const month = toMonth(order.date);
    if (!mo[month]) mo[month] = [0, 0];
    mo[month][0] += 1;
    mo[month][1] += order.amount;

    const seen = new Set<string>();
    for (const item of order.items) {
      const pid = String(item.id);
      const cat = categories[pid] ?? DEFAULT;
      const up = item.unitPrice > 0 ? item.unitPrice : item.quantity > 0 ? item.price / item.quantity : 0;

      if (!p[pid]) {
        p[pid] = { n: item.name, ta: item.textualAmount, c0: cat.l1, c1: cat.l2, c2: cat.l3,
          ts: 0, tq: 0, to: 0, ap: 0, mp: Infinity, xp: -Infinity, fd: month, ld: month, h: {} };
      }
      const prod = p[pid];
      prod.tq += item.quantity;
      prod.ts += item.price;
      if (up < prod.mp) prod.mp = up;
      if (up > prod.xp) prod.xp = up;
      if (month < prod.fd) prod.fd = month;
      if (month > prod.ld) prod.ld = month;
      if (!prod.h[month]) prod.h[month] = [0, 0, 0];
      prod.h[month][0] += item.quantity;
      prod.h[month][1] += item.price;
      if (!seen.has(pid)) { seen.add(pid); prod.to += 1; prod.h[month][2] += 1; }
    }
  }

  for (const prod of Object.values(p)) {
    prod.ts = r2(prod.ts);
    prod.ap = prod.tq > 0 ? r2(prod.ts / prod.tq) : 0;
    if (!isFinite(prod.mp)) prod.mp = 0;
    if (!isFinite(prod.xp)) prod.xp = 0;
    prod.mp = r2(prod.mp);
    prod.xp = r2(prod.xp);
    for (const m of Object.keys(prod.h)) prod.h[m][1] = r2(prod.h[m][1]);
  }
  return { p, mo };
}

// ---------------------------------------------------------------------------
// Client-side fetch orchestration
// ---------------------------------------------------------------------------

type ProgressFn = (msg: string, pct: number) => void;

async function fetchAllData(
  email: string,
  password: string,
  onProgress: ProgressFn,
): Promise<StatsData> {
  // 1. Login
  onProgress('Prihlasovani...', 2);
  const loginRes = await proxyCall('/services/frontend-service/login', {
    method: 'POST',
    body: { email, password, name: '' },
  });

  if (!loginRes.data) {
    throw new Error('Rohlik server je momentalne nedostupny. Zkuste to pozdeji nebo z jineho pripojeni.');
  }

  const loginData = loginRes.data as { status: number; messages?: { content: string }[] };
  if (loginData.status === 401) {
    throw new Error('Neplatne prihlasovaci udaje. Zkontrolujte prosim svuj email a heslo.');
  }
  if (loginData.status !== 200) {
    throw new Error(loginData.messages?.[0]?.content ?? 'Prihlaseni selhalo');
  }

  const cookies = loginRes.cookies ?? '';

  // 2. Fetch all delivered orders (paginated)
  onProgress('Stahovani objednavek...', 5);
  const allOrders: Array<{
    id: string;
    orderTime: string;
    priceComposition: { total: { amount: number } };
  }> = [];
  let offset = 0;

  while (true) {
    const res = await proxyCall(
      `/api/v3/orders/delivered?offset=${offset}&limit=${PAGE_SIZE}`,
      { cookies },
    );
    if (!res.data) {
      if (allOrders.length === 0) {
        throw new Error('Rohlik server je momentalne nedostupny. Zkuste to pozdeji nebo z jineho pripojeni.');
      }
      break; // Got some orders before block — use what we have
    }
    const page = res.data as typeof allOrders;
    if (page.length === 0) break;
    allOrders.push(...page);
    onProgress(`Stahovani objednavek: ${allOrders.length}`, 5 + (allOrders.length / 10));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await sleep(1000);
  }

  // 3. Enrich orders with items (batched — 10 per proxy call)
  const ordersRecord: Record<string, { date: string; amount: number; items: OrderItem[] }> = {};
  const allProductIds = new Set<number>();
  const BATCH_SIZE = 10;

  for (let batchStart = 0; batchStart < allOrders.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, allOrders.length);
    const pct = 15 + (batchStart / allOrders.length) * 60;
    onProgress(`Zpracovani objednavek: ${batchStart}/${allOrders.length}`, pct);

    const batchPaths = allOrders
      .slice(batchStart, batchEnd)
      .map((o) => `/api/v3/orders/${o.id}`);

    // Batch proxy call with retry on rate limit
    let batchRes: { results?: Array<{ path: string; data: unknown; status: number }>; rateLimited?: boolean };

    for (let retry = 0; retry <= MAX_429_RETRIES; retry++) {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: batchPaths, cookies }),
      });
      batchRes = await res.json();

      if (batchRes.rateLimited) {
        const wait = 30 + retry * 15;
        onProgress(`Rohlik omezil pozadavky, cekam ${wait}s... (pokus ${retry + 1}/${MAX_429_RETRIES})`, pct);
        await sleep(wait * 1000);
        continue;
      }
      break;
    }

    // Process batch results
    for (let j = 0; j < (batchRes!.results?.length ?? 0); j++) {
      const order = allOrders[batchStart + j];
      const resultData = batchRes!.results![j].data;
      if (!resultData) continue; // Skip if Cloudflare blocked this individual request

      const detail = resultData as {
        items?: Array<{
          id: number;
          name: string;
          amount: number;
          priceComposition: { total: { amount: number }; unit: { amount: number } };
          textualAmount: string;
        }>;
      };

      const items: OrderItem[] = (detail.items ?? []).map((it) => {
        allProductIds.add(it.id);
        return {
          id: it.id,
          name: it.name,
          quantity: it.amount,
          price: it.priceComposition.total.amount,
          unitPrice: it.priceComposition.unit.amount,
          textualAmount: it.textualAmount,
        };
      });

      ordersRecord[order.id] = {
        date: order.orderTime,
        amount: order.priceComposition.total.amount,
        items,
      };
    }

    // Pause between batches to avoid Cloudflare rate limiting
    await sleep(2000);
  }

  // 4. Fetch product categories (with Redis caching — only uncached products hit Rohlik)
  let categories: Record<string, { l1: string; l2: string; l3: string }> = {};
  let remainingIds = Array.from(allProductIds);
  const CAT_BATCH_SIZE = 50; // Larger batches since most will be cache hits

  while (remainingIds.length > 0) {
    const batch = remainingIds.slice(0, CAT_BATCH_SIZE);
    const fetched = Object.keys(categories).length;
    const total = allProductIds.size;
    const pct = 75 + (fetched / Math.max(total, 1)) * 20;
    onProgress(`Stahovani kategorii: ${fetched}/${total}`, pct);

    for (let retry = 0; retry <= MAX_429_RETRIES; retry++) {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: batch, cookies }),
      });
      const data = await res.json();

      categories = { ...categories, ...data.categories };

      if (data.rateLimited) {
        const wait = 30 + retry * 15;
        onProgress(`Rohlik omezil pozadavky, cekam ${wait}s...`, pct);
        await sleep(wait * 1000);
        // Retry with only the remaining uncached IDs
        remainingIds = data.remaining ?? [];
        continue;
      }

      // Success — move to next batch
      remainingIds = remainingIds.slice(CAT_BATCH_SIZE);
      break;
    }
  }

  // 5. Logout (fire and forget)
  proxyCall('/services/frontend-service/logout', { method: 'POST', cookies }).catch(() => {});

  // 6. Process stats
  onProgress('Zpracovani statistik...', 97);
  return processStats(ordersRecord, categories);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState('');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const abortRef = useRef(false);

  const openLightbox = (idx: number) => setLightboxIdx(idx);
  const closeLightbox = () => setLightboxIdx(null);
  const prevImage = () =>
    setLightboxIdx((i) => (i !== null ? (i - 1 + SCREENSHOTS.length) % SCREENSHOTS.length : null));
  const nextImage = () =>
    setLightboxIdx((i) => (i !== null ? (i + 1) % SCREENSHOTS.length : null));

  useEffect(() => {
    if (lightboxIdx === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'ArrowRight') nextImage();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase('loading');
    setError('');
    abortRef.current = false;

    try {
      const stats = await fetchAllData(email, password, (msg, pct) => {
        if (abortRef.current) return;
        setProgress(msg);
        setProgressPct(Math.min(pct, 100));
      });

      // Save stats and get permalink
      setProgress('Ukladani...');
      setProgressPct(98);

      const saveRes = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stats),
      });
      const { url } = (await saveRes.json()) as { url: string };
      router.push(url);
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Neocekavana chyba');
    }
  }, [email, password, router]);

  return (
    <div className="landing">
      {/* Hero section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Rohlik<span>.cz</span> Stats</h1>
          <p className="hero-subtitle">
            Kompletni analyza vasich nakupu na Rohliku. Mesicni utraty, cenove trendy,
            top produkty, kategorie &mdash; vse na jednom miste.
          </p>
          <p className="hero-desc">
            Funkce, kterou Rohlik sam nenabizi. Prihlas se a behem minuty ziskas
            detailni prehled o svych nakupech.
          </p>
        </div>

        <div className="hero-form">
          <div className="landing-card">
            <h2>Zobrazit statistiky</h2>
            <p className="form-info">
              Pouzijte sve prihlasovaci udaje z <strong>Rohlik.cz</strong> &mdash;
              stejny email a heslo, kterym se prihlasujete do e-shopu.
            </p>

            {phase === 'idle' || phase === 'error' ? (
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Rohlik email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="vas@email.cz"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Rohlik heslo</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="submit-btn">
                  Analyzovat nakupy
                </button>
                {error && <div className="error-message">{error}</div>}
                <div className="form-hint">
                  Heslo se nikam neuklada. Pouzije se jednorazove pro stazeni dat z Rohliku.
                </div>
              </form>
            ) : (
              <div className="progress-wrap">
                <div className="progress-message">{progress}</div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${Math.max(progressPct, 2)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Screenshots showcase */}
      <section className="showcase">
        <h2>Co vsechno uvidite</h2>
        <div className="showcase-grid">
          {SCREENSHOTS.map((s, i) => (
            <div
              key={s.src}
              className={`showcase-item${s.wide ? ' showcase-item-wide' : ''}`}
              onClick={() => openLightbox(i)}
            >
              <Image
                src={s.src}
                alt={s.alt}
                width={s.wide ? 1200 : 800}
                height={s.wide ? (i === 0 ? 800 : 400) : (i === 2 ? 600 : 300)}
                className="showcase-img"
              />
              <div className="showcase-label">
                <strong>{s.title}</strong>
                <span>{s.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div className="lightbox" onClick={closeLightbox}>
          <button
            className="lightbox-close"
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
            aria-label="Zavrit"
          >
            &times;
          </button>
          <button
            className="lightbox-arrow lightbox-prev"
            onClick={(e) => { e.stopPropagation(); prevImage(); }}
            aria-label="Predchozi"
          >
            &#8249;
          </button>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <Image
              src={SCREENSHOTS[lightboxIdx].src}
              alt={SCREENSHOTS[lightboxIdx].alt}
              width={1400}
              height={900}
              className="lightbox-img"
            />
            <div className="lightbox-caption">
              <strong>{SCREENSHOTS[lightboxIdx].title}</strong>
              <span>{SCREENSHOTS[lightboxIdx].desc}</span>
              <span className="lightbox-counter">
                {lightboxIdx + 1} / {SCREENSHOTS.length}
              </span>
            </div>
          </div>
          <button
            className="lightbox-arrow lightbox-next"
            onClick={(e) => { e.stopPropagation(); nextImage(); }}
            aria-label="Dalsi"
          >
            &#8250;
          </button>
        </div>
      )}

      {/* Story section */}
      <section className="story">
        <h2>Proc tohle existuje</h2>
        <div className="story-content">
          <p>
            Jako pravidelny zakaznik Rohliku jsem chtel mit prehled o svych nakupech &mdash;
            kolik utracim mesicne, ktere produkty kupuju nejcasteji, jak se meni ceny v case.
            Jednoducha vec, kterou by slusny e-shop mel nabizet.
          </p>
          <p>
            Nekolikrat jsem kontaktoval zakaznicku podporu Rohliku s prosbou o tuto funkci.
            Pokazde prisla stejna odpoved: &bdquo;Dekujeme za podnet, predame vyvojovemu tymu.&ldquo;
            Pak nic. Zadna analyza. Zadne statistiky. Jen sliby.
          </p>
          <p>
            Tak jsem si to napsal sam. Nejdriv jako skript pro sebe, pak jako webovou aplikaci
            pro vsechny, kteri chteji vedet, kam jejich penize na Rohliku tečou.
          </p>
          <p>
            Aplikace pouziva vase prihlasovaci udaje <strong>jednorazove</strong> &mdash; jen pro stazeni
            objednavek pres Rohlik API. Heslo se nikde neuklada. Zpracovana data neobsahuji
            zadne osobni udaje. Kod je kompletne otevreny na GitHubu.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="how-it-works">
        <h2>Jak to funguje</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-text">
              <strong>Prihlaste se</strong>
              <span>Zadejte svoje Rohlik.cz prihlasovaci udaje</span>
            </div>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-text">
              <strong>Stazeni dat</strong>
              <span>Aplikace stahne historii vasich objednavek (muze trvat minutu)</span>
            </div>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-text">
              <strong>Analyza</strong>
              <span>Data se zpracuji do prehlednych grafu a tabulek</span>
            </div>
          </div>
          <div className="step">
            <div className="step-number">4</div>
            <div className="step-text">
              <strong>Permalink</strong>
              <span>Dostanete odkaz, na ktery se muzete kdykoliv vratit</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-links">
          <a href="https://github.com/kwaczek/rohlik-stats" target="_blank" rel="noopener">
            GitHub
          </a>
          <span className="footer-sep">&middot;</span>
          <span>Open source</span>
          <span className="footer-sep">&middot;</span>
          <span>Hesla se neukladaji</span>
        </div>
        <div className="footer-copy">
          Vytvoreno, protoze Rohlik tuto funkci nema a podpora ji opakovaně slibila.
          <br />
          Napsal jsem to sam s velkou pomoci{' '}
          <a href="https://claude.ai" target="_blank" rel="noopener">Claude</a>.
          What a time to be alive!
        </div>
      </footer>
    </div>
  );
}
