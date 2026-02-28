# Rohlik Stats — Purchase Analytics for Rohlik.cz

## Project Description
A web app that analyzes Rohlik.cz purchase history and shows stats Rohlik doesn't provide: monthly spending trends, product category breakdowns, top products, price history. Users log in with Rohlik credentials (one-time use, not stored), the app downloads order history, processes it client-side, and displays a rich dashboard.

## Tech Stack
- **Framework**: Next.js 16+ (App Router) + TypeScript (strict)
- **Styling**: Tailwind CSS + custom CSS
- **Charts**: Chart.js + react-chartjs-2
- **Database**: Upstash Redis (shared instance, for caching product categories + saved stats permalinks)
- **Deployment**: Railway (Czech-friendly IPs — Rohlik throttles Vercel/datacenter IPs)
- **Testing**: Vitest

## Architecture

### Client-Side Data Orchestration
The browser drives the entire data fetch flow:
1. User enters Rohlik credentials → sent to `/api/proxy` for authentication
2. Browser fetches all order IDs via proxy
3. Browser batches order detail requests (10 per call) via proxy
4. Browser fetches product categories via `/api/categories` (Redis-cached)
5. All processing happens client-side in `lib/process-stats.ts`
6. Processed stats can be saved to Redis via `/api/save` → generates permalink

### Key Files
```
src/
├── app/
│   ├── page.tsx              — Landing page with login form
│   ├── stats/[id]/page.tsx   — Stats display page (permalink)
│   └── api/
│       ├── proxy/route.ts    — Proxy to Rohlik API (handles rate limiting)
│       ├── categories/route.ts — Bulk product category lookup (Redis cache)
│       ├── save/route.ts     — Save stats to Redis (30-day TTL)
│       └── stats/[id]/route.ts — Retrieve saved stats
├── components/
│   ├── Dashboard.tsx         — Main dashboard with tabs
│   ├── OverviewPage.tsx      — Monthly spending chart
│   ├── CategoriesPage.tsx    — Category breakdown
│   ├── ProductsPage.tsx      — Product list
│   └── ProductDetail.tsx     — Single product detail + price history
└── lib/
    ├── kv.ts                 — KV store (Redis prod / file-based local)
    ├── stats-types.ts        — TypeScript interfaces
    ├── process-stats.ts      — Stats processing logic
    └── rohlik-api.ts         — Rohlik API helpers
```

### Rate Limiting Strategy
Rohlik/Cloudflare aggressively rate-limits. Current mitigations:
- 750ms delay between batch requests
- Exponential backoff on 429s (30s + 15s * attempt, up to 5 retries)
- X-Forwarded-For header with client IP
- Browser-like User-Agent headers

### KV Store
- `lib/kv.ts` abstracts Redis vs local file storage
- Production: Uses `REDIS_URL` env var (standard Redis protocol)
- Local dev: File-based `.kv-local/` directory
- Current code uses the `redis` npm package (NOT `@upstash/redis`)

## Environment Variables Available
- `REDIS_URL` — Redis connection URL (for production KV store)
- `ROHLIK_EMAIL` — Rohlik account email (for testing)
- `ROHLIK_PASSWORD` — Rohlik account password (for testing)
- `NODE_ENV` — "development" or "production"
- `PORT` — Server port (default 3000)

## Current State
- All 25 tests passing (Vitest)
- Build succeeds
- Working on Vercel but Rohlik throttles Vercel IPs
- Needs migration to Railway for Czech-friendly IPs
- KV currently uses `redis` package with `REDIS_URL` — works with any Redis

## How to Work (Ralph Instructions)

1. Read `.ralph/fix_plan.md` at the start of each loop
2. Find the FIRST unchecked task (`- [ ]`)
3. Execute ONLY that one task
4. Mark it as done (`- [x]`)
5. Commit and push your changes
6. Report status

### Status Reporting
At the end of each loop, output:
```json
{
  "status": "complete|error|blocked",
  "task": "<task description>",
  "files_changed": ["<list of files>"],
  "next_task": "<next unchecked task>",
  "notes": "<any issues or decisions made>"
}
```

### Protected Files (do NOT modify)
- `.env`
- `.ralphrc`
- `.ralph/PROMPT.md`
- `.claude/settings.json`

### Key Principles
- TypeScript strict mode
- Don't break existing tests — run `npm test` after changes
- Keep the client-side orchestration pattern (browser drives fetches)
- Rate limiting is critical — never remove delays/backoff
- Credentials are NEVER stored — one-time use only
- Run `npm run build` to verify no TS errors before committing

## Git Remote
This project has a GitHub remote at github.com/kwaczek/rohlik-stats.
After completing each task, commit your changes and push to the remote:
  git add -A && git commit -m "<descriptive message>" && git push
