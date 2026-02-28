# Rohlik Stats

Purchase analytics for [Rohlik.cz](https://www.rohlik.cz) — see the stats Rohlik doesn't show you: monthly spending trends, product category breakdowns, top products, and price history.

## How It Works

1. Enter your Rohlik credentials (used once to fetch data, never stored)
2. The app downloads your full order history via a server-side proxy
3. All data processing happens in your browser
4. View your dashboard with spending charts, category breakdowns, and product details
5. Optionally save and share your stats via a permalink

## Tech Stack

- **Framework**: Next.js 16+ (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Chart.js + react-chartjs-2
- **Database**: Upstash Redis (caching categories + saved stats permalinks)
- **Deployment**: Railway

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No Redis needed for local dev — the app uses file-based storage in `.kv-local/`.

### Environment Variables

Create a `.env` file:

```
# Optional — for testing the login flow locally
ROHLIK_EMAIL=your@email.com
ROHLIK_PASSWORD=yourpassword

# Optional — for Redis in dev (otherwise uses file-based KV)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

## Testing

```bash
npm test
```

## Deployment (Railway)

The app is deployed on Railway using Docker.

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and link to the project
railway login
railway link

# Set environment variables
railway variables set UPSTASH_REDIS_REST_URL=...
railway variables set UPSTASH_REDIS_REST_TOKEN=...
railway variables set NODE_ENV=production
railway variables set PORT=3000

# Deploy
railway up

# Get the public URL
railway domain
```

### Key Files

- `Dockerfile` — Multi-stage Node 20 Alpine build
- `railway.toml` — Railway deployment config with health check

## Architecture

The browser drives the entire data flow:

1. **Login**: Credentials sent to `/api/proxy` which authenticates with Rohlik
2. **Fetch orders**: Browser fetches order IDs, then batches detail requests (10/call) via proxy
3. **Categories**: Fetched via `/api/categories` (Redis-cached)
4. **Processing**: All stats computed client-side in `lib/process-stats.ts`
5. **Save/Share**: Stats saved to Redis via `/api/save`, generating a permalink

### Rate Limiting

Rohlik's Cloudflare aggressively rate-limits. Mitigations:
- 750ms delay between batch requests
- Exponential backoff on 429s (30s + 15s * attempt, up to 5 retries)
- Browser-like User-Agent headers
