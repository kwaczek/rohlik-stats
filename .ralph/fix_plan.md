# Rohlik Stats — Fix Plan

## Phase 1: Railway Migration
- [x] Create `Dockerfile` — multi-stage build: install deps, build Next.js, run production server with `npm start`. Expose PORT env var. Use Node 20 alpine base.
- [x] Create `railway.toml` — Railway deployment config with build command, start command, health check path `/api/health`.
- [x] Add health check endpoint `src/app/api/health/route.ts` — returns `{ status: "ok", timestamp }`. Simple GET endpoint.
- [x] Update `next.config.ts` — remove any Vercel-specific config (preferredRegion, etc.). Make it platform-agnostic. Set `output: "standalone"` for Docker deployment.
- [x] Update `src/app/api/proxy/route.ts` — remove Vercel-specific `preferredRegion` and `maxDuration` exports. These are Vercel-only and will error on Railway.
- [ ] Update `src/app/api/categories/route.ts` — remove Vercel-specific `preferredRegion` and `maxDuration` exports.
- [ ] Update any other API routes that use Vercel-specific exports — check `save/route.ts`, `stats/[id]/route.ts`, `generate/route.ts` for `preferredRegion` or `maxDuration` and remove them.

## Phase 2: Redis Migration
- [ ] Update `src/lib/kv.ts` — the current `RedisKV` class uses the `redis` npm package with `REDIS_URL`. Add support for Upstash Redis as an alternative: if `UPSTASH_REDIS_REST_URL` is set, use `@upstash/redis` REST client instead. Keep the `redis` package path as fallback for standard Redis. This lets us use the shared Upstash instance.
- [ ] Install `@upstash/redis` package — `npm install @upstash/redis`. Verify build still works.
- [ ] Run tests to verify KV changes don't break anything — `npm test`. Fix if needed.

## Phase 3: Local Testing
- [ ] Test the app locally with `npm run dev` — verify the landing page loads, login form works, and API routes respond. Check that the local file-based KV works (no Redis needed for dev).
- [ ] Test Rohlik API proxy locally — use the test credentials from `.env` to verify login flow works from localhost (no IP throttling). Document any issues in this task's notes.
- [ ] Test full stats generation flow locally — login, fetch orders, process stats, view dashboard. Verify all tabs work (Overview, Categories, Products). If Rohlik throttles even localhost, note the behavior.

## Phase 4: Deploy to Railway
- [ ] Deploy to Railway — connect the GitHub repo (kwaczek/rohlik-stats) to Railway. Set environment variables: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NODE_ENV=production`. Deploy and verify the app starts.
- [ ] Test deployed app — verify the landing page loads on the Railway URL. Test login flow. Check if Rohlik API calls work from Railway's IP (this is the key test — Railway should not be throttled like Vercel).
- [ ] Configure custom domain (if available) — add domain to Railway project if user has one. Otherwise skip.

## Phase 5: Polish
- [ ] Remove `.vercel/` directory and Vercel-specific files — clean up the project from Vercel deployment artifacts.
- [ ] Update README.md — update deployment instructions from Vercel to Railway. Update any references to Vercel KV.
- [ ] Run full test suite and build — `npm test && npm run build`. Ensure everything passes cleanly.
